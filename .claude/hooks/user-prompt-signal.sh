#!/usr/bin/env bash
#
# user-prompt-signal.sh - UserPromptSubmit hook for tracking user messages
#
# Fires when user submits a prompt to Claude Code.
# Writes user_input event to timeline for IDE visibility.
#
# Input: JSON via stdin with format: {"session_id": "...", "prompt": "...", ...}
# Output: Appends to /tmp/squad-timeline-{tmux-session}.jsonl

set -euo pipefail

# Read JSON input from stdin
HOOK_INPUT=$(cat)

# Skip empty input
if [[ -z "$HOOK_INPUT" ]]; then
    exit 0
fi

# Parse session_id and prompt from the JSON input
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")
USER_PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")

# Skip empty prompts or missing session_id
if [[ -z "$USER_PROMPT" ]] || [[ -z "$SESSION_ID" ]]; then
    exit 0
fi

# Skip /squad:start commands - these cause a race condition where the event gets
# written to the OLD agent's timeline before /squad:start updates the agent file.
# The /squad:start command emits its own "starting" signal which is the proper
# event for the new session.
if [[ "$USER_PROMPT" =~ ^/squad:start ]]; then
    exit 0
fi

# Get tmux session name by looking up agent file from session_id
# (Cannot use tmux display-message in subprocess - no TMUX env var)
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

if [[ -z "$TMUX_SESSION" ]]; then
    exit 0
fi

# Detect if the prompt contains an image (by checking for common image paths/patterns)
# Image paths typically match: /path/to/file.(png|jpg|jpeg|gif|webp|svg)
# Also check for task-images directory and upload patterns
HAS_IMAGE="false"
if [[ "$USER_PROMPT" =~ \.(png|jpg|jpeg|gif|webp|svg|PNG|JPG|JPEG|GIF|WEBP|SVG)($|[[:space:]]) ]] || \
   [[ "$USER_PROMPT" =~ task-images/ ]] || \
   [[ "$USER_PROMPT" =~ upload-.*\.(png|jpg|jpeg|gif|webp|svg) ]] || \
   [[ "$USER_PROMPT" =~ /tmp/.*\.(png|jpg|jpeg|gif|webp|svg) ]]; then
    HAS_IMAGE="true"
fi

# Truncate long prompts for timeline display (keep first 500 chars)
PROMPT_PREVIEW="${USER_PROMPT:0:500}"
if [[ ${#USER_PROMPT} -gt 500 ]]; then
    PROMPT_PREVIEW="${PROMPT_PREVIEW}..."
fi

# REMOVED: Task ID lookup from signal file
# Previously we read task_id from /tmp/squad-signal-tmux-{session}.json, but this caused
# signal leaking when a user started a new task - the user_input event would inherit
# the OLD task_id from the previous signal file.
#
# User input events should not be associated with a specific task since they represent
# what the user typed, which may be switching to a new task entirely (e.g., /squad:start).
# The task context is better represented by subsequent agent signals that actually
# emit the new task ID.
TASK_ID=""

# Build event JSON
EVENT_JSON=$(jq -c -n \
    --arg type "user_input" \
    --arg session "$SESSION_ID" \
    --arg tmux "$TMUX_SESSION" \
    --arg task "$TASK_ID" \
    --arg prompt "$PROMPT_PREVIEW" \
    --argjson hasImage "$HAS_IMAGE" \
    '{
        type: $type,
        session_id: $session,
        tmux_session: $tmux,
        task_id: $task,
        timestamp: (now | todate),
        data: {
            prompt: $prompt,
            hasImage: $hasImage
        }
    }' 2>/dev/null || echo "{}")

# Append to timeline log (JSONL format - preserves history)
TIMELINE_FILE="/tmp/squad-timeline-${TMUX_SESSION}.jsonl"
echo "$EVENT_JSON" >> "$TIMELINE_FILE" 2>/dev/null || true

# Start output monitor for real-time activity detection (shimmer effect)
# Kill any existing monitor for this session first
PID_FILE="/tmp/squad-monitor-${TMUX_SESSION}.pid"
if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
fi

# Start new monitor in background
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
nohup "$SCRIPT_DIR/monitor-output.sh" "$TMUX_SESSION" &>/dev/null &

exit 0
