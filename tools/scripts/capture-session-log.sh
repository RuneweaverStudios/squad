#!/bin/bash
# capture-session-log.sh - Capture tmux scrollback and append to unified session log
#
# Usage: capture-session-log.sh <session-name> <reason>
#   session-name: tmux session name (e.g., "squad-WisePrairie")
#   reason: compacted | paused | killed | completed
#
# Appends current tmux scrollback to .squad/logs/session-{session-name}.log
# with a separator indicating the reason for capture.

set -euo pipefail

SESSION_NAME="${1:-}"
REASON="${2:-unknown}"

if [[ -z "$SESSION_NAME" ]]; then
    echo "Usage: capture-session-log.sh <session-name> <reason>" >&2
    exit 1
fi

# Find project directory (look for .squad directory)
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
if [[ ! -d "$PROJECT_DIR/.squad" ]]; then
    # Try parent directory (if running from ide/)
    if [[ -d "$PROJECT_DIR/../.squad" ]]; then
        PROJECT_DIR="$PROJECT_DIR/.."
    else
        echo "Error: Cannot find .squad directory" >&2
        exit 1
    fi
fi

LOGS_DIR="$PROJECT_DIR/.squad/logs"
LOG_FILE="$LOGS_DIR/session-${SESSION_NAME}.log"

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Check if session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Warning: Session '$SESSION_NAME' not found, skipping capture" >&2
    exit 0
fi

# Capture scrollback
SCROLLBACK=$(tmux capture-pane -t "$SESSION_NAME" -p -S - -E - 2>/dev/null || true)

if [[ -z "$SCROLLBACK" ]]; then
    echo "Warning: Empty scrollback for session '$SESSION_NAME'" >&2
    exit 0
fi

# Generate timestamp
TIMESTAMP=$(date -Iseconds)

# Determine separator based on reason
case "$REASON" in
    compacted)
        ICON="📦"
        LABEL="CONTEXT COMPACTED"
        ;;
    paused)
        ICON="⏸️"
        LABEL="SESSION PAUSED"
        ;;
    killed)
        ICON="💀"
        LABEL="SESSION KILLED"
        ;;
    completed)
        ICON="✅"
        LABEL="TASK COMPLETED"
        ;;
    *)
        ICON="📝"
        LABEL="LOG CAPTURED"
        ;;
esac

# Build separator
SEPARATOR="
════════════════════════════════════════════════════════════════════════════════
$ICON $LABEL at $TIMESTAMP
════════════════════════════════════════════════════════════════════════════════
"

# If log file doesn't exist, add header
if [[ ! -f "$LOG_FILE" ]]; then
    cat > "$LOG_FILE" << HEADER
# Session Log: $SESSION_NAME
# Created: $TIMESTAMP
# This file accumulates session history across compactions, pauses, and completions.
================================================================================

HEADER
fi

# Append scrollback with separator
{
    echo "$SCROLLBACK"
    echo "$SEPARATOR"
} >> "$LOG_FILE"

echo "Captured scrollback to: $LOG_FILE (reason: $REASON)"
