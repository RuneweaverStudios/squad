#!/usr/bin/env bash
#
# post-bash-jat-signal.sh - PostToolUse hook for jat-signal commands
#
# Detects when agent runs jat-signal and writes structured data to temp file
# for dashboard consumption via SSE.
#
# Signal format: [JAT-SIGNAL:<type>] <json-payload>
# Types: working, review, needs_input, idle, completing, completed,
#        starting, compacting, question, tasks, action, complete
#
# Input: JSON with tool name, input (command), output, session_id
# Output: Writes to /tmp/jat-signal-{session}.json

set -euo pipefail

# Debug logging (append to temp file)
DEBUG_LOG="/tmp/jat-signal-hook-debug.log"

# Read tool info from stdin
TOOL_INFO=$(cat)

# Log incoming data
echo "$(date -Iseconds) Hook triggered" >> "$DEBUG_LOG"

# Only process Bash tool calls
TOOL_NAME=$(echo "$TOOL_INFO" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
if [[ "$TOOL_NAME" != "Bash" ]]; then
    exit 0
fi

# Extract the command that was executed
COMMAND=$(echo "$TOOL_INFO" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
echo "$(date -Iseconds) Command: ${COMMAND:0:80}" >> "$DEBUG_LOG"

# Check if it's a jat-signal command
if ! echo "$COMMAND" | grep -q '^jat-signal '; then
    echo "$(date -Iseconds) Not jat-signal, exiting" >> "$DEBUG_LOG"
    exit 0
fi
echo "$(date -Iseconds) IS a jat-signal command!" >> "$DEBUG_LOG"

# Extract session ID
SESSION_ID=$(echo "$TOOL_INFO" | jq -r '.session_id // ""' 2>/dev/null || echo "")
echo "$(date -Iseconds) Session ID: $SESSION_ID" >> "$DEBUG_LOG"
if [[ -z "$SESSION_ID" ]]; then
    echo "$(date -Iseconds) ERROR: No session ID" >> "$DEBUG_LOG"
    exit 0
fi

# Extract the tool output (contains [JAT-SIGNAL:...] marker)
OUTPUT=$(echo "$TOOL_INFO" | jq -r '.tool_response.stdout // ""' 2>/dev/null || echo "")

# Check for validation warnings in stderr
STDERR=$(echo "$TOOL_INFO" | jq -r '.tool_response.stderr // ""' 2>/dev/null || echo "")
VALIDATION_WARNING=""
if echo "$STDERR" | grep -q 'Warning:'; then
    VALIDATION_WARNING=$(echo "$STDERR" | grep -o 'Warning: .*' | head -1)
fi

# Parse the signal from output - format: [JAT-SIGNAL:<type>] <json>
SIGNAL_TYPE=""
SIGNAL_DATA=""

if echo "$OUTPUT" | grep -qE '\[JAT-SIGNAL:[a-z_]+\]'; then
    # Extract signal type from marker
    SIGNAL_TYPE=$(echo "$OUTPUT" | grep -oE '\[JAT-SIGNAL:[a-z_]+\]' | head -1 | sed 's/\[JAT-SIGNAL://;s/\]//')
    # Extract JSON payload after marker (take only the first match, trim whitespace)
    SIGNAL_DATA=$(echo "$OUTPUT" | grep -oE '\[JAT-SIGNAL:[a-z_]+\] \{.*' | head -1 | sed 's/\[JAT-SIGNAL:[a-z_]*\] *//')
fi

if [[ -z "$SIGNAL_TYPE" ]]; then
    exit 0
fi

# Get tmux session name for dashboard lookup
TMUX_SESSION=""

# Build list of directories to search: current dir + configured projects
SEARCH_DIRS="."
JAT_CONFIG="$HOME/.config/jat/projects.json"
if [[ -f "$JAT_CONFIG" ]]; then
    PROJECT_PATHS=$(jq -r '.projects[].path // empty' "$JAT_CONFIG" 2>/dev/null | sed "s|^~|$HOME|g")
    for PROJECT_PATH in $PROJECT_PATHS; do
        if [[ -d "${PROJECT_PATH}/.claude" ]]; then
            SEARCH_DIRS="$SEARCH_DIRS $PROJECT_PATH"
        fi
    done
fi

echo "$(date -Iseconds) Searching for agent file in: $SEARCH_DIRS" >> "$DEBUG_LOG"
for BASE_DIR in $SEARCH_DIRS; do
    for SUBDIR in "sessions" ""; do
        if [[ -n "$SUBDIR" ]]; then
            AGENT_FILE="${BASE_DIR}/.claude/${SUBDIR}/agent-${SESSION_ID}.txt"
        else
            AGENT_FILE="${BASE_DIR}/.claude/agent-${SESSION_ID}.txt"
        fi
        echo "$(date -Iseconds) Checking: $AGENT_FILE exists=$(test -f "$AGENT_FILE" && echo yes || echo no)" >> "$DEBUG_LOG"
        if [[ -f "$AGENT_FILE" ]]; then
            AGENT_NAME=$(cat "$AGENT_FILE" 2>/dev/null | tr -d '\n')
            if [[ -n "$AGENT_NAME" ]]; then
                TMUX_SESSION="jat-${AGENT_NAME}"
                echo "$(date -Iseconds) Found agent: $AGENT_NAME -> tmux: $TMUX_SESSION" >> "$DEBUG_LOG"
                break 2
            fi
        fi
    done
done
echo "$(date -Iseconds) Final TMUX_SESSION: $TMUX_SESSION" >> "$DEBUG_LOG"

# Parse signal data as JSON (validate first to avoid || echo appending extra output)
if [[ -n "$SIGNAL_DATA" ]] && echo "$SIGNAL_DATA" | jq -e . >/dev/null 2>&1; then
    PARSED_DATA=$(echo "$SIGNAL_DATA" | jq -c .)
else
    PARSED_DATA='{}'
fi

# Extract task_id from payload if present
TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
TASK_ID="${TASK_ID:-}"
echo "$(date -Iseconds) TASK_ID='$TASK_ID' from PARSED_DATA" >> "$DEBUG_LOG"

# Determine if this is a state signal or data signal
# State signals: working, review, needs_input, idle, completing, completed, starting, compacting, question
# Data signals: tasks, action, complete
STATE_SIGNALS="working review needs_input idle completing completed starting compacting question"
IS_STATE_SIGNAL=false
for s in $STATE_SIGNALS; do
    if [[ "$SIGNAL_TYPE" == "$s" ]]; then
        IS_STATE_SIGNAL=true
        break
    fi
done

# Defense-in-depth: Validate required fields for state signals
# This catches signals that somehow bypassed jat-signal validation
if [[ "$IS_STATE_SIGNAL" == "true" ]]; then
    case "$SIGNAL_TYPE" in
        working)
            # working requires taskId and taskTitle
            HAS_TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
            HAS_TASK_TITLE=$(echo "$PARSED_DATA" | jq -r '.taskTitle // ""' 2>/dev/null)
            if [[ -z "$HAS_TASK_ID" ]] || [[ -z "$HAS_TASK_TITLE" ]]; then
                exit 0  # Silently skip incomplete working signals
            fi
            ;;
        review)
            # review requires taskId
            HAS_TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
            if [[ -z "$HAS_TASK_ID" ]]; then
                exit 0  # Silently skip incomplete review signals
            fi
            ;;
        needs_input)
            # needs_input requires taskId, question, questionType
            HAS_TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
            HAS_QUESTION=$(echo "$PARSED_DATA" | jq -r '.question // ""' 2>/dev/null)
            HAS_TYPE=$(echo "$PARSED_DATA" | jq -r '.questionType // ""' 2>/dev/null)
            if [[ -z "$HAS_TASK_ID" ]] || [[ -z "$HAS_QUESTION" ]] || [[ -z "$HAS_TYPE" ]]; then
                exit 0  # Silently skip incomplete needs_input signals
            fi
            ;;
        completing|completed)
            # completing/completed require taskId
            HAS_TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
            if [[ -z "$HAS_TASK_ID" ]]; then
                exit 0  # Silently skip incomplete completing/completed signals
            fi
            ;;
        question)
            # question requires question and questionType
            HAS_QUESTION=$(echo "$PARSED_DATA" | jq -r '.question // ""' 2>/dev/null)
            HAS_TYPE=$(echo "$PARSED_DATA" | jq -r '.questionType // ""' 2>/dev/null)
            if [[ -z "$HAS_QUESTION" ]] || [[ -z "$HAS_TYPE" ]]; then
                exit 0  # Silently skip incomplete question signals
            fi
            ;;
        # idle, starting, compacting are more flexible
    esac
