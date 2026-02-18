#!/bin/bash
# Pre-compact hook: Save current agent identity, workflow state, and terminal scrollback before compaction
# This ensures we can restore identity, workflow context, AND terminal history after compaction
#
# Uses WINDOWID-based file - stable across /clear (unlike PPID which changes)
# Each terminal window has unique WINDOWID, avoiding race conditions

PROJECT_DIR="$(pwd)"
CLAUDE_DIR="$PROJECT_DIR/.claude"
SQUAD_LOGS_DIR="$PROJECT_DIR/.squad/logs"

# Use WINDOWID for persistence (stable across /clear, unique per terminal)
# Falls back to PPID if WINDOWID not available
WINDOW_KEY="${WINDOWID:-$PPID}"
PERSISTENT_AGENT_FILE="$CLAUDE_DIR/.agent-identity-${WINDOW_KEY}"
PERSISTENT_STATE_FILE="$CLAUDE_DIR/.agent-workflow-state-${WINDOW_KEY}.json"

# Find the current session's agent file
SESSION_ID=$(cat /tmp/claude-session-${PPID}.txt 2>/dev/null | tr -d '\n')
# Use sessions/ subdirectory to keep .claude/ clean
AGENT_FILE="$CLAUDE_DIR/sessions/agent-${SESSION_ID}.txt"

# Get tmux session name for signal file lookup and scrollback capture
TMUX_SESSION=""
if [[ -n "${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
fi

# ============================================================================
# CAPTURE TERMINAL SCROLLBACK BEFORE COMPACTION
# This preserves the pre-compaction terminal history that would otherwise be lost
# Uses unified session log: .squad/logs/session-{sessionName}.log
# ============================================================================
if [[ -n "$TMUX_SESSION" ]]; then
    # Use the unified capture script
    CAPTURE_SCRIPT="$HOME/.local/bin/capture-session-log.sh"
    if [[ -x "$CAPTURE_SCRIPT" ]]; then
        PROJECT_DIR="$PROJECT_DIR" "$CAPTURE_SCRIPT" "$TMUX_SESSION" "compacted" 2>/dev/null || true
        echo "[PreCompact] Captured scrollback for $TMUX_SESSION (compacted)" >> "$CLAUDE_DIR/.agent-activity.log"
    else
        # Fallback: inline capture if script not found
        mkdir -p "$SQUAD_LOGS_DIR" 2>/dev/null
        LOG_FILE="$SQUAD_LOGS_DIR/session-${TMUX_SESSION}.log"
        TIMESTAMP=$(date -Iseconds)

        SCROLLBACK=$(tmux capture-pane -t "$TMUX_SESSION" -p -S - -E - 2>/dev/null || true)
        if [[ -n "$SCROLLBACK" ]]; then
            # Add header if new file
            if [[ ! -f "$LOG_FILE" ]]; then
                echo "# Session Log: $TMUX_SESSION" > "$LOG_FILE"
                echo "# Created: $TIMESTAMP" >> "$LOG_FILE"
                echo "================================================================================" >> "$LOG_FILE"
                echo "" >> "$LOG_FILE"
            fi
            # Append scrollback with separator
            echo "$SCROLLBACK" >> "$LOG_FILE"
            echo "" >> "$LOG_FILE"
            echo "════════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"
            echo "📦 CONTEXT COMPACTED at $TIMESTAMP" >> "$LOG_FILE"
            echo "════════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"
            echo "" >> "$LOG_FILE"

            echo "[PreCompact] Captured scrollback to: $LOG_FILE" >> "$CLAUDE_DIR/.agent-activity.log"
        fi
    fi
fi

if [[ -f "$AGENT_FILE" ]]; then
    AGENT_NAME=$(cat "$AGENT_FILE" | tr -d '\n')

    # Save agent name to window-specific location
    echo "$AGENT_NAME" > "$PERSISTENT_AGENT_FILE"

    # Build workflow state JSON
    SIGNAL_STATE="unknown"
    TASK_ID=""
    TASK_TITLE=""

    # Try to get last signal state from signal file
    SIGNAL_FILE="/tmp/squad-signal-tmux-${TMUX_SESSION}.json"
    if [[ -f "$SIGNAL_FILE" ]]; then
        # Signal file may have .state or .signalType depending on source
        SIGNAL_STATE=$(jq -r '.state // .signalType // .type // "unknown"' "$SIGNAL_FILE" 2>/dev/null)
        # Task ID may be in .task_id or .data.taskId
        TASK_ID=$(jq -r '.task_id // .data.taskId // .taskId // ""' "$SIGNAL_FILE" 2>/dev/null)
        TASK_TITLE=$(jq -r '.data.taskTitle // .taskTitle // ""' "$SIGNAL_FILE" 2>/dev/null)
    fi

    # If no signal file, try to get task from SQUAD Tasks
    if [[ -z "$TASK_ID" ]] && command -v st &>/dev/null; then
        TASK_ID=$(st list --json 2>/dev/null | jq -r --arg a "$AGENT_NAME" '.[] | select(.assignee == $a and .status == "in_progress") | .id' 2>/dev/null | head -1)
        if [[ -n "$TASK_ID" ]]; then
            TASK_TITLE=$(st show "$TASK_ID" --json 2>/dev/null | jq -r '.[0].title // ""' 2>/dev/null)
        fi
    fi

    # Save workflow state
    cat > "$PERSISTENT_STATE_FILE" << EOF
{
  "agentName": "$AGENT_NAME",
  "signalState": "$SIGNAL_STATE",
  "taskId": "$TASK_ID",
  "taskTitle": "$TASK_TITLE",
  "savedAt": "$(date -Iseconds)"
}
EOF

    # Output marker for IDE state detection
    echo "[SQUAD:COMPACTING]"

    # Log for debugging
    echo "[PreCompact] Saved agent: $AGENT_NAME, state: $SIGNAL_STATE, task: $TASK_ID (WINDOWID=$WINDOW_KEY)" >> "$CLAUDE_DIR/.agent-activity.log"
fi
