---
argument-hint: [agent-name | task-id | agent-name task-id]
---

# /jat:start - Begin Working

**One agent = one session = one task.** Each Claude session handles exactly one task from start to completion.

## Usage

```
/jat:start                      # Create agent, show available tasks
/jat:start task-id              # Create agent, start that task
/jat:start AgentName            # Resume as AgentName, show tasks
/jat:start AgentName task-id    # Resume as AgentName, start task (dashboard spawn)
```

**Quick mode** (skip conflict checks): Add `quick` to any command
```
/jat:start task-id quick
/jat:start AgentName task-id quick
```

---

## What This Command Does

1. **Register agent** - Create new or resume existing
2. **Check Agent Mail** - Read messages before starting work
3. **Select task** - From parameter or show recommendations
4. **Start work** - Reserve files, update Beads, announce start

---

## Bash Patterns for Claude Code

**CRITICAL:** Claude Code escapes `$()`. Use these patterns:

```bash
# CORRECT: Get value first, then use it
~/code/jat/scripts/get-current-session-id
# → Copy the output, use in next command

# CORRECT: Semicolon separation
SESSION_ID="abc123"; echo "$SESSION_ID"

# WRONG: Command substitution (gets escaped)
SESSION_ID=$(~/code/jat/scripts/get-current-session-id)  # ❌ Broken
```

---

## Implementation Steps

### STEP 1: Parse Parameters

```bash
PARAM="$1"   # agent-name, task-id, or empty
PARAM2="$2"  # task-id or "quick"
QUICK_MODE=false

# Detect quick mode
if [[ "$PARAM" == "quick" ]] || [[ "$PARAM2" == "quick" ]] || [[ "$3" == "quick" ]]; then
  QUICK_MODE=true
fi

# Determine what was passed
if [[ -z "$PARAM" ]] || [[ "$PARAM" == "quick" ]]; then
  PARAM_TYPE="none"
elif bd show "$PARAM" --json >/dev/null 2>&1; then
  PARAM_TYPE="task-id"
  TASK_ID="$PARAM"
elif [[ -n "$PARAM2" ]] && [[ "$PARAM2" != "quick" ]] && bd show "$PARAM2" --json >/dev/null 2>&1; then
  PARAM_TYPE="agent-and-task"
  REQUESTED_AGENT="$PARAM"
  TASK_ID="$PARAM2"
else
  PARAM_TYPE="agent-name"
  REQUESTED_AGENT="$PARAM"
fi
```

---

### STEP 2: Get/Create Agent

#### 2A: Get Session ID
```bash
~/code/jat/scripts/get-current-session-id
# → Save this value for step 2D
```

#### 2B: Register Agent

**If agent name provided:**
```bash
if am-agents | grep -q "^  ${REQUESTED_AGENT}$"; then
  echo "✓ Resuming agent: $REQUESTED_AGENT"
  AGENT_NAME="$REQUESTED_AGENT"
else
  echo "Creating agent: $REQUESTED_AGENT"
  am-register --name "$REQUESTED_AGENT" --program claude-code --model sonnet-4.5
  AGENT_NAME="$REQUESTED_AGENT"
fi
```

**If no agent name (create new):**
```bash
am-register --program claude-code --model sonnet-4.5
# → Extract agent name from output
```

#### 2C: Write Session File
```bash
# Ensure sessions directory exists
mkdir -p .claude/sessions

# Use Write tool with session ID from 2A
Write(.claude/sessions/agent-{session_id}.txt, "AgentName")
```

#### 2D: Clean Up Old Session Files (TTL)
```bash
# Remove session files older than 7 days to prevent clutter
find .claude/sessions -name "agent-*.txt" -mtime +7 -delete 2>/dev/null
find .claude/sessions -name "*-activity.jsonl" -mtime +7 -delete 2>/dev/null
# Also clean legacy location
find .claude -maxdepth 1 -name "agent-*.txt" -mtime +7 -delete 2>/dev/null
find .claude -maxdepth 1 -name "*-activity.jsonl" -mtime +7 -delete 2>/dev/null
```

#### 2E: Rename tmux Session

**🚨 CRITICAL - DO NOT SKIP**

```bash
# Check current name
tmux display-message -p '#S'
# → If "jat-pending-*", rename it:

tmux rename-session "jat-{AgentName}"

# Verify
tmux display-message -p '#S'
# → Must show "jat-{AgentName}"
```

Without this, the dashboard can't track your session.

---

### STEP 3: Check Agent Mail

**ALWAYS do this before selecting a task.**

```bash
am-inbox "$AGENT_NAME" --unread
```

- Read each message
- Reply if someone asked a question (`am-reply`)
- Adjust plans if requirements changed
- Acknowledge after reading: `am-ack {msg_id} --agent "$AGENT_NAME"`

---

### STEP 4: Select Task

**If task-id provided → start it (continue to Step 5)**

**If no task-id → show recommendations and exit:**

```bash
bd ready --json | jq -r '.[] | "  [\(.priority)] \(.id) - \(.title)"'
```

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         📋 Available Tasks                               ║
╚══════════════════════════════════════════════════════════════════════════╝

  [P0] jat-xyz - Critical bug fix
  [P1] jat-abc - Add user settings page

To start a task: /jat:start TASK_ID
```

**EXIT HERE if no task-id was provided.**

---

### STEP 5: Conflict Detection

**Skip if QUICK_MODE=true**

```bash
# Check file reservations
am-reservations --json
# → Warn if task files are locked by another agent

# Check git status
git diff-index --quiet HEAD -- || echo "Warning: uncommitted changes"

# Check dependencies
bd show "$TASK_ID" --json | jq -r '.[0].dependencies[]'
# → Verify all dependencies are closed
```

---

### STEP 6: Start Task

```bash
# Update Beads
bd update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME"

