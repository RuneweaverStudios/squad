#!/bin/bash
#
# Claude Code Global Statusline
# Canonical source: ~/code/jat/.claude/statusline.sh
# Installed to: ~/.claude/statusline.sh (global, works across all projects)
#
# Multi-line status display for agent orchestration workflows
#
# Line 1: Agent Name · [Priority] Task ID - Task Title ⏲ ActiveTime
# Line 2: ▪▪▪▪▪▪▫▫▫▫ · ⎇ folder@branch · 🔒 N  📬 N  ⏱ Xm
# Line 3: 💬 Xm Last user prompt...
#
# Features:
#   Agent Status (Line 1):
#     1. Agent identification (set by /jat:start via .claude/agent-{session_id}.txt)
#     2. Task priority badge [P0/P1/P2] with color coding (Red/Yellow/Green)
#     3. Task ID and title from Beads database (dynamic project prefix)
#     4. Active time on task (⏲ since updated_at)
#
#   Context & Git (Line 2):
#     5. Context remaining as battery bar (color-coded: >50% green, >25% yellow, <25% red)
#     6. Git branch display: folder@branch (folder=blue, @=dim, branch=green, *=red)
#     7. File lock count indicator (🔒N)
#     8. Unread messages count (📬N)
#     9. Time remaining on shortest lock (⏱Xm or Xh)
#    10. Task progress percentage if available (N%)
#    11. Blocked-by count (⛔N) - tasks waiting on current task
#
#   Last Prompt (Line 3):
#    12. Last user prompt from transcript (truncated to 200 chars)
#    13. Last activity timestamp (🕐) - time since prompt was sent
#
# Color Scheme (ANSI escape codes):
#   Agent name:     Bold Blue   (\033[1m\033[0;34m)
#   Project folder: Blue        (\033[0;34m)
#   @ separator:    Dim Gray    (\033[0;90m)
#   Git branch:     Green       (\033[0;32m)
#   Dirty (*):      Red         (\033[0;31m)
#   Priority P0:    Bold Red    (\033[1m\033[0;31m)
#   Priority P1:    Bold Yellow (\033[1m\033[1;33m)
#   Priority P2:    Bold Green  (\033[1m\033[0;32m)
#   Task ID:        Green       (\033[0;32m)
#   Task title:     Yellow      (\033[1;33m)
#   Idle status:    Gray        (\033[0;37m)
#
# Example output:
#   GreatWind · [P1] 🔧 jat-4p0 - Demo: Frontend... ⏲ 1h23m
#   ▪▪▪▪▪▪▫▫▫▫ · ⎇ jat@master* · 🔒 2  📬 1  ⏱ 45m
#   💬 12m yes implement top 3
#
#   chimaro · no agent registered (new session, run /jat:start)
#   ▪▪▪▪▪▪▪▪▪▫ · ⎇ chimaro@main
#

# ANSI color codes
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
DIM='\033[0;90m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
RESET='\033[0m'
BOLD='\033[1m'

# ============================================================================
# CACHING LAYER
# ============================================================================
# Cache expensive queries (bd list, am-reservations, am-inbox) to reduce
# statusline render latency from ~300ms to ~5ms for cached hits.
#
# Cache files stored in /tmp with TTL-based invalidation.
# Format: /tmp/statusline-cache-{agent}-{type}.{ext}
# ============================================================================

CACHE_TTL_SECONDS=10  # How long cache entries remain valid

# Get cached value or run command and cache result
# Usage: cache_get_or_run "cache_key" "command to run"
# Returns cached value if fresh, otherwise runs command and caches result
cache_get_or_run() {
    local cache_key="$1"
    local command="$2"
    local cache_file="/tmp/statusline-cache-${cache_key}"

    # Check if cache exists and is fresh
    if [[ -f "$cache_file" ]]; then
        local cache_age=$(($(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || echo "0")))
        if [[ $cache_age -lt $CACHE_TTL_SECONDS ]]; then
            # Cache hit - return cached value
            cat "$cache_file"
            return 0
        fi
    fi

    # Cache miss or stale - run command and cache result
    local result
    result=$(eval "$command" 2>/dev/null)
    echo "$result" > "$cache_file" 2>/dev/null
    echo "$result"
}

