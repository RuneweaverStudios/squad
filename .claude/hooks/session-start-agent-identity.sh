#!/usr/bin/env bash
#
# session-start-agent-identity.sh - Unified SessionStart hook for JAT
#
# Combines agent identity restoration (from tmux/WINDOWID) with workflow
# state injection (task ID, signal state, next action reminder).
#
# This is the GLOBAL hook - installed to ~/.claude/hooks/ by setup-statusline-and-hooks.sh
# It works with or without .jat/ directory (graceful degradation).
#
# Input (stdin): {"session_id": "...", "source": "startup|resume|clear|compact", ...}
# Output: Context about agent identity + workflow state (if found)
#
# Recovery priority:
#   1. IDE pre-registration file (.tmux-agent-{tmuxSession})
#   2. WINDOWID-based file (survives /clear, compaction recovery)
#   3. Existing session file (agent-{sessionId}.txt)
#
# Writes: .claude/sessions/agent-{session_id}.txt (in all project dirs)

set -euo pipefail

DEBUG_LOG="/tmp/jat-session-start-hook.log"
log() {
    echo "$(date -Iseconds) $*" >> "$DEBUG_LOG"
}

log "=== SessionStart hook triggered ==="
log "PWD: $(pwd)"
log "TMUX env: ${TMUX:-NOT_SET}"

# Read hook input from stdin
HOOK_INPUT=$(cat)
log "Input: ${HOOK_INPUT:0:200}"

# Extract session_id and source
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")
SOURCE=$(echo "$HOOK_INPUT" | jq -r '.source // ""' 2>/dev/null || echo "")
log "Session ID: $SESSION_ID, Source: $SOURCE"

if [[ -z "$SESSION_ID" ]]; then
    log "ERROR: No session_id in hook input"
    exit 0
fi

# Write PPID-based session file for other tools
echo "$SESSION_ID" > "/tmp/claude-session-${PPID}.txt"

# ============================================================================
# DETECT TMUX SESSION - 3 methods for robustness
# ============================================================================

TMUX_SESSION=""
IN_TMUX=true