fi

# Build signal JSON - use "type: state" + "state: <signal>" for state signals
# This matches what the SSE server expects for rich signal card rendering
if [[ "$IS_STATE_SIGNAL" == "true" ]]; then
    SIGNAL_JSON=$(jq -c -n \
        --arg state "$SIGNAL_TYPE" \
        --arg session "$SESSION_ID" \
        --arg tmux "$TMUX_SESSION" \
        --arg task "$TASK_ID" \
        --argjson data "$PARSED_DATA" \
        '{
            type: "state",
            state: $state,
            session_id: $session,
            tmux_session: $tmux,
            task_id: $task,
            timestamp: (now | todate),
            data: $data
        }' 2>/dev/null || echo "{}")
else
    # Data signals keep signal type in type field
    SIGNAL_JSON=$(jq -c -n \
        --arg type "$SIGNAL_TYPE" \
        --arg session "$SESSION_ID" \
        --arg tmux "$TMUX_SESSION" \
        --arg task "$TASK_ID" \
        --argjson data "$PARSED_DATA" \
        '{
            type: $type,
            session_id: $session,
            tmux_session: $tmux,
            task_id: $task,
            timestamp: (now | todate),
            data: $data
        }' 2>/dev/null || echo "{}")
fi

# Get current git SHA for rollback capability
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "")

