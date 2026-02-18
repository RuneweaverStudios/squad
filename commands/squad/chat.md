---
argument-hint: [agent-name task-id]
---

# /squad:chat - Conversational Chat Mode

**Lightweight mode for responding to messages from external channels (Telegram, Slack, etc.).**

Unlike `/squad:start` which runs a full task workflow, `/squad:chat` is optimized for conversational back-and-forth:
1. Read the message
2. Reply via `squad-signal reply`
3. Pause and wait for follow-up

## Usage

```
/squad:chat AgentName task-id    # Start chat on a task (IDE-spawned)
```

---

## What This Command Does

1. **Establish identity** - Use pre-registered agent (same as /squad:start)
2. **Read the task** - Get the message from task description
3. **Emit starting + working signals** - So IDE tracks the session
4. **Reply via `squad-signal reply`** - Send response back to originating channel
5. **Pause** - Call pause API so session can resume on next reply

**Skip entirely:** Memory search, prior task review, conflict detection, review signals.

---

## Implementation Steps

### STEP 1: Parse Parameters & Get Agent Identity

Same as `/squad:start` Steps 1-2:

```bash
get-current-session-id
```

```bash
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
PRE_REG_FILE=".claude/sessions/.tmux-agent-${TMUX_SESSION}"
if [[ -f "$PRE_REG_FILE" ]]; then
    AGENT_NAME=$(cat "$PRE_REG_FILE")
fi
```

If no pre-registration file, register manually:
```bash
am-register --name "$AGENT_NAME" --program claude-code --model sonnet-4.5
tmux rename-session "squad-${AGENT_NAME}"
```

### STEP 2: Get Task Details

```bash
st show "$TASK_ID" --json
```

Extract from the task:
- `title` - The original message
- `description` - Full context including sender info and any follow-up replies

### STEP 3: Emit Starting Signal

```bash
squad-signal starting '{
  "agentName": "AgentName",
  "sessionId": "...",
  "taskId": "task-id",
  "taskTitle": "message text",
  "project": "projectname",
  "model": "...",
  "tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"],
  "gitBranch": "master",
  "gitStatus": "clean",
  "uncommittedFiles": []
}'
```

### STEP 4: Update Task Status

```bash
st update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME"
```

### STEP 5: Emit Working Signal

```bash
squad-signal working '{
  "taskId": "task-id",
  "taskTitle": "message text",
  "approach": "Responding to chat message from external channel"
}'
```

### STEP 6: Process and Reply

Read the task description carefully. It contains:
- The original message (in the title and first line of description)
- Sender info (`From: @username`)
- Origin channel info (`Origin: telegram channel ...`)
- A reply template showing how to use `squad-signal reply`
- Any follow-up replies appended as `**Reply from @username** (timestamp):`

**Process the message and formulate your response.** This could be:
- Answering a question
- Acknowledging a request
- Asking for clarification

**Send the reply:**
```bash
squad-signal reply '{
  "taskId": "task-id",
  "message": "Your response here",
  "replyType": "answer"
}'
```

**Reply types (use exactly ONE per response):**
- `ack` - Acknowledgment (received, will look into it)
- `answer` - Direct answer to a question
- `progress` - Status update on ongoing work
- `completion` - Final response, task is done (then run `/squad:complete` instead of pausing)

**IMPORTANT:** Send only ONE `squad-signal reply` per response. Do NOT send multiple signals with different replyTypes for the same message.

### STEP 7: Pause Session

After sending the reply, pause the session so it can be resumed when the user replies:

```bash
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
TASK_ID="the-task-id"

curl -s -X POST "http://127.0.0.1:3333/api/sessions/${TMUX_SESSION}/pause" \
  -H 'Content-Type: application/json' \
  -d "{\"taskId\":\"${TASK_ID}\"}"
```

**Important:** After the pause API call, the session will be killed. No further action is needed.

---

## On Resume (Follow-up Replies)

When the user replies on the external channel, the ingest daemon will:
1. Detect the reply via thread tracking
2. Resume this session via `claude -r {sessionId}`
3. Inject the reply text via tmux send-keys

**The injected message will look like:**
```
The user replied on the originating channel (e.g. Telegram). You MUST send your response back using squad-signal reply (not just text output). Their message: {reply text}
```

**On receiving this message:**
1. Process the follow-up
2. Reply via `squad-signal reply` (CRITICAL - must use this, not just text output)
3. Pause again

This creates a conversational loop that continues until the task is closed.

---

## Completing a Chat Task

If the conversation reaches a natural end (user says thanks, question answered, etc.):
- Use `squad-signal reply` with `replyType: "completion"` for the final message (ONE signal only)
- Then run `/squad:complete` instead of pausing
- Do NOT send an `answer` signal AND a `completion` signal — pick one based on whether the conversation is ending

---

## Key Differences from /squad:start

| Aspect | /squad:start | /squad:chat |
|--------|-----------|-----------|
| Memory search | Yes | No |
| Prior task review | Yes | No |
| Conflict detection | Yes | No |
| File reservations | Yes | No |
| Review signal | Yes | No |
| Reply to channel | Optional | Always |
| Auto-pause | No | Yes |
| Resumable | No | Yes |