# Reserve files (based on task description)
am-reserve "relevant/files/**" --agent "$AGENT_NAME" --ttl 3600 --reason "$TASK_ID"

# Announce
am-send "[$TASK_ID] Starting: $TASK_TITLE" \
  "Starting work on $TASK_ID" \
  --from "$AGENT_NAME" --to @active --thread "$TASK_ID"
```

---

### STEP 7: Display Start Banner

**You MUST output the `[JAT:WORKING]` marker for dashboard state tracking.**

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 STARTING WORK: {TASK_ID}                           ║
║  [JAT:WORKING task={TASK_ID}]                                            ║
╚══════════════════════════════════════════════════════════════════════════╝

✅ Agent: {AGENT_NAME}
📋 Task: {TASK_TITLE}
🎯 Priority: P{X}
📁 Type: {bug/feature/task}

┌─ TASK DETAILS ─────────────────────────────────────────────────────────┐
│  {DESCRIPTION}                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 8: Evaluate Clarity

**Before coding, check if the task is clear.**

If unclear, request clarification:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ❓ NEED CLARIFICATION: {TASK_ID}                                        │
│  [JAT:NEEDS_INPUT]                                                       │
└──────────────────────────────────────────────────────────────────────────┘

Questions:
  1. [Specific question]
```

**Wait for user response.** When they answer, output `[JAT:WORKING task={TASK_ID}]` to resume.

---

### STEP 9: Begin Work

```bash
bd show "$TASK_ID"
```

Read the full task details and start coding.

---

## When You Finish Working

**🚨 CRITICAL: You MUST output the `[JAT:NEEDS_REVIEW]` marker when done.**

The dashboard detects your state by scanning terminal output. Without this marker, you'll show "Working" even when you're done. This confuses users who don't know you're waiting for them.

**Always output this exact format:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🔍 READY FOR REVIEW: {TASK_ID}                                          │
│  [JAT:NEEDS_REVIEW]                                                      │
└──────────────────────────────────────────────────────────────────────────┘

Changes made:
  - [summary of changes]
  - [files modified]

Run /jat:complete when ready to close this task.
```

**When to output this marker:**
- After completing any substantial code changes
- After writing documentation or analysis
- After fixing a bug (even if more testing is recommended)
- Before asking "should I mark this complete?"
- Whenever you're done and waiting for user input

**Do NOT:**
- Say "I'm done" without the marker
- Just stop outputting and wait
- Use vague phrases like "let me know if you have questions"

**Do NOT say "Task Complete" until the user runs `/jat:complete`.**

The task is still `in_progress` in Beads until `/jat:complete` runs `bd close`.

---

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ONE AGENT = ONE TASK                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Dashboard spawns agent                                                │
│         │                                                               │
│         ▼                                                               │
│   ┌──────────┐                                                          │
│   │ STARTING │  Agent initializing, running /jat:start                  │
│   └────┬─────┘                                                          │
│        │ [JAT:WORKING task=xxx]                                         │
│        ▼                                                                │
│   ┌──────────┐         ┌─────────────┐                                  │
│   │ WORKING  │ ◄─────► │ NEEDS INPUT │  Agent asks question             │
│   └────┬─────┘         └─────────────┘                                  │
│        │ [JAT:NEEDS_REVIEW]                                             │
│        ▼                                                                │
│   ┌──────────┐                                                          │
│   │  REVIEW  │  Code done, awaiting user                                │
│   └────┬─────┘                                                          │
│        │ /jat:complete                                                  │
│        ▼                                                                │
│   ┌──────────┐                                                          │
│   │   DONE   │  Task closed, session ends                               │
│   └──────────┘                                                          │
│                                                                         │
│   To work on another task → spawn a new agent                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard State Markers

| Marker | State | Dashboard Color |
|--------|-------|-----------------|
| (none) | Starting | Cyan |
| `[JAT:WORKING task=xxx]` | Working | Blue |
| `[JAT:NEEDS_INPUT]` | Needs Input | Orange |
| `[JAT:NEEDS_REVIEW]` | Ready for Review | Yellow |
| `[JAT:COMPLETED]` | Done | Green |

**Most recent marker wins.** Dashboard scans terminal output for these patterns.

**Why markers matter:**
- Without explicit markers, users don't know you're waiting for them
- The dashboard shows "Working" indefinitely if no state change is detected
- Agents that "go quiet" without a marker appear stuck
- **Always output `[JAT:NEEDS_REVIEW]` when you finish working**

---

## Error Handling

**Task not found:**
```
Error: Task 'invalid-id' not found in Beads
Use 'bd list' to see available tasks
```

**Reservation conflict:**
```
⚠️ File conflict: src/**/*.ts reserved by OtherAgent (expires in 30 min)

Options:
  1. Wait for reservation to expire
  2. Contact OtherAgent via am-send
  3. Choose a different task
```

---

## Command Comparison

| Command | Purpose |
|---------|---------|
| `/jat:start` | Begin working (this command) |
| `/jat:complete` | Close task, release locks, end session |
| `/jat:status` | Check current task status |
| `/jat:pause` | Pause work, release locks temporarily |

---

## Quick Reference

```bash
# Show available tasks
/jat:start

# Start specific task
/jat:start jat-abc

# Resume as specific agent
/jat:start MyAgent jat-abc

# Skip conflict checks
/jat:start jat-abc quick

# When done coding - ALWAYS output this:
echo "🔍 READY FOR REVIEW: {task-id}"
echo "[JAT:NEEDS_REVIEW]"
echo ""
echo "Changes made:"
echo "  - ..."
# → Then wait for user to run /jat:complete
```