# Read JSON from stdin (provided by Claude Code)
json_input=$(cat)

# Debug logging (only if --debug flag is passed via settings.json)
if [[ "$1" == "--debug" ]]; then
    debug_log="/tmp/claude-statusline-debug.log"
    {
        echo "=== Statusline Debug $(date) ==="
        echo "$json_input" | jq '.'
        echo ""
    } >> "$debug_log"
fi

# Get session info from JSON
cwd=$(echo "$json_input" | jq -r '.cwd // empty')
session_id=$(echo "$json_input" | jq -r '.session_id // empty')
transcript_path=$(echo "$json_input" | jq -r '.transcript_path // empty')

# Get context usage from transcript (for context remaining indicator)
# The JSON input doesn't have usage info, so we read from the transcript
context_used=0
context_limit=200000

if [[ -n "$transcript_path" ]] && [[ -f "$transcript_path" ]]; then
    # Get the most recent assistant message with usage info
    last_usage=$(tail -20 "$transcript_path" 2>/dev/null | \
        jq -r 'select(.message.role == "assistant") | .message.usage |
               (.input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null | \
        tail -1)

    if [[ -n "$last_usage" ]] && [[ "$last_usage" != "null" ]] && [[ "$last_usage" != "0" ]]; then
        context_used=$last_usage
    fi
fi

# Store session_id for slash commands to access
# (Commands don't get JSON input, so we persist it for them)
#
# PPID-BASED SESSION TRACKING:
# Uses PPID (parent process ID) for process isolation across multiple terminals.
#
# WHY PPID? Prevents race conditions that occurred with shared file approach:
#   - Old approach: .claude/current-session-id.txt (shared by all sessions)
#   - Problem: Multiple terminals would overwrite each other's session IDs
#   - Solution: Each process gets its own /tmp/claude-session-${PPID}.txt file
#
# PPID guarantees:
#   - Unique per terminal (each Claude Code instance has different PPID)
#   - No conflicts between concurrent sessions
#   - Auto-cleanup when process exits (OS deletes /tmp files)
#
# File locations:
#   - /tmp/claude-session-${PPID}.txt → session ID (process-specific, auto-deleted)
#   - .claude/sessions/agent-${session_id}.txt → agent name (TTL cleanup after 7 days)
#
if [[ -n "$session_id" ]]; then
    echo "$session_id" > "/tmp/claude-session-${PPID}.txt" 2>/dev/null
fi

# Get git root directory (agent files are stored at repo root, not subdirs)
git_root=""
if command -v git &>/dev/null; then
    git_root=$(cd "$cwd" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
fi

# Get agent name from session-specific file
# Each Claude Code session gets its own agent identity file
# Location: .claude/sessions/agent-{session_id}.txt
# Look in git root first (for subdirectory support), then current directory
agent_name=""

if [[ -n "$session_id" ]]; then
    # Try git root first (handles working in subdirectories like jat/dashboard)
    if [[ -n "$git_root" ]] && [[ -f "$git_root/.claude/sessions/agent-${session_id}.txt" ]]; then
        agent_name=$(cat "$git_root/.claude/sessions/agent-${session_id}.txt" 2>/dev/null | tr -d '\n')
    # Fall back to current directory if not found in git root
    elif [[ -f "$cwd/.claude/sessions/agent-${session_id}.txt" ]]; then
        agent_name=$(cat "$cwd/.claude/sessions/agent-${session_id}.txt" 2>/dev/null | tr -d '\n')
    fi
fi

if [[ -z "$agent_name" ]] && [[ -n "$AGENT_NAME" ]]; then
    # Fall back to environment variable if set
    agent_name="$AGENT_NAME"
fi

# Get tmux session name for verification and fallback
# The tmux session name (jat-AgentName) is the authoritative source since /jat:start
# updates both the agent file AND the tmux session name atomically
tmux_session=$(tmux display-message -p '#S' 2>/dev/null || echo "")
tmux_agent_name=""
# Match jat-AgentName but NOT jat-pending-* (which are sessions still being set up)
# NOTE: Must extract BASH_REMATCH before any other regex test clears it!
if [[ "$tmux_session" =~ ^jat-(.+)$ ]]; then
    tmux_agent_name="${BASH_REMATCH[1]}"
    # Filter out pending sessions
    if [[ "$tmux_agent_name" =~ ^pending- ]]; then
        tmux_agent_name=""
    fi
fi

# Verification: If agent file and tmux session name disagree, prefer tmux session name
# This handles the case where a stale agent file exists from a previous session
if [[ -n "$agent_name" ]] && [[ -n "$tmux_agent_name" ]] && [[ "$agent_name" != "$tmux_agent_name" ]]; then
    # Agent file and tmux session name don't match - tmux is authoritative
    # (tmux session is renamed by /jat:start which is the registration source)
    agent_name="$tmux_agent_name"
fi

# Fallback: Use tmux session name if agent file doesn't exist
if [[ -z "$agent_name" ]] && [[ -n "$tmux_agent_name" ]]; then
    agent_name="$tmux_agent_name"
fi

# Get git branch if in a git repo, prepend with folder name
git_branch=""
if [[ -n "$cwd" ]] && [[ -d "$cwd/.git" ]]; then
    cd "$cwd" 2>/dev/null || true
    branch=$(git branch --show-current 2>/dev/null || echo "")
    if [[ -n "$branch" ]]; then
        folder_name=$(basename "$cwd")
        # Check for uncommitted changes (dirty state)
        git_dirty=""
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            git_dirty="${RED}*${RESET}"
        fi
        # Format: folder@branch with distinct colors
        # folder = blue, @ = dim gray, branch = green, * = red (if dirty)
        git_branch="${BLUE}${folder_name}${DIM}@${GREEN}${branch}${RESET}${git_dirty}"
    fi
fi

# Get last user prompt from transcript
last_prompt=""
if [[ -n "$transcript_path" ]] && [[ -f "$transcript_path" ]]; then
    # Extract the last user message from transcript (JSONL format)
    # Look for entries with type="user" and content that is a text message (not tool result)
    last_prompt=$(tac "$transcript_path" 2>/dev/null | \
        jq -r 'select(.type == "user") |
               if (.message.content | type) == "array" then
                   .message.content[] | select(.type == "text") | .text
               elif (.message.content | type) == "string" then
                   .message.content
               else
                   empty
               end' 2>/dev/null | \
        grep -v "^$" | head -1)
    # Truncate to 200 characters
    if [[ -n "$last_prompt" ]] && [[ ${#last_prompt} -gt 200 ]]; then
        last_prompt="${last_prompt:0:197}..."
    fi
fi

# Calculate context remaining percentage
context_remaining=""
context_percent=0
if [[ $context_used -gt 0 ]] && [[ $context_limit -gt 0 ]]; then
    context_percent=$((100 - (context_used * 100 / context_limit)))
    context_remaining="${context_percent}%"
fi

# Generate battery/progress bar representation (10 segments, each = 10%)
# Filled: ▪  Empty: ▫
generate_battery_bar() {
    local percent=$1
    local filled=$((percent / 10))
    local empty=$((10 - filled))
    local bar=""

    # Add filled segments
    for ((i=0; i<filled; i++)); do
        bar="${bar}▪"
    done

    # Add empty segments
    for ((i=0; i<empty; i++)); do
        bar="${bar}▫"
    done

    echo "$bar"
}

# If no agent name, show "not registered" status with git branch and context
if [[ -z "$agent_name" ]]; then
    # Use project folder name instead of hardcoded "jat"
    project_display=$(basename "$cwd" 2>/dev/null || echo "project")
    base_status="${GRAY}${project_display}${RESET} ${GRAY}·${RESET} ${CYAN}no agent registered${RESET}"

    # Build second line with context battery and git branch
    second_line=""
    if [[ -n "$context_remaining" ]]; then
        # Generate battery bar with color based on percentage
        if [[ $context_percent -gt 50 ]]; then
            context_color="${GREEN}"
        elif [[ $context_percent -gt 25 ]]; then
            context_color="${YELLOW}"
        else
            context_color="${RED}"
        fi
        battery_bar=$(generate_battery_bar $context_percent)
        second_line="${second_line}${context_color}${battery_bar}${RESET}"
    fi
    if [[ -n "$git_branch" ]]; then
        [[ -n "$second_line" ]] && second_line="${second_line} ${GRAY}|${RESET} "
        second_line="${second_line}${MAGENTA}⎇${RESET} ${git_branch}"
    fi

    if [[ -n "$second_line" ]]; then
        echo -e "${base_status}\n${second_line}"
    else
        echo -e "${base_status}"
    fi
    exit 0
fi

# ============================================================================
# STATUS CALCULATION ALGORITHM
# ============================================================================
# Determines what task/status to display based on priority-based decision tree:
#
# 1. Check Beads for in_progress tasks assigned to this agent (PRIORITY 1)
#    - Source of truth for current work
#    - Most accurate representation of agent state
#
# 2. Fall back to file reservations if no in_progress task found (PRIORITY 2)
#    - Extract task ID from reservation reason field
#    - Lookup task details in Beads
#    - Handles case where agent has locks but forgot to update Beads
#
# 3. If neither found, show "idle" state
#
# See CLAUDE.md "Status Calculation Algorithm" section for full decision tree
# ============================================================================

task_id=""
task_title=""
task_priority=""
task_progress=""
task_type=""
task_updated_at=""

# Priority 1: Check Beads for in_progress tasks (matches dashboard logic)
if command -v bd &>/dev/null; then
    # Change to project directory if provided
    if [[ -n "$cwd" ]] && [[ -d "$cwd" ]]; then
        cd "$cwd" 2>/dev/null || true
    fi

    # Get in_progress task assigned to this agent (cached)
    project_name=$(basename "$cwd")
    bd_cache_key="${agent_name}-${project_name}-tasks"
    bd_list_json=$(cache_get_or_run "$bd_cache_key" "bd list --json")
    task_json=$(echo "$bd_list_json" | jq -r --arg agent "$agent_name" '.[] | select(.assignee == $agent and .status == "in_progress") | @json' 2>/dev/null | head -1)

    if [[ -n "$task_json" ]]; then
        task_id=$(echo "$task_json" | jq -r '.id // empty')
        task_title=$(echo "$task_json" | jq -r '.title // empty')
        task_priority=$(echo "$task_json" | jq -r '.priority // empty')
        task_progress=$(echo "$task_json" | jq -r '.progress // empty')
        task_type=$(echo "$task_json" | jq -r '.issue_type // empty')
        task_updated_at=$(echo "$task_json" | jq -r '.updated_at // empty')

        # Truncate title if too long (33 chars + "..." = 36 total)
        # Config: dashboard/src/lib/config/constants.ts → STATUSLINE.TASK_TITLE_MAX_CHARS
        if [[ ${#task_title} -gt 33 ]]; then
            task_title="${task_title:0:33}..."
        fi
    fi
fi

# Priority 2: Fall back to file reservations if no in_progress task found
if [[ -z "$task_id" ]] && command -v am-reservations &>/dev/null; then
    # Get the most recent reservation for this agent and extract task ID from reason (cached)
    reservations_cache_key="${agent_name}-reservations"
    reservation_info=$(cache_get_or_run "$reservations_cache_key" "am-reservations --agent '$agent_name'")

    if [[ -n "$reservation_info" ]]; then
        # Extract task ID from reason field (format: "task-id: description" or just "task-id")
        # Dynamic project prefix: extract from cwd (e.g., /home/jw/code/chimaro -> chimaro-xxx)
        project_prefix=$(basename "$cwd")
        task_id=$(echo "$reservation_info" | grep "^Reason:" | sed 's/^Reason: //' | grep -oE "${project_prefix}-[a-z0-9]{3}\b" | head -1)

        # If we found a task ID from reservation, get its details from Beads
        if [[ -n "$task_id" ]] && command -v bd &>/dev/null; then
            task_json=$(bd show "$task_id" --json 2>/dev/null)
            task_title=$(echo "$task_json" | jq -r '.[0].title // empty')
            task_priority=$(echo "$task_json" | jq -r '.[0].priority // empty')
            task_progress=$(echo "$task_json" | jq -r '.[0].progress // empty')
            task_type=$(echo "$task_json" | jq -r '.[0].issue_type // empty')
            task_updated_at=$(echo "$task_json" | jq -r '.[0].updated_at // empty')

            # Truncate title if too long (33 chars + "..." = 36 total)
            # Config: dashboard/src/lib/config/constants.ts → STATUSLINE.TASK_TITLE_MAX_CHARS
            if [[ ${#task_title} -gt 33 ]]; then
                task_title="${task_title:0:33}..."
            fi
        fi
    fi
fi

# Get additional status indicators
lock_count=0
unread_count=0
time_remaining=""

if [[ -n "$agent_name" ]]; then
    # Count file locks (reuse cached reservation_info if available, otherwise cache it)
    if command -v am-reservations &>/dev/null; then
        # Reuse cached reservations from earlier, or fetch if not set
        if [[ -z "$reservation_info" ]]; then
            reservations_cache_key="${agent_name}-reservations"
            reservation_info=$(cache_get_or_run "$reservations_cache_key" "am-reservations --agent '$agent_name'")
        fi

        lock_count=$(echo "$reservation_info" | grep -c "^ID:" 2>/dev/null || echo "0")
        lock_count=$(echo "$lock_count" | tr -d '\n' | tr -d ' ')  # Clean up output

        # Calculate time remaining on shortest lock
        if [[ "$lock_count" != "0" ]] && [[ $lock_count -gt 0 ]]; then
            expires=$(echo "$reservation_info" | grep "^Expires:" | head -1 | sed 's/^Expires: //')
            if [[ -n "$expires" ]]; then
                expires_epoch=$(date -d "$expires" +%s 2>/dev/null || echo "0")
                now_epoch=$(date +%s)
                seconds_remaining=$((expires_epoch - now_epoch))

                if [[ $seconds_remaining -gt 0 ]]; then
                    minutes_remaining=$((seconds_remaining / 60))
                    if [[ $minutes_remaining -lt 60 ]]; then
                        time_remaining="${minutes_remaining}m"
                    else
                        hours_remaining=$((minutes_remaining / 60))
                        time_remaining="${hours_remaining}h"
                    fi
                fi
            fi
        fi
    fi

    # Count unread messages (using --count for efficiency, cached)
    if command -v am-inbox &>/dev/null; then
        inbox_cache_key="${agent_name}-inbox-count"
        unread_count=$(cache_get_or_run "$inbox_cache_key" "am-inbox '$agent_name' --unread --count")
        unread_count=$(echo "$unread_count" | tr -d '\n' | tr -d ' ')  # Clean up output
    fi
fi

# Count tasks blocked by current task (shows impact/leverage of current work)
blocked_count=0
if [[ -n "$task_id" ]] && command -v bd &>/dev/null; then
    # Get dependent tasks (cached) - tasks that are blocked waiting on this task
    blocked_cache_key="${agent_name}-${task_id}-blocked"
    blocked_json=$(cache_get_or_run "$blocked_cache_key" "bd dep tree '$task_id' --reverse --json")
    # Count tasks with depth > 0 (children of current task in dependency tree)
    blocked_count=$(echo "$blocked_json" | jq '[.[] | select(.depth > 0)] | length' 2>/dev/null || echo "0")
    blocked_count=$(echo "$blocked_count" | tr -d '\n' | tr -d ' ')
fi

# Calculate last activity time (time since transcript was modified)
# Helps identify stale/abandoned sessions
last_activity=""
last_activity_minutes=0
if [[ -n "$transcript_path" ]] && [[ -f "$transcript_path" ]]; then
    transcript_mtime=$(stat -c %Y "$transcript_path" 2>/dev/null || echo "0")
    if [[ $transcript_mtime -gt 0 ]]; then
        now_epoch=$(date +%s)
        seconds_since_activity=$((now_epoch - transcript_mtime))
        if [[ $seconds_since_activity -gt 0 ]]; then
            last_activity_minutes=$((seconds_since_activity / 60))
            if [[ $last_activity_minutes -lt 60 ]]; then
                last_activity="${last_activity_minutes}m"
            else
                hours_since=$((last_activity_minutes / 60))
                last_activity="${hours_since}h"
            fi
        fi
    fi
fi

# Calculate active time if task has updated_at
active_time=""
if [[ -n "$task_updated_at" ]]; then
    # Parse timestamp (format: 2025-11-20T21:30:00Z or 2025-11-20 21:30:00)
    task_epoch=$(date -d "$task_updated_at" +%s 2>/dev/null || echo "0")
    if [[ $task_epoch -gt 0 ]]; then
        now_epoch=$(date +%s)
        seconds_active=$((now_epoch - task_epoch))
        if [[ $seconds_active -gt 0 ]]; then
            minutes_active=$((seconds_active / 60))
            hours_active=$((minutes_active / 60))
            if [[ $hours_active -gt 0 ]]; then
                minutes_rem=$((minutes_active % 60))
                active_time="${hours_active}h${minutes_rem}m"
            else
                active_time="${minutes_active}m"
            fi
        fi
    fi
fi

# Get task type icon
task_icon=""
case "$task_type" in
    bug)
        task_icon="🐛"
        ;;
    feature)
        task_icon="✨"
        ;;
    task|chore)
        task_icon="🔧"
        ;;
    epic)
        task_icon="🎯"
        ;;
esac

# ============================================================================
# AGENT STATUS CALCULATION
# ============================================================================
# Matches dashboard logic from: dashboard/src/lib/utils/agentStatusUtils.ts
# Thresholds from: dashboard/src/lib/config/constants.ts → AGENT_STATUS_THRESHOLDS
#
# Status priority order:
#   1. working - Has active task OR file locks (agent is engaged)
#   2. live    - Very recent activity (< 1 minute) without active work
#   3. active  - Recent activity (< 10 minutes) or has locks within 1 hour
#   4. idle    - Within 1 hour but not active
#   5. offline - Over 1 hour or never active
# ============================================================================

# Thresholds in minutes (matching constants.ts values converted from ms)
LIVE_THRESHOLD_MIN=1       # 60000ms = 1 minute
WORKING_THRESHOLD_MIN=10   # 600000ms = 10 minutes
IDLE_THRESHOLD_MIN=60      # 3600000ms = 1 hour

# Compute agent status
# Labels in CAPS to match dashboard (statusColors.ts)
# Icons: ⚙ gear, ● dot, ◉ circle-dot, ○ circle, ⏻ power
agent_status="OFFLINE"  # Default
agent_status_icon="⏻"
agent_status_color="${DIM}"

has_in_progress_task=false
has_active_locks=false

[[ -n "$task_id" ]] && has_in_progress_task=true
[[ $lock_count -gt 0 ]] && has_active_locks=true

# Priority 1: WORKING - Has active task or file locks
if [[ "$has_in_progress_task" == "true" ]] || [[ "$has_active_locks" == "true" ]]; then
    agent_status="WORKING"
    agent_status_icon="⚙"
    agent_status_color="${YELLOW}"
# Priority 2: LIVE - Very recent activity (< 1 minute) without active work
elif [[ $last_activity_minutes -lt $LIVE_THRESHOLD_MIN ]]; then
    agent_status="LIVE"
    agent_status_icon="●"
    agent_status_color="${GREEN}"
# Priority 3: ACTIVE - Recent activity (< 10 minutes)
elif [[ $last_activity_minutes -lt $WORKING_THRESHOLD_MIN ]]; then
    agent_status="ACTIVE"
    agent_status_icon="◉"
    agent_status_color="${CYAN}"
# Priority 4: IDLE - Within 1 hour
elif [[ $last_activity_minutes -lt $IDLE_THRESHOLD_MIN ]]; then
    agent_status="IDLE"
    agent_status_icon="○"
    agent_status_color="${GRAY}"
# Priority 5: OFFLINE - Over 1 hour
else
    agent_status="OFFLINE"
    agent_status_icon="⏻"
    agent_status_color="${DIM}"
fi

# Build status line with all indicators
status_line=""

# Get ANSI avatar if available (cached .ansi file in avatars directory)
# Multi-line avatar (6x3 chars) - each row prepended to corresponding status line
AVATARS_DIR="/home/jw/code/jat/avatars"
avatar_row1=""
avatar_row2=""
avatar_row3=""
if [[ -n "$agent_name" ]] && [[ -f "${AVATARS_DIR}/${agent_name}.ansi" ]]; then
    # Read multi-line avatar and split into rows
    mapfile -t avatar_rows < "${AVATARS_DIR}/${agent_name}.ansi"
    avatar_row1="${avatar_rows[0]:-}"
    avatar_row2="${avatar_rows[1]:-}"
    avatar_row3="${avatar_rows[2]:-}"
fi

# Start with agent name (avatar will be prepended at output time)
status_line="${BOLD}${BLUE}${agent_name}${RESET}"

if [[ -n "$task_id" ]]; then
    # Add priority badge if available
    if [[ -n "$task_priority" ]]; then
        case "$task_priority" in
            0)
                priority_badge="${BOLD}${RED}[P0]${RESET}"
                ;;
            1)
                priority_badge="${BOLD}${YELLOW}[P1]${RESET}"
                ;;
            2)
                priority_badge="${BOLD}${GREEN}[P2]${RESET}"
                ;;
            *)
                priority_badge="${GRAY}[P${task_priority}]${RESET}"
                ;;
        esac
        status_line="${status_line} ${GRAY}·${RESET} ${priority_badge}"
    else
        status_line="${status_line} ${GRAY}·${RESET}"
    fi

    # Add task type icon if available
    if [[ -n "$task_icon" ]]; then
        status_line="${status_line} ${task_icon}"
    fi

    # Add task ID
    status_line="${status_line} ${GREEN}${task_id}${RESET}"

    # Add task title if available
    if [[ -n "$task_title" ]]; then
        status_line="${status_line} ${GRAY}-${RESET} ${YELLOW}${task_title}${RESET}"
    fi

    # Add active time if available
    if [[ -n "$active_time" ]]; then
        status_line="${status_line} ${GRAY}⏲${RESET} ${active_time}"
    fi

elif [[ -n "$agent_name" ]]; then
    # Agent registered but no active task - show computed status with icon
    # Status matches dashboard: LIVE/ACTIVE/IDLE/OFFLINE (WORKING handled above with task)
    status_line="${status_line} ${GRAY}·${RESET} ${agent_status_color}${agent_status_icon} ${agent_status}${RESET}"
else
    # Fallback - use project folder name
    project_fallback=$(basename "$cwd" 2>/dev/null || echo "project")
    status_line="${GRAY}${project_fallback}${RESET}"
fi

# ============================================================================
# INDICATOR COLOR THRESHOLDS
# ============================================================================
# Dynamic color coding based on severity/urgency:
#
# 🔒 File Locks: Cyan (1-2) → Yellow (3-5) → Red (>5)
# 📬 Messages:   Cyan (1-5) → Yellow (6-15) → Red (>15)
# ⏱ Time Left:  Green (>30min) → Yellow (10-30min) → Red (<10min)
# 📊 Progress:   Red (<25%) → Yellow (25-75%) → Green (>75%)
# ⛔ Blocked:    Cyan (1-2) → Yellow (3-5) → Red (>5) - tasks waiting on this
# 🕐 Activity:   Green (<15m) → Yellow (15-60m) → Red (>60m stale)
#
# See CLAUDE.md "Status Calculation Algorithm" for full color matrix
# ============================================================================

# Build indicators section (for line 2)
indicators=""

# Add lock count (dynamic: cyan=1-2, yellow=3-5, red=>5)
if [[ $lock_count -gt 0 ]]; then
    if [[ $lock_count -gt 5 ]]; then
        lock_color="${RED}"
    elif [[ $lock_count -gt 2 ]]; then
        lock_color="${YELLOW}"
    else
        lock_color="${CYAN}"
    fi
    indicators="${indicators}${lock_color}🔒 ${lock_count}${RESET}"
fi

# Add unread messages (dynamic: cyan=1-5, yellow=6-15, red=>15)
if [[ $unread_count -gt 0 ]]; then
    [[ -n "$indicators" ]] && indicators="${indicators}  "
    if [[ $unread_count -gt 15 ]]; then
        msg_color="${RED}"
    elif [[ $unread_count -gt 5 ]]; then
        msg_color="${YELLOW}"
    else
        msg_color="${CYAN}"
    fi
    indicators="${indicators}${msg_color}📬 ${unread_count}${RESET}"
fi

# Add time remaining (dynamic: green=>30m, yellow=10-30m, red=<10m)
if [[ -n "$time_remaining" ]]; then
    [[ -n "$indicators" ]] && indicators="${indicators}  "

    # Extract minutes from time_remaining (format: "45m" or "2h")
    time_minutes=0
    if [[ "$time_remaining" =~ ([0-9]+)h ]]; then
        time_minutes=$((${BASH_REMATCH[1]} * 60))
    elif [[ "$time_remaining" =~ ([0-9]+)m ]]; then
        time_minutes=${BASH_REMATCH[1]}
    fi

    if [[ $time_minutes -gt 30 ]]; then
        time_color="${GREEN}"
    elif [[ $time_minutes -gt 10 ]]; then
        time_color="${YELLOW}"
    else
        time_color="${RED}"
    fi
    indicators="${indicators}${time_color}⏱ ${time_remaining}${RESET}"
fi

# Add progress if available (dynamic: red=<25%, yellow=25-75%, green=>75%)
if [[ -n "$task_progress" ]] && [[ "$task_progress" != "null" ]]; then
    [[ -n "$indicators" ]] && indicators="${indicators}  "
    if [[ $task_progress -gt 75 ]]; then
        progress_color="${GREEN}"
    elif [[ $task_progress -gt 25 ]]; then
        progress_color="${YELLOW}"
    else
        progress_color="${RED}"
    fi
    indicators="${indicators}${progress_color}${task_progress}%${RESET}"
fi

# Add blocked-by count (dynamic: cyan=1-2, yellow=3-5, red=>5)
# Shows how many tasks are waiting on current task (high = high leverage work)
if [[ $blocked_count -gt 0 ]]; then
    [[ -n "$indicators" ]] && indicators="${indicators}  "
    if [[ $blocked_count -gt 5 ]]; then
        blocked_color="${RED}"
    elif [[ $blocked_count -gt 2 ]]; then
        blocked_color="${YELLOW}"
    else
        blocked_color="${CYAN}"
    fi
    indicators="${indicators}${blocked_color}⛔ ${blocked_count}${RESET}"
fi

# Last activity indicator moved to line 3 (with last prompt) - see below

# Build second line with context battery, git branch, and indicators
second_line=""

# Add context remaining with battery bar FIRST
if [[ -n "$context_remaining" ]]; then
    # Color code based on remaining context
    if [[ $context_percent -gt 50 ]]; then
        context_color="${GREEN}"
    elif [[ $context_percent -gt 25 ]]; then
        context_color="${YELLOW}"
    else
        context_color="${RED}"
    fi

    battery_bar=$(generate_battery_bar $context_percent)
    second_line="${second_line}${context_color}${battery_bar}${RESET}"
fi

# Add git branch
if [[ -n "$git_branch" ]]; then
    [[ -n "$second_line" ]] && second_line="${second_line} ${GRAY}·${RESET} "
    second_line="${second_line}${MAGENTA}⎇${RESET} ${git_branch}"
fi

# Add indicators
if [[ -n "$indicators" ]]; then
    [[ -n "$second_line" ]] && second_line="${second_line} ${GRAY}·${RESET} "
    second_line="${second_line}${indicators}"
fi

# Build third line with last user prompt and activity timestamp
# Format: 💬 12m yes implement top 3
third_line=""
if [[ -n "$last_prompt" ]]; then
    # Build activity time with color (green=<15m, yellow=15-60m, red=>60m)
    activity_part=""
    if [[ -n "$last_activity" ]]; then
        if [[ $last_activity_minutes -gt 60 ]]; then
            activity_color="${RED}"
        elif [[ $last_activity_minutes -gt 15 ]]; then
            activity_color="${YELLOW}"
        else
            activity_color="${GREEN}"
        fi
        activity_part="${activity_color}${last_activity}${RESET} "
    fi
    third_line="${YELLOW}💬${RESET} ${activity_part}${last_prompt}"
fi

# Output status line(s) with avatar rows prepended
# Avatar is 6x3 chars - prepend each row to corresponding line
if [[ -n "$avatar_row1" ]]; then
    # Has multi-line avatar - prepend to each line
    line1="${avatar_row1}${RESET} ${status_line}"
    line2="${avatar_row2}${RESET} ${second_line}"
    line3="${avatar_row3}${RESET} ${third_line}"
    echo -e "${line1}\n${line2}\n${line3}"
elif [[ -n "$third_line" ]]; then
    echo -e "${status_line}\n${second_line}\n${third_line}"
elif [[ -n "$second_line" ]]; then
    echo -e "${status_line}\n${second_line}"
else
    echo -e "$status_line"
fi