# Method 1: Use $TMUX env var if available
if [[ -n "${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
    log "Method 1 (TMUX env): $TMUX_SESSION"
fi

# Method 2: Find tmux session by tty
if [[ -z "$TMUX_SESSION" ]]; then
    CURRENT_TTY=$(tty 2>/dev/null || echo "")
    if [[ -n "$CURRENT_TTY" ]]; then
        TMUX_SESSION=$(tmux list-panes -a -F '#{pane_tty} #{session_name}' 2>/dev/null | grep "^${CURRENT_TTY} " | head -1 | awk '{print $2}')
        log "Method 2 (tty=$CURRENT_TTY): $TMUX_SESSION"
    fi
fi

# Method 3: Walk parent process tree looking for tmux
if [[ -z "$TMUX_SESSION" ]]; then
    PPID_CHAIN=$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')
    if [[ -n "$PPID_CHAIN" ]]; then
        for _ in 1 2 3 4 5; do
            PPID_CMD=$(ps -o comm= -p "$PPID_CHAIN" 2>/dev/null || echo "")
            if [[ "$PPID_CMD" == "tmux"* ]]; then
                TMUX_SESSION=$(cat /proc/$PPID_CHAIN/environ 2>/dev/null | tr '\0' '\n' | grep '^TMUX=' | head -1 | cut -d',' -f3)
                log "Method 3 (parent process): $TMUX_SESSION"
                break
            fi
            PPID_CHAIN=$(ps -o ppid= -p "$PPID_CHAIN" 2>/dev/null | tr -d ' ')
            [[ -z "$PPID_CHAIN" || "$PPID_CHAIN" == "1" ]] && break
        done
    fi
fi

if [[ -z "$TMUX_SESSION" ]]; then
    IN_TMUX=false
fi

log "Final tmux session: ${TMUX_SESSION:-NONE}"

# ============================================================================
# BUILD SEARCH DIRECTORIES (current dir + all configured projects)
# ============================================================================

PROJECT_DIR="$(pwd)"
CLAUDE_DIR="$PROJECT_DIR/.claude"
mkdir -p "$CLAUDE_DIR/sessions"

SEARCH_DIRS="$PROJECT_DIR"
JAT_CONFIG="$HOME/.config/jat/projects.json"
if [[ -f "$JAT_CONFIG" ]]; then
    PROJECT_PATHS=$(jq -r '.projects[].path // empty' "$JAT_CONFIG" 2>/dev/null | sed "s|^~|$HOME|g")
    for PP in $PROJECT_PATHS; do
        # Skip current dir (already included) and non-existent dirs
        [[ "$PP" == "$PROJECT_DIR" ]] && continue
        [[ -d "${PP}/.claude" ]] && SEARCH_DIRS="$SEARCH_DIRS $PP"
    done
fi
log "Search dirs: $SEARCH_DIRS"

# ============================================================================
# RESTORE AGENT IDENTITY (priority order)
# ============================================================================

AGENT_NAME=""
WINDOW_KEY="${WINDOWID:-$PPID}"

# Priority 1: IDE pre-registration file (tmux session name based)
if [[ -n "$TMUX_SESSION" ]]; then
    for BASE_DIR in $SEARCH_DIRS; do
        CANDIDATE="${BASE_DIR}/.claude/sessions/.tmux-agent-${TMUX_SESSION}"
        if [[ -f "$CANDIDATE" ]]; then
            AGENT_NAME=$(cat "$CANDIDATE" 2>/dev/null | tr -d '\n')
            log "Priority 1 (tmux pre-reg): $AGENT_NAME from $CANDIDATE"
            break
        fi
    done
fi

# Priority 2: WINDOWID-based file (compaction recovery)
if [[ -z "$AGENT_NAME" ]]; then
    PERSISTENT_AGENT_FILE="$CLAUDE_DIR/.agent-identity-${WINDOW_KEY}"
    if [[ -f "$PERSISTENT_AGENT_FILE" ]]; then
        AGENT_NAME=$(cat "$PERSISTENT_AGENT_FILE" 2>/dev/null | tr -d '\n')
        log "Priority 2 (WINDOWID=$WINDOW_KEY): $AGENT_NAME"

        # Ensure agent is registered in Agent Mail
        if [[ -n "$AGENT_NAME" ]] && command -v am-register &>/dev/null; then
            if ! sqlite3 ~/.agent-mail.db "SELECT 1 FROM agents WHERE name = '$AGENT_NAME'" 2>/dev/null | grep -q 1; then
                am-register --name "$AGENT_NAME" --program claude-code --model opus 2>/dev/null
            fi
        fi
    fi
fi

# Priority 3: Existing session file for this session ID
if [[ -z "$AGENT_NAME" ]]; then
    for BASE_DIR in $SEARCH_DIRS; do
        CANDIDATE="${BASE_DIR}/.claude/sessions/agent-${SESSION_ID}.txt"
        if [[ -f "$CANDIDATE" ]]; then
            AGENT_NAME=$(cat "$CANDIDATE" 2>/dev/null | tr -d '\n')
            log "Priority 3 (existing session file): $AGENT_NAME from $CANDIDATE"
            break
        fi
    done
fi

if [[ -z "$AGENT_NAME" ]]; then
    log "No agent identity found"
    # Still warn about tmux
    if [[ "$IN_TMUX" == false ]]; then
        echo ""
        echo "NOT IN TMUX SESSION - IDE cannot track this session."
        echo "Exit and restart with: jat-projectname (e.g. jat-jat, jat-chimaro)"
    fi
    exit 0
fi

# ============================================================================
# WRITE SESSION FILES to all project directories
# ============================================================================

for BASE_DIR in $SEARCH_DIRS; do
    SESSIONS_DIR="${BASE_DIR}/.claude/sessions"
    if [[ -d "$SESSIONS_DIR" ]]; then
        echo "$AGENT_NAME" > "${SESSIONS_DIR}/agent-${SESSION_ID}.txt"
        log "Wrote session file: ${SESSIONS_DIR}/agent-${SESSION_ID}.txt"
    fi
done

# ============================================================================
# OUTPUT IDENTITY CONTEXT
# ============================================================================

echo "=== JAT Agent Identity Restored ==="
echo "Agent: $AGENT_NAME"
echo "Session: ${SESSION_ID:0:8}..."
echo "Tmux: ${TMUX_SESSION:-NOT_IN_TMUX}"
echo "Source: $SOURCE"

# ============================================================================
# INJECT WORKFLOW STATE (if available)
# ============================================================================

PERSISTENT_STATE_FILE="$CLAUDE_DIR/.agent-workflow-state-${WINDOW_KEY}.json"
TASK_ID=""

# Check for saved workflow state from PreCompact hook
if [[ -f "$PERSISTENT_STATE_FILE" ]]; then
    SIGNAL_STATE=$(jq -r '.signalState // "unknown"' "$PERSISTENT_STATE_FILE" 2>/dev/null)
    TASK_ID=$(jq -r '.taskId // ""' "$PERSISTENT_STATE_FILE" 2>/dev/null)
    TASK_TITLE=$(jq -r '.taskTitle // ""' "$PERSISTENT_STATE_FILE" 2>/dev/null)

    if [[ -n "$TASK_ID" ]]; then
        case "$SIGNAL_STATE" in
            "starting")
                NEXT_ACTION="Emit 'working' signal with taskId, taskTitle, and approach before continuing work"
                WORKFLOW_STEP="After registration, before implementation"
                ;;
            "working")
                NEXT_ACTION="Continue implementation. When done, emit 'review' signal before presenting results"
                WORKFLOW_STEP="Implementation in progress"
                ;;
            "needs_input")
                NEXT_ACTION="After user responds, emit 'working' signal to resume, then continue work"
                WORKFLOW_STEP="Waiting for user input"
                ;;
            "review")
                NEXT_ACTION="Present findings to user. Run /jat:complete when approved"
                WORKFLOW_STEP="Ready for review"
                ;;
            *)
                NEXT_ACTION="Check task status and emit appropriate signal (working/review)"
                WORKFLOW_STEP="Unknown - verify current state"
                ;;
        esac

        echo ""
        echo "[JAT:WORKING task=$TASK_ID]"
        echo ""
        echo "=== JAT WORKFLOW CONTEXT (restored after compaction) ==="
        echo "Agent: $AGENT_NAME"
        echo "Task: $TASK_ID - $TASK_TITLE"
        echo "Last Signal: $SIGNAL_STATE"
        echo "Workflow Step: $WORKFLOW_STEP"
        echo "NEXT ACTION REQUIRED: $NEXT_ACTION"
        echo "========================================================="

        log "Injected workflow context: state=$SIGNAL_STATE, task=$TASK_ID"
    fi