# Add git_sha to signal JSON if available
if [[ -n "$GIT_SHA" ]]; then
    SIGNAL_JSON=$(echo "$SIGNAL_JSON" | jq -c --arg sha "$GIT_SHA" '. + {git_sha: $sha}' 2>/dev/null || echo "$SIGNAL_JSON")
fi

# Write to temp file by session ID (current state - overwrites)
SIGNAL_FILE="/tmp/jat-signal-${SESSION_ID}.json"
echo "$SIGNAL_JSON" > "$SIGNAL_FILE" 2>/dev/null || true

# Also write by tmux session name for easy lookup (current state - overwrites)
if [[ -n "$TMUX_SESSION" ]]; then
    TMUX_SIGNAL_FILE="/tmp/jat-signal-tmux-${TMUX_SESSION}.json"
    echo "$SIGNAL_JSON" > "$TMUX_SIGNAL_FILE" 2>/dev/null || true

    # Append to timeline log (JSONL format - preserves history)
    TIMELINE_FILE="/tmp/jat-timeline-${TMUX_SESSION}.jsonl"
    echo "$SIGNAL_JSON" >> "$TIMELINE_FILE" 2>/dev/null || true
fi

# For question signals, also write to /tmp/jat-question-*.json files
# This allows the dashboard to poll for questions separately from other signals
if [[ "$SIGNAL_TYPE" == "question" ]]; then
    # Build question-specific JSON with fields expected by dashboard
    QUESTION_JSON=$(jq -c -n \
        --arg session "$SESSION_ID" \
        --arg tmux "$TMUX_SESSION" \
        --argjson data "$PARSED_DATA" \
        '{
            session_id: $session,
            tmux_session: $tmux,
            timestamp: (now | todate),
            question: $data.question,
            questionType: $data.questionType,
            options: ($data.options // []),
            timeout: ($data.timeout // null)
        }' 2>/dev/null || echo "{}")

    # Write to session ID file
    QUESTION_FILE="/tmp/jat-question-${SESSION_ID}.json"
    echo "$QUESTION_JSON" > "$QUESTION_FILE" 2>/dev/null || true

    # Also write to tmux session name file for easy dashboard lookup
    if [[ -n "$TMUX_SESSION" ]]; then
        TMUX_QUESTION_FILE="/tmp/jat-question-tmux-${TMUX_SESSION}.json"
        echo "$QUESTION_JSON" > "$TMUX_QUESTION_FILE" 2>/dev/null || true
    fi
fi

# Write per-task signal timeline for TaskDetailDrawer
# Stored in .beads/signals/{taskId}.jsonl so it persists with the repo
echo "$(date -Iseconds) Checking TASK_ID='$TASK_ID' for .beads/signals write" >> "$DEBUG_LOG"
if [[ -n "$TASK_ID" ]]; then
    echo "$(date -Iseconds) TASK_ID is set, searching for .beads/ in SEARCH_DIRS" >> "$DEBUG_LOG"

    # Extract project prefix from task ID (e.g., "jat-abc" -> "jat")
    TASK_PROJECT=""
    if [[ "$TASK_ID" =~ ^([a-zA-Z0-9_-]+)- ]]; then
        TASK_PROJECT="${BASH_REMATCH[1]}"
        echo "$(date -Iseconds) Task project prefix: $TASK_PROJECT" >> "$DEBUG_LOG"
    fi

    # Find the project root - prioritize project matching task ID prefix
    TARGET_DIR=""
    FALLBACK_DIR=""
    for BASE_DIR in $SEARCH_DIRS; do
        if [[ -d "${BASE_DIR}/.beads" ]]; then
            DIR_NAME=$(basename "$BASE_DIR")
            echo "$(date -Iseconds) Found .beads/ at $BASE_DIR (dir name: $DIR_NAME)" >> "$DEBUG_LOG"
            # If directory name matches task project prefix, use it
            if [[ -n "$TASK_PROJECT" ]] && [[ "$DIR_NAME" == "$TASK_PROJECT" ]]; then
                TARGET_DIR="$BASE_DIR"
                echo "$(date -Iseconds) Matched project by task prefix!" >> "$DEBUG_LOG"
                break
            fi
            # Otherwise save first match as fallback
            if [[ -z "$FALLBACK_DIR" ]]; then
                FALLBACK_DIR="$BASE_DIR"
            fi
        fi
    done

    # Use target dir or fall back to first found
    CHOSEN_DIR="${TARGET_DIR:-$FALLBACK_DIR}"

    if [[ -n "$CHOSEN_DIR" ]]; then
        echo "$(date -Iseconds) Using project dir: $CHOSEN_DIR" >> "$DEBUG_LOG"
        SIGNALS_DIR="${CHOSEN_DIR}/.beads/signals"
        mkdir -p "$SIGNALS_DIR" 2>/dev/null || true

        # Add agent name to the signal for task context
        AGENT_FROM_TMUX=""
        if [[ -n "$TMUX_SESSION" ]] && [[ "$TMUX_SESSION" =~ ^jat-(.+)$ ]]; then
            AGENT_FROM_TMUX="${BASH_REMATCH[1]}"
        fi

        # Enrich signal with agent name if available
        if [[ -n "$AGENT_FROM_TMUX" ]]; then
            TASK_SIGNAL_JSON=$(echo "$SIGNAL_JSON" | jq -c --arg agent "$AGENT_FROM_TMUX" '. + {agent_name: $agent}' 2>/dev/null || echo "$SIGNAL_JSON")
        else
            TASK_SIGNAL_JSON="$SIGNAL_JSON"
        fi

        # Append to task-specific timeline
        TASK_TIMELINE_FILE="${SIGNALS_DIR}/${TASK_ID}.jsonl"
        echo "$(date -Iseconds) Writing to $TASK_TIMELINE_FILE" >> "$DEBUG_LOG"
        echo "$TASK_SIGNAL_JSON" >> "$TASK_TIMELINE_FILE" 2>/dev/null || true
    fi
fi

exit 0
