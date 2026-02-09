#!/usr/bin/env bash
#
# pre-ask-user-question.sh - Claude PreToolUse hook for AskUserQuestion
#
# This hook captures the question data BEFORE the user answers,
# writing it to a temp file for the IDE to display.
#
# PreToolUse is required because PostToolUse runs after the user
# has already answered, making the question data irrelevant.

set -euo pipefail

# Read tool info from stdin
TOOL_INFO=$(cat)

# Extract session ID from hook data
SESSION_ID=$(echo "$TOOL_INFO" | jq -r '.session_id // ""' 2>/dev/null || echo "")

if [[ -z "$SESSION_ID" ]]; then
    exit 0  # Can't determine session, skip
fi

# Get tmux session name - try multiple methods
TMUX_SESSION=""
# Method 1: From TMUX env var (may not be passed to hook subprocess)
if [[ -n "${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
fi
# Method 2: From agent session file (more reliable)
if [[ -z "$TMUX_SESSION" ]]; then
    # Try multiple possible locations for agent file
    # Check both .claude/agent-{id}.txt (legacy) and .claude/sessions/agent-{id}.txt (current)
    for BASE_DIR in "." ~/code/*/; do
        for SUBDIR in "sessions" ""; do
            if [[ -n "$SUBDIR" ]]; then
                AGENT_FILE="${BASE_DIR}/.claude/${SUBDIR}/agent-${SESSION_ID}.txt"
            else
                AGENT_FILE="${BASE_DIR}/.claude/agent-${SESSION_ID}.txt"
            fi
            if [[ -f "$AGENT_FILE" ]]; then
                AGENT_NAME=$(cat "$AGENT_FILE" 2>/dev/null | tr -d '\n')
                if [[ -n "$AGENT_NAME" ]]; then
                    TMUX_SESSION="jat-${AGENT_NAME}"
                    break 2
                fi
            fi
        done
    done
fi

# Build question data JSON
QUESTION_DATA=$(echo "$TOOL_INFO" | jq -c --arg tmux "$TMUX_SESSION" '{
    session_id: .session_id,
    tmux_session: $tmux,
    timestamp: (now | todate),
    questions: .tool_input.questions
}' 2>/dev/null || echo "{}")

# Write to session ID file
QUESTION_FILE="/tmp/claude-question-${SESSION_ID}.json"
echo "$QUESTION_DATA" > "$QUESTION_FILE" 2>/dev/null || true

# Also write to tmux session name file for easy IDE lookup
if [[ -n "$TMUX_SESSION" ]]; then
    TMUX_QUESTION_FILE="/tmp/claude-question-tmux-${TMUX_SESSION}.json"
    echo "$QUESTION_DATA" > "$TMUX_QUESTION_FILE" 2>/dev/null || true
fi

# Also emit a needs_input signal so the IDE transitions to needs-input state
# This triggers the question polling in SessionCard
if [[ -n "$TMUX_SESSION" ]]; then
    # Extract the first question text for the signal
    QUESTION_TEXT=$(echo "$TOOL_INFO" | jq -r '.tool_input.questions[0].question // "Question from agent"' 2>/dev/null || echo "Question from agent")
    QUESTION_TYPE=$(echo "$TOOL_INFO" | jq -r 'if .tool_input.questions[0].multiSelect then "multi-select" else "choice" end' 2>/dev/null || echo "choice")

    # Get current task ID from JAT Tasks if available
    TASK_ID=""
    if command -v jt &>/dev/null && [[ -n "$AGENT_NAME" ]]; then
        TASK_ID=$(jt list --json 2>/dev/null | jq -r --arg agent "$AGENT_NAME" '.[] | select(.assignee == $agent and .status == "in_progress") | .id' 2>/dev/null | head -1 || echo "")
    fi

    # Build signal data - use type: "state" and state: "needs_input"
    # This matches the format expected by the SSE server in +server.ts
    # which maps signal states using SIGNAL_STATE_MAP (needs_input -> needs-input)
    SIGNAL_DATA=$(jq -n -c \
        --arg state "needs_input" \
        --arg session_id "$SESSION_ID" \
        --arg tmux "$TMUX_SESSION" \
        --arg task_id "$TASK_ID" \
        --arg question "$QUESTION_TEXT" \
        --arg question_type "$QUESTION_TYPE" \
        '{
            type: "state",
            state: $state,
            session_id: $session_id,
            tmux_session: $tmux,
            timestamp: (now | todate),
            task_id: $task_id,
            data: {
                taskId: $task_id,
                question: $question,
                questionType: $question_type
            }
        }' 2>/dev/null || echo "{}")

    # Write signal files
    echo "$SIGNAL_DATA" > "/tmp/jat-signal-${SESSION_ID}.json" 2>/dev/null || true
    echo "$SIGNAL_DATA" > "/tmp/jat-signal-tmux-${TMUX_SESSION}.json" 2>/dev/null || true

    # Also append to timeline for history tracking (JSONL format)
    TIMELINE_FILE="/tmp/jat-timeline-${TMUX_SESSION}.jsonl"
    echo "$SIGNAL_DATA" >> "$TIMELINE_FILE" 2>/dev/null || true
fi

exit 0
