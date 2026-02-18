#!/usr/bin/env bash
#
# post-bash-squad-signal.sh - PostToolUse hook for squad-signal commands
#
# Detects when agent runs squad-signal and writes structured data to temp file
# for IDE consumption via SSE.
#
# Signal format: [SQUAD-SIGNAL:<type>] <json-payload>
# Types: working, review, needs_input, idle, completing, completed,
#        starting, compacting, question, tasks, action, complete
#
# Input: JSON with tool name, input (command), output, session_id
# Output: Writes to /tmp/squad-signal-{session}.json

set -euo pipefail

# Read tool info from stdin (must do this before any exit)
TOOL_INFO=$(cat)

# WORKAROUND: Claude Code calls hooks twice per tool use (bug)
# Use atomic mkdir for locking - only one process can create a directory
LOCK_DIR="/tmp/squad-signal-locks"
mkdir -p "$LOCK_DIR" 2>/dev/null || true

# Create a lock based on session_id + command hash (first 50 chars of command)
SESSION_ID_EARLY=$(echo "$TOOL_INFO" | jq -r '.session_id // ""' 2>/dev/null || echo "")
COMMAND_EARLY=$(echo "$TOOL_INFO" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
COMMAND_HASH=$(echo "${SESSION_ID_EARLY}:${COMMAND_EARLY:0:50}" | md5sum | cut -c1-16)
LOCK_FILE="${LOCK_DIR}/hook-${COMMAND_HASH}"

# Try to atomically create lock directory - only first process succeeds
if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    # Lock exists - check if it's stale (older than 5 seconds)
    if [[ -d "$LOCK_FILE" ]]; then
        # Get lock file mtime (cross-platform: Linux uses -c, macOS uses -f)
        if [[ "$(uname)" == "Darwin" ]]; then
            LOCK_MTIME=$(stat -f %m "$LOCK_FILE" 2>/dev/null || echo "0")
        else
            LOCK_MTIME=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo "0")
        fi
        LOCK_AGE=$(( $(date +%s) - LOCK_MTIME ))
        if [[ $LOCK_AGE -lt 5 ]]; then
            # Recent duplicate invocation, skip silently
            exit 0
        fi
        # Stale lock, remove and recreate
        rmdir "$LOCK_FILE" 2>/dev/null || true
        mkdir "$LOCK_FILE" 2>/dev/null || exit 0
    fi
fi

# Clean up lock on exit (after 1 second to ensure second invocation sees it)
trap "sleep 1; rmdir '$LOCK_FILE' 2>/dev/null || true" EXIT

