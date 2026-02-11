---
---

Pause current session for later resume (e.g., waiting for user reply). Session is killed but can be resumed with `claude -r`.

# Agent Pause - Suspend Session for Resume

**Usage:**
- `/jat:pause` - Pause the current session (kills tmux, preserves session ID for resume)

**What this command does:**
1. Calls the IDE pause API to write a pause signal and kill the tmux session
2. The session ID is preserved so it can be resumed later with `claude -r {sessionId}`
3. The task stays `in_progress` (not closed)

**When to use:**
- After sending a reply via `jat-signal reply` — pause so the session can resume when the user responds
- When waiting for external input that will arrive later
- When you want to free resources but keep conversation context

**Implementation:**

```bash
# Get session info
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)

# Call IDE pause API
curl -s -X POST "http://127.0.0.1:3333/api/sessions/${TMUX_SESSION}/pause" \
  -H 'Content-Type: application/json' \
  -d "{\"taskId\":\"TASK_ID\"}"
```

**Important:** After this command runs, the session will be killed. The agent does not need to do anything else — the IDE handles cleanup.

## Steps

1. **Identify current task** - Read from statusline or signal files
2. **Emit pause signal** by calling the IDE pause API:

```bash
# Get the tmux session name
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$TMUX_SESSION" ]; then
  echo "ERROR: Not running in tmux"
  exit 1
fi

# Extract task ID from the current signal file
TASK_ID=$(cat /tmp/jat-signal-tmux-${TMUX_SESSION}.json 2>/dev/null | jq -r '.taskId // empty' 2>/dev/null)
if [ -z "$TASK_ID" ]; then
  echo "ERROR: No task ID found in signal file"
  exit 1
fi

# Call pause API - this will kill the tmux session
curl -s -X POST "http://127.0.0.1:3333/api/sessions/${TMUX_SESSION}/pause" \
  -H 'Content-Type: application/json' \
  -d "{\"taskId\":\"${TASK_ID}\"}"
```

The session will end after the API call. No further agent action is needed.
