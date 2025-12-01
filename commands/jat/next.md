---
argument-hint: [quick]
---

Find the highest priority ready task and start working. If you have a task in progress, complete it first.

# Agent Next - Drive Mode

> **⚠️ ADVANCED COMMAND - Not recommended for typical workflows**
>
> The standard model is **one agent = one session = one task**.
> - Agent starts → works on task → completes → session ends
> - User spawns new agent from dashboard for next task
>
> This command chains tasks in the same session, which:
> - Accumulates context and can degrade performance
> - Makes it harder to track which agent did what
> - Blurs the clean "one task per session" model
>
> **Use `/jat:complete` instead** - it properly closes the task and ends the session.
> Only use `/jat:next` if you specifically want to chain multiple tasks in one session.

**Usage:**
- `/jat:next` - **Complete current task + auto-start next** (full verification)
- `/jat:next quick` - Same but skip verification

**What this command does:**
1. **Check for in-progress task** (assigned to YOU, not others)
2. **Read & respond to Agent Mail** (ALWAYS - even if no current task)
3. **Complete current task** (if any): verify, commit, close, release, announce
4. **Find highest priority ready task** from `bd ready`
5. **Start working** on that task immediately

**Key behaviors:**
- **NEVER take over another agent's task** - only complete YOUR in-progress tasks
- **NEVER error if no task in progress** - just find and start the next one
- **ALWAYS check Agent Mail** - even if no current task
- **Always respect dependencies** - `bd ready` only shows unblocked tasks

**When to use (advanced scenarios only):**
- Long coding sessions where context accumulation is acceptable
- Batch processing multiple small tasks
- When you specifically want to chain tasks without spawning new agents

---

## CRITICAL: "Ready for Review" vs "Complete"

**These are two different states. Never confuse them.**

| State | Meaning | Display | Beads Status |
|-------|---------|---------|--------------|
| **Ready for Review** | Code work done, awaiting user decision | "🔍 READY FOR REVIEW" | `in_progress` |
| **Complete** | Closed in Beads, reservations released | "✅ TASK COMPLETE" | `closed` |

**NEVER say "Task Complete" until AFTER:**
1. Changes committed
2. `bd close` has run successfully
3. Reservations released
4. Completion announced via Agent Mail

**When you finish coding work, display:**
```
🔍 READY FOR REVIEW: jat-xyz
[JAT:READY actions=complete]
[JAT:NEEDS_REVIEW]

Changes made:
  - [summary of changes]

Next steps:
  • Review the changes above
  • /jat:complete - Complete this task (recommended)
```

**See `/jat:start` for the full "Ready for Review" template with all markers.**

**Only after running completion steps, display:**
```
✅ TASK COMPLETE: jat-xyz
  Committed: abc123
  Closed in Beads
  Reservations released
  Announced to @active
```

---

## Bash Syntax Patterns for Claude Code

**CRITICAL:** Claude Code's Bash tool escapes command substitution syntax. You MUST use these patterns:

### CORRECT Patterns

**Pattern 1: Use Read/Write tools (RECOMMENDED)**
```bash
# Step 1: Get value
~/code/jat/scripts/get-current-session-id
# → "a019c84c-7b54-45cc-9eee-dd6a70dea1a3"

# Step 2: Use Write tool with that value
Write(.claude/agent-a019c84c-7b54-45cc-9eee-dd6a70dea1a3.txt, "AgentName")
```

**Pattern 2: Explicit variable assignment with semicolon**
```bash
# Works: Explicit assignment with semicolon
SESSION_ID="a019c84c-7b54-45cc-9eee-dd6a70dea1a3"; echo "$SESSION_ID"

# Works: Use test command with && / ||
test -f "$file" && echo "exists" || echo "not found"
```

### WRONG Patterns (Will Cause Syntax Errors)

```bash
# BROKEN: Command substitution in assignment
SESSION_ID=$(~/code/jat/scripts/get-current-session-id)
# Error: gets escaped

# BROKEN: if statement with &&
SESSION_ID="abc" && if [[ -f "$file" ]]; then echo "yes"; fi
# Error: syntax error
```

---

## Implementation Steps

### STEP 1: Get Agent Identity

#### 1A: Get Session ID
```bash
~/code/jat/scripts/get-current-session-id
# → Extract session_id value
```

#### 1B: Get Agent Name
```bash
# Read .claude/agent-{session_id}.txt
# → Extract agent_name
```

**If no agent registered:**
- Auto-register using `/jat:start` flow
- Create new agent with random name
- Write to session file

---

### STEP 2: Check for YOUR In-Progress Task

```bash
# Get task from Beads (in_progress tasks for THIS AGENT ONLY)
bd list --json | jq -r --arg agent "$agent_name" \
  '.[] | select(.assignee == $agent and .status == "in_progress") | .id' | head -1
```

