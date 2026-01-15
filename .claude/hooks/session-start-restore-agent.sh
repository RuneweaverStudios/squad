#!/bin/bash
# Session start hook: Restore agent identity and inject workflow context after compaction
# This ensures the agent file exists AND the agent knows where it was in the workflow
#
# Uses WINDOWID-based file - stable across /clear (unlike PPID which changes)
# Each terminal window has unique WINDOWID, avoiding race conditions

PROJECT_DIR="$(pwd)"
CLAUDE_DIR="$PROJECT_DIR/.claude"

# Use WINDOWID for persistence (matches pre-compact hook)
# Falls back to PPID if WINDOWID not available
WINDOW_KEY="${WINDOWID:-$PPID}"
PERSISTENT_AGENT_FILE="$CLAUDE_DIR/.agent-identity-${WINDOW_KEY}"
PERSISTENT_STATE_FILE="$CLAUDE_DIR/.agent-workflow-state-${WINDOW_KEY}.json"

# Read session ID from stdin JSON (provided by Claude Code)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

if [[ -z "$SESSION_ID" ]]; then
    # No session ID - can't do anything
    exit 0
fi

# Also update the PPID-based session file for other tools
echo "$SESSION_ID" > "/tmp/claude-session-${PPID}.txt"

# Use sessions/ subdirectory to keep .claude/ clean
mkdir -p "$CLAUDE_DIR/sessions"
AGENT_FILE="$CLAUDE_DIR/sessions/agent-${SESSION_ID}.txt"

# Track if we restored or already had agent
AGENT_NAME=""

# If agent file already exists for this session, read the name
if [[ -f "$AGENT_FILE" ]]; then
    AGENT_NAME=$(cat "$AGENT_FILE" | tr -d '\n')
fi

# Check if we have a saved agent identity to restore
# Priority 1: WINDOWID-based file (for compaction recovery)
# Priority 2: Tmux session name based file (for IDE-spawned agents)
if [[ -z "$AGENT_NAME" ]] && [[ -f "$PERSISTENT_AGENT_FILE" ]]; then
    AGENT_NAME=$(cat "$PERSISTENT_AGENT_FILE" | tr -d '\n')

    if [[ -n "$AGENT_NAME" ]]; then
        # Restore the agent file for this new session ID
        echo "$AGENT_NAME" > "$AGENT_FILE"

        # Ensure agent is registered in Agent Mail
        if command -v am-register &>/dev/null; then
            # Check if already registered
            if ! sqlite3 ~/.agent-mail.db "SELECT 1 FROM agents WHERE name = '$AGENT_NAME'" 2>/dev/null | grep -q 1; then
                am-register --name "$AGENT_NAME" --program claude-code --model opus-4.5 2>/dev/null
            fi
        fi

        # Log for debugging
        echo "[SessionStart] Restored agent: $AGENT_NAME for session $SESSION_ID (WINDOWID=$WINDOW_KEY)" >> "$CLAUDE_DIR/.agent-activity.log"
    fi
fi

# Priority 2: Check for IDE-spawned agent identity (tmux session name based)
# The IDE writes .claude/sessions/.tmux-agent-{tmuxSessionName} before spawning
if [[ -z "$AGENT_NAME" ]]; then
    # Get tmux session name (e.g., "jat-SwiftRiver")
    TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
    if [[ -n "$TMUX_SESSION" ]]; then
        TMUX_AGENT_FILE="$CLAUDE_DIR/sessions/.tmux-agent-${TMUX_SESSION}"
        if [[ -f "$TMUX_AGENT_FILE" ]]; then
            AGENT_NAME=$(cat "$TMUX_AGENT_FILE" | tr -d '\n')

            if [[ -n "$AGENT_NAME" ]]; then
                # Write the session ID-based agent file
                echo "$AGENT_NAME" > "$AGENT_FILE"

                # Log for debugging
                echo "[SessionStart] Restored agent from tmux: $AGENT_NAME for session $SESSION_ID (tmux=$TMUX_SESSION)" >> "$CLAUDE_DIR/.agent-activity.log"
            fi
        fi
    fi
fi

# Check for saved workflow state and inject context reminder
TASK_ID=""
if [[ -f "$PERSISTENT_STATE_FILE" ]]; then
    SIGNAL_STATE=$(jq -r '.signalState // "unknown"' "$PERSISTENT_STATE_FILE" 2>/dev/null)
    TASK_ID=$(jq -r '.taskId // ""' "$PERSISTENT_STATE_FILE" 2>/dev/null)
    TASK_TITLE=$(jq -r '.taskTitle // ""' "$PERSISTENT_STATE_FILE" 2>/dev/null)

    # Only output context if we have meaningful state
    if [[ -n "$TASK_ID" ]]; then
        # Determine what signal should be emitted next based on last state
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

        # Output as compact marker for IDE + structured context for agent
        echo "[JAT:WORKING task=$TASK_ID]"
        echo ""
        echo "=== JAT WORKFLOW CONTEXT (restored after compaction) ==="
        echo "Agent: $AGENT_NAME"
        echo "Task: $TASK_ID - $TASK_TITLE"
        echo "Last Signal: $SIGNAL_STATE"
        echo "Workflow Step: $WORKFLOW_STEP"
        echo "NEXT ACTION REQUIRED: $NEXT_ACTION"
        echo "========================================================="

        echo "[SessionStart] Injected workflow context: state=$SIGNAL_STATE, task=$TASK_ID" >> "$CLAUDE_DIR/.agent-activity.log"
    fi
fi

# Fallback: If no state file but agent has in_progress task, still output working marker
if [[ -z "$TASK_ID" ]] && [[ -n "$AGENT_NAME" ]] && command -v bd &>/dev/null; then
    TASK_ID=$(bd list --json 2>/dev/null | jq -r --arg a "$AGENT_NAME" '.[] | select(.assignee == $a and .status == "in_progress") | .id' 2>/dev/null | head -1)
    if [[ -n "$TASK_ID" ]]; then
        TASK_TITLE=$(bd show "$TASK_ID" --json 2>/dev/null | jq -r '.[0].title // ""' 2>/dev/null)
        echo "[JAT:WORKING task=$TASK_ID]"
        echo ""
        echo "=== JAT WORKFLOW CONTEXT (restored from Beads) ==="
        echo "Agent: $AGENT_NAME"
        echo "Task: $TASK_ID - $TASK_TITLE"
        echo "Last Signal: unknown (no state file)"
        echo "NEXT ACTION: Emit 'working' signal if continuing work, or 'review' signal if done"
        echo "=================================================="

        echo "[SessionStart] Fallback context from Beads: task=$TASK_ID" >> "$CLAUDE_DIR/.agent-activity.log"
    fi
fi