# Only process Bash tool calls
TOOL_NAME=$(echo "$TOOL_INFO" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
if [[ "$TOOL_NAME" != "Bash" ]]; then
    exit 0
fi

# Extract the command that was executed
COMMAND=$(echo "$TOOL_INFO" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# Extract the tool output first - check if it contains a signal marker
OUTPUT=$(echo "$TOOL_INFO" | jq -r '.tool_response.stdout // ""' 2>/dev/null || echo "")

# Check if output contains a squad-signal marker (regardless of what command was run)
# This handles both direct squad-signal calls AND scripts that call squad-signal internally (like squad-step)
if ! echo "$OUTPUT" | grep -qE '\[SQUAD-SIGNAL:[a-z_]+\]'; then
    exit 0
fi

# Extract session ID
SESSION_ID=$(echo "$TOOL_INFO" | jq -r '.session_id // ""' 2>/dev/null || echo "")
if [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

# OUTPUT already extracted above when checking for signal marker

# Check for validation warnings in stderr
STDERR=$(echo "$TOOL_INFO" | jq -r '.tool_response.stderr // ""' 2>/dev/null || echo "")
VALIDATION_WARNING=""
if echo "$STDERR" | grep -q 'Warning:'; then
    VALIDATION_WARNING=$(echo "$STDERR" | grep -o 'Warning: .*' | head -1)
fi

# Parse the signal from output - format: [SQUAD-SIGNAL:<type>] <json>
SIGNAL_TYPE=""
SIGNAL_DATA=""

if echo "$OUTPUT" | grep -qE '\[SQUAD-SIGNAL:[a-z_]+\]'; then
    # Extract signal type from marker
    SIGNAL_TYPE=$(echo "$OUTPUT" | grep -oE '\[SQUAD-SIGNAL:[a-z_]+\]' | head -1 | sed 's/\[SQUAD-SIGNAL://;s/\]//')
    # Extract JSON payload after marker (take only the first match, trim whitespace)
    SIGNAL_DATA=$(echo "$OUTPUT" | grep -oE '\[SQUAD-SIGNAL:[a-z_]+\] \{.*' | head -1 | sed 's/\[SQUAD-SIGNAL:[a-z_]*\] *//')
fi

if [[ -z "$SIGNAL_TYPE" ]]; then
    exit 0
fi

# Get tmux session name for IDE lookup
TMUX_SESSION=""

# Build list of directories to search: current dir + configured projects
SEARCH_DIRS="."
SQUAD_CONFIG="$HOME/.config/squad/projects.json"
if [[ -f "$SQUAD_CONFIG" ]]; then
    PROJECT_PATHS=$(jq -r '.projects[].path // empty' "$SQUAD_CONFIG" 2>/dev/null | sed "s|^~|$HOME|g")
    for PROJECT_PATH in $PROJECT_PATHS; do
        if [[ -d "${PROJECT_PATH}/.claude" ]]; then
            SEARCH_DIRS="$SEARCH_DIRS $PROJECT_PATH"
        fi
    done
fi

for BASE_DIR in $SEARCH_DIRS; do
    for SUBDIR in "sessions" ""; do
        if [[ -n "$SUBDIR" ]]; then
            AGENT_FILE="${BASE_DIR}/.claude/${SUBDIR}/agent-${SESSION_ID}.txt"
        else
            AGENT_FILE="${BASE_DIR}/.claude/agent-${SESSION_ID}.txt"
        fi
        if [[ -f "$AGENT_FILE" ]]; then
            AGENT_NAME=$(cat "$AGENT_FILE" 2>/dev/null | tr -d '\n')
            if [[ -n "$AGENT_NAME" ]]; then
                TMUX_SESSION="squad-${AGENT_NAME}"
                break 2
            fi
        fi
    done
done

# Parse signal data as JSON (validate first to avoid || echo appending extra output)
if [[ -n "$SIGNAL_DATA" ]] && echo "$SIGNAL_DATA" | jq -e . >/dev/null 2>&1; then
    PARSED_DATA=$(echo "$SIGNAL_DATA" | jq -c .)
else
    PARSED_DATA='{}'
fi

# Extract task_id from payload if present
TASK_ID=$(echo "$PARSED_DATA" | jq -r '.taskId // ""' 2>/dev/null)
TASK_ID="${TASK_ID:-}"

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
# This catches signals that somehow bypassed squad-signal validation
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
SIGNAL_FILE="/tmp/squad-signal-${SESSION_ID}.json"
echo "$SIGNAL_JSON" > "$SIGNAL_FILE" 2>/dev/null || true

# Also write by tmux session name for easy lookup (current state - overwrites)
if [[ -n "$TMUX_SESSION" ]]; then
    TMUX_SIGNAL_FILE="/tmp/squad-signal-tmux-${TMUX_SESSION}.json"
    echo "$SIGNAL_JSON" > "$TMUX_SIGNAL_FILE" 2>/dev/null || true

    # Append to timeline log (JSONL format - preserves history)
    TIMELINE_FILE="/tmp/squad-timeline-${TMUX_SESSION}.jsonl"
    echo "$SIGNAL_JSON" >> "$TIMELINE_FILE" 2>/dev/null || true
fi

# For question signals, also write to /tmp/squad-question-*.json files
# This allows the IDE to poll for questions separately from other signals
if [[ "$SIGNAL_TYPE" == "question" ]]; then
    # Build question-specific JSON with fields expected by IDE
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
    QUESTION_FILE="/tmp/squad-question-${SESSION_ID}.json"
    echo "$QUESTION_JSON" > "$QUESTION_FILE" 2>/dev/null || true

    # Also write to tmux session name file for easy IDE lookup
    if [[ -n "$TMUX_SESSION" ]]; then
        TMUX_QUESTION_FILE="/tmp/squad-question-tmux-${TMUX_SESSION}.json"
        echo "$QUESTION_JSON" > "$TMUX_QUESTION_FILE" 2>/dev/null || true
    fi
fi

# Write per-task signal timeline for TaskDetailDrawer
# Stored in .squad/signals/{taskId}.jsonl so it persists with the repo
if [[ -n "$TASK_ID" ]]; then

    # Extract project prefix from task ID (e.g., "squad-abc" -> "squad")
    TASK_PROJECT=""
    if [[ "$TASK_ID" =~ ^([a-zA-Z0-9_-]+)- ]]; then
        TASK_PROJECT="${BASH_REMATCH[1]}"
    fi

    # Find the project root - prioritize project matching task ID prefix
    TARGET_DIR=""
    FALLBACK_DIR=""
    for BASE_DIR in $SEARCH_DIRS; do
        if [[ -d "${BASE_DIR}/.squad" ]]; then
            DIR_NAME=$(basename "$BASE_DIR")
            # If directory name matches task project prefix, use it
            if [[ -n "$TASK_PROJECT" ]] && [[ "$DIR_NAME" == "$TASK_PROJECT" ]]; then
                TARGET_DIR="$BASE_DIR"
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
        SIGNALS_DIR="${CHOSEN_DIR}/.squad/signals"
        mkdir -p "$SIGNALS_DIR" 2>/dev/null || true

        # Add agent name to the signal for task context
        AGENT_FROM_TMUX=""
        if [[ -n "$TMUX_SESSION" ]] && [[ "$TMUX_SESSION" =~ ^squad-(.+)$ ]]; then
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
        echo "$TASK_SIGNAL_JSON" >> "$TASK_TIMELINE_FILE" 2>/dev/null || true
    fi
fi

exit 0