fi

# Fallback: If no state file but agent has in_progress task, query jt (if available)
if [[ -z "$TASK_ID" ]] && command -v jt &>/dev/null; then
    # Only try jt if we're in a directory with .jat/ (graceful degradation)
    if [[ -d "$PROJECT_DIR/.jat" ]]; then
        TASK_ID=$(jt list --json 2>/dev/null | jq -r --arg a "$AGENT_NAME" '.[] | select(.assignee == $a and .status == "in_progress") | .id' 2>/dev/null | head -1)
        if [[ -n "$TASK_ID" ]]; then
            TASK_TITLE=$(jt show "$TASK_ID" --json 2>/dev/null | jq -r '.[0].title // ""' 2>/dev/null)
            echo ""
            echo "[JAT:WORKING task=$TASK_ID]"
            echo ""
            echo "=== JAT WORKFLOW CONTEXT (restored from JAT Tasks) ==="
            echo "Agent: $AGENT_NAME"
            echo "Task: $TASK_ID - $TASK_TITLE"
            echo "Last Signal: unknown (no state file)"
            echo "NEXT ACTION: Emit 'working' signal if continuing work, or 'review' signal if done"
            echo "=================================================="

            log "Fallback context from JAT Tasks: task=$TASK_ID"
        fi
    fi
fi

# Warn if not in tmux
if [[ "$IN_TMUX" == false ]]; then
    echo ""
    echo "NOT IN TMUX SESSION - IDE cannot track this session."
    echo "Exit and restart with: jat-projectname (e.g. jat-jat, jat-chimaro)"
fi

log "Hook completed successfully"
exit 0