**CRITICAL: Only check tasks assigned to YOUR agent name.**

**If task found assigned to you:**
- Set `HAS_CURRENT_TASK=true`
- Store task_id and task_title for later steps

**If NO task found for you:**
- Set `HAS_CURRENT_TASK=false`
- Steps 4-7 will be skipped (no task to complete)

**If task found but assigned to DIFFERENT agent:**
- That's NOT your task - treat as "no task found"
- Do NOT take it over

---

### STEP 3: Read & Respond to Agent Mail (ALWAYS)

**THIS STEP IS MANDATORY - even if HAS_CURRENT_TASK=false**

Do NOT silently batch-ack messages. Actually READ them and RESPOND if needed.

#### 3A: Check Inbox (with registration fallback)

**IMPORTANT:** If inbox fails with "Agent not found", the agent may not be registered in this session. Run `am-register` first (it's idempotent), then retry inbox.

```bash
# First attempt
am-inbox "$agent_name" --unread

# If it fails with "Agent not found":
# 1. Run: am-register --name "$agent_name" --program claude-code --model sonnet-4.5
# 2. Then retry: am-inbox "$agent_name" --unread
```

**Best practice:** Run these as separate Bash tool calls, not chained together.

#### 3B: Display Messages to User
Show the user what messages are in the inbox. Read each message.

#### 3C: Respond If Needed
- If a message asks a question → reply with `am-reply`
- If a message changes requirements → adjust your plan
- If a message says "stop" or "wait" → pause and clarify
- If a message is informational → acknowledge it

#### 3D: Acknowledge Messages
```bash
# Only AFTER reading and responding
am-inbox "$agent_name" --unread --json | jq -r '.[].id' | while read msg_id; do
  am-ack "$msg_id" --agent "$agent_name"
done
```

**Why this matters:**
- Messages might say "don't merge yet, found a bug"
- Messages might say "I already completed this task"
- Messages might say "requirements changed"
- You need context BEFORE completing/starting work

---

### STEP 4: Verify Current Task (Only if HAS_CURRENT_TASK=true)

**Skip if HAS_CURRENT_TASK=false or quick mode**

```bash
echo "Verifying task before completion..."
# Run verification checks (tests, lint, etc.)
```

---

### STEP 5: Commit Changes (Only if HAS_CURRENT_TASK=true)

**Skip if HAS_CURRENT_TASK=false**

```bash
echo "Committing changes..."

git_status=$(git status --porcelain)

if [[ -n "$git_status" ]]; then
  git add .
  git commit -m "task: $task_title

Task: $task_id

Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
else
  echo "No changes to commit"
fi
```

---

### STEP 6: Close Task in Beads (Only if HAS_CURRENT_TASK=true)

**Skip if HAS_CURRENT_TASK=false**

```bash
bd close "$task_id" --reason "Completed by $agent_name"
```

---

### STEP 7: Release Reservations (Only if HAS_CURRENT_TASK=true)

**Skip if HAS_CURRENT_TASK=false**

```bash
# Release all file reservations for this agent
am-reservations --agent "$agent_name" --json | jq -r '.[].path_pattern' | while read pattern; do
  am-release "$pattern" --agent "$agent_name"
done
```

---

### STEP 8: Announce Completion (Only if HAS_CURRENT_TASK=true)

**Skip if HAS_CURRENT_TASK=false**

```bash
am-send "[$task_id] Completed: $task_title" \
  "Task completed by $agent_name." \
  --from "$agent_name" \
  --to @active \
  --thread "$task_id"
```

---

### STEP 9: Find Next Task (ALWAYS)

**This step ALWAYS runs, regardless of whether there was a current task.**

```bash
echo "Finding next task..."

# Get highest priority ready task
bd ready --json
```

Select the first (highest priority) task from the list.

**If no ready tasks:**
```
No ready tasks available.
All caught up!

Options:
  - Create a task: bd create "Task title" --type task --priority 1
  - View all tasks: bd list
  - Check blocked tasks: bd list --status open
```
Exit here if no tasks available.

---

### STEP 10: Update Task in Beads

```bash
# Get task details
bd show "$next_task" --json

# Update task status and assignee
bd update "$next_task" --status in_progress --assignee "$agent_name"
```

---

### STEP 11: Create Reservations

Reserve files that will be modified for this task.

```bash
# Parse task description for file patterns
# Reserve appropriate files

am-reserve "relevant/file/patterns/**" \
  --agent "$agent_name" \
  --ttl 3600 \
  --exclusive \
  --reason "$next_task"
```

**Guidelines:**
- Reserve files mentioned in task description
- Use appropriate glob patterns (not too broad)
- Set reasonable TTL (1 hour default)
- Include task ID in reason

---

### STEP 12: Announce Task Start

```bash
am-send "[$next_task] Starting: $next_task_title" \
  "Starting work on $next_task" \
  --from "$agent_name" \
  --to @active \
  --thread "$next_task"
```

---

### STEP 13: Display Task Details & Begin Work

```bash
bd show "$next_task"
```

Display full task details to the user and begin working on the task.

---

## Quick Mode Behavior

**When using `/jat:next quick`:**

**Skipped:**
- STEP 4: Task verification (tests, lint, security)

**Still done (NEVER skip these):**
- STEP 3: Read & respond to Agent Mail
- STEP 5: Commit changes
- STEP 6: Close task in Beads
- STEP 7: Release reservations
- STEP 8: Announce completion
- STEPS 9-13: Find and start next task

---

## Output Examples

**With current task to complete:**
```
📬 Checking Agent Mail...
  2 unread messages

  From: OtherAgent (5 min ago)
  Subject: [jat-abc] Quick question
  Body: Should we use Redis or in-memory cache?

  → Replying: "Let's use Redis for persistence"

  From: TeamLead (1 hour ago)
  Subject: Sprint update
  Body: Sprint ends Friday, prioritize P0/P1 tasks

  → Acknowledged

Completing current task: jat-abc

Verifying...
  ✓ Tests pass
  ✓ Lint clean

Committing changes...
  Committed: "task: Add user settings page"

Closing task in Beads...
  ✓ Closed jat-abc

Releasing reservations...
  ✓ Released 2 file patterns

Announcing completion...
  ✓ Sent to @active

Finding next task...

Starting next task:
  Task: jat-xyz
  Priority: P1
  Title: Update documentation for new API

Reserving files...
  ✓ Reserved docs/**/*.md

Announcing start...
  ✓ Sent to @active

╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 STARTING WORK: jat-xyz                             ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [JAT:WORKING task=jat-xyz]                                              ║
╚══════════════════════════════════════════════════════════════════════════╝

[Task details displayed, ready to work]
```

**No current task (just starting):**
```
📬 Checking Agent Mail...
  No unread messages

No task in progress for ShortShore.

Finding next task...

Starting next task:
  Task: jat-xyz
  Priority: P1
  Title: Update documentation for new API

Reserving files...
  ✓ Reserved docs/**/*.md

Announcing start...
  ✓ Sent to @active

╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 STARTING WORK: jat-xyz                             ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [JAT:WORKING task=jat-xyz]                                              ║
╚══════════════════════════════════════════════════════════════════════════╝

[Task details displayed, ready to work]
```

**No ready tasks available:**
```
📬 Checking Agent Mail...
  No unread messages

No task in progress for ShortShore.

Finding next task...

No ready tasks available.
All caught up!

Options:
  - Create a task: bd create "Task title" --type task --priority 1
  - View all tasks: bd list
  - Check blocked tasks: bd list --status open
```

---

## Error Handling

**No agent registered:**
```
No agent registered for this session.
Auto-registering new agent...
  Created: ShortShore

📬 Checking Agent Mail...
[continues normally]
```

**Git commit failed:**
```
Failed to commit changes:
  [git error message]

Fix git issues and try again.
```

**Reservation conflict:**
```
⚠️ File reservation conflict:
  src/**/*.ts is reserved by OtherAgent (expires in 30 min)

Options:
  1. Wait for reservation to expire
  2. Contact OtherAgent via am-send
  3. Choose a different task
```

---

## Key Design Principles

1. **Always check Agent Mail first**
   - Read messages BEFORE completing or starting work
   - Respond to questions, don't just ack
   - Context matters for decision-making

2. **Never take over another agent's task**
   - Only complete tasks assigned to YOUR agent name
   - Other agents' in-progress tasks are invisible to you

3. **Never error on "no current task"**
   - Just skip completion steps and find next task
   - The goal is always: get working on something

4. **Always use `bd ready`**
   - Respects dependencies automatically
   - Only shows unblocked tasks
   - Sorted by priority

5. **Explicit steps, no bundling**
   - Each step is separate and visible
   - Harder to accidentally skip steps
   - Clear audit trail

---

## Step Summary

| Step | Name | When |
|------|------|------|
| 1 | Get Agent Identity | ALWAYS |
| 2 | Check for In-Progress Task | ALWAYS |
| 3 | Read & Respond to Mail | ALWAYS |
| 4 | Verify Task | If HAS_TASK and not quick |
| 5 | Commit Changes | If HAS_TASK |
| 6 | Close Task in Beads | If HAS_TASK |
| 7 | Release Reservations | If HAS_TASK |
| 8 | Announce Completion | If HAS_TASK |
| 9 | Find Next Task | ALWAYS |
| 10 | Update Task in Beads | If task found |
| 11 | Create Reservations | If task found |
| 12 | Announce Task Start | If task found |
| 13 | Display & Begin Work | If task found |
