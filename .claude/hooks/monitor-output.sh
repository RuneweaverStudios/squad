#!/usr/bin/env bash
#
# monitor-output.sh - Real-time output activity monitor
#
# Monitors tmux pane output to detect when agent is actively generating text.
# Writes ephemeral state to /tmp/jat-activity-{session}.json for dashboard polling.
#
# Usage: monitor-output.sh <tmux-session-name>
# Started by: user-prompt-signal.sh (on user message)
# Terminates: After 30 seconds of no output change
#
# States:
#   generating - Output is growing (agent writing text)
#   thinking   - Output stable for 2+ seconds (agent processing)
#   idle       - Output stable for 30+ seconds (agent waiting)

set -euo pipefail

TMUX_SESSION="${1:-}"
if [[ -z "$TMUX_SESSION" ]]; then
    exit 1
fi

ACTIVITY_FILE="/tmp/jat-activity-${TMUX_SESSION}.json"
PID_FILE="/tmp/jat-monitor-${TMUX_SESSION}.pid"

# Write our PID so we can be killed by other hooks
echo $$ > "$PID_FILE"

# Cleanup on exit
trap "rm -f '$PID_FILE'" EXIT

prev_len=0
idle_count=0
last_state=""
touch_count=0

write_state() {
    local state="$1"
    local force="${2:-false}"
    # Write if state changed OR if force=true (to update mtime for freshness check)
    if [[ "$state" != "$last_state" ]] || [[ "$force" == "true" ]]; then
        echo "{\"state\":\"${state}\",\"since\":\"$(date -Iseconds)\",\"tmux_session\":\"${TMUX_SESSION}\"}" > "$ACTIVITY_FILE"
        last_state="$state"
        touch_count=0
    fi
}

# Initial state
write_state "generating"

while true; do
    # Capture current pane content length
    curr_len=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null | wc -c || echo "0")

    if [[ "$curr_len" -gt "$prev_len" ]]; then
        # Output is growing = agent generating text
        write_state "generating"
        idle_count=0
    else
        # Output stable
        ((idle_count++)) || true

        if [[ $idle_count -gt 20 ]]; then
            # 2+ seconds of no change = thinking/processing
            write_state "thinking"
        fi

        if [[ $idle_count -gt 300 ]]; then
            # 30+ seconds of no change = idle, self-terminate
            write_state "idle"
            exit 0
        fi
    fi

    # Keep file timestamp fresh for dashboard staleness check (every ~2 seconds)
    # Dashboard considers activity older than 30s as stale, so we update at least every 20 iterations
    ((touch_count++)) || true
    if [[ $touch_count -gt 20 ]]; then
        write_state "$last_state" true
    fi

    prev_len="$curr_len"
    sleep 0.1
done
