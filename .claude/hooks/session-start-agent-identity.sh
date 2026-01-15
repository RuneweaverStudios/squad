#!/usr/bin/env bash
#
# session-start-agent-identity.sh - SessionStart hook for JAT
#
# Maps session_id → agent_name by reading the IDE pre-registration file.
# This enables the PostToolUse signal hook to route signals correctly.
#
# Input (stdin): {"session_id": "...", "source": "startup|resume|clear|compact", ...}
# Output: Context about agent identity (if found)
#
# Writes: .claude/sessions/agent-{session_id}.txt

set -euo pipefail

DEBUG_LOG="/tmp/jat-session-start-hook.log"
log() {
    echo "$(date -Iseconds) $*" >> "$DEBUG_LOG"
}

# Read hook input from stdin
HOOK_INPUT=$(cat)
log "SessionStart hook triggered"
log "Input: ${HOOK_INPUT:0:200}"

# Extract session_id
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")
SOURCE=$(echo "$HOOK_INPUT" | jq -r '.source // ""' 2>/dev/null || echo "")
log "Session ID: $SESSION_ID, Source: $SOURCE"

if [[ -z "$SESSION_ID" ]]; then
    log "ERROR: No session_id in hook input"
    exit 0
fi

# Get tmux session name
TMUX_SESSION=""
if [[ -n "${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
fi
log "Tmux session: $TMUX_SESSION"

if [[ -z "$TMUX_SESSION" ]]; then
    log "Not in tmux, skipping agent identity setup"
    exit 0
fi

# Build list of project directories to search
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
log "Search dirs: $SEARCH_DIRS"

# Look for pre-registration file in each project
AGENT_NAME=""
PRE_REG_FILE=""
for BASE_DIR in $SEARCH_DIRS; do
    CANDIDATE="${BASE_DIR}/.claude/sessions/.tmux-agent-${TMUX_SESSION}"
    log "Checking pre-reg file: $CANDIDATE"
    if [[ -f "$CANDIDATE" ]]; then
        AGENT_NAME=$(cat "$CANDIDATE" 2>/dev/null | tr -d '\n')
        PRE_REG_FILE="$CANDIDATE"
        log "Found pre-reg file! Agent: $AGENT_NAME"
        break
    fi
done

if [[ -z "$AGENT_NAME" ]]; then
    log "No pre-registration file found for tmux session: $TMUX_SESSION"
    exit 0
fi

# Write session file to ALL project directories that have .claude/sessions/
for BASE_DIR in $SEARCH_DIRS; do
    SESSIONS_DIR="${BASE_DIR}/.claude/sessions"
    if [[ -d "$SESSIONS_DIR" ]]; then
        SESSION_FILE="${SESSIONS_DIR}/agent-${SESSION_ID}.txt"
        echo "$AGENT_NAME" > "$SESSION_FILE"
        log "Wrote session file: $SESSION_FILE"
    fi
done

# Output context for Claude to see
echo "=== JAT Agent Identity Restored ==="
echo "Agent: $AGENT_NAME"
echo "Session: ${SESSION_ID:0:8}..."
echo "Tmux: $TMUX_SESSION"
echo "Source: $SOURCE"

log "Hook completed successfully"
exit 0
