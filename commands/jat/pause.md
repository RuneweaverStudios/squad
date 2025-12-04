---
argument-hint:
---

Pause current task quickly (without full completion) and show available tasks to pivot to different work.

# Agent Pause - Quick Pivot

**Usage:**
- `/jat:pause` - Pause current task, show menu to pivot to different work

**What this command does:**
1. **Read & Respond to Agent Mail** (ALWAYS - before pausing)
2. **Quick Save** (always fast, no verification):
   - Quick commit or stash uncommitted changes
   - No tests, no lint, no quality checks
3. **Beads Task Management**:
   - Task stays in_progress (can resume later)
   - Release file reservations
4. **Announce Pause** in Agent Mail
5. **Show Available Tasks Menu**:
   - Show menu to pivot to different work
   - Does NOT auto-start

**Key behaviors:**
- **ALWAYS check Agent Mail first** - even when pausing quickly
- Mail = read + respond + ack (not just silent batch-ack)

**When to use:**
- **Emergency exit**: Laptop dying, need to stop immediately
- **Pivot to different work**: Got distracted, want to switch tasks
- **Blocked**: Can't continue, need to work on something else
- **Context switch**: Switching from frontend to backend work

**When NOT to use:**
- Task is actually complete → use `/jat:complete` instead

---

## Pause vs Ready-for-Review

These are different states with different purposes:

| Situation | Use | Marker | Dashboard |
|-----------|-----|--------|-----------|
| Work done, waiting for user to approve | `[JAT:NEEDS_REVIEW]` | Ready for Review (yellow) | User can click "Complete" |
| Incomplete, switching to different task | `/jat:pause` | `[JAT:IDLE]` | Shows paused, task stays in_progress |
| Emergency exit, work incomplete | `/jat:pause` | `[JAT:IDLE]` | Quick save & release locks |

**Key distinction:**
- **Ready for Review** = "I finished my work, please look at it"
- **Pause** = "I'm not done, but I need to switch to something else"

**Don't confuse them:**
- If you're done with the work → output `[JAT:NEEDS_REVIEW]` and wait
- If you're NOT done but need to pivot → use `/jat:pause`
- Pause does NOT require `[JAT:NEEDS_REVIEW]` first

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

### STEP 1: Get Current Task and Agent Identity

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

#### 1C: Get Current Task
```bash
# Get task from Beads (in_progress tasks for this agent)
bd list --json | jq -r --arg agent "$agent_name" \
  '.[] | select(.assignee == $agent and .status == "in_progress") | .id' | head -1
```

**Error handling:**
- If no session ID found → error "No active session. Run /jat:start first"
- If no agent name found → error "No agent registered. Run /jat:start first"
- If no in_progress task → warning "No task in progress" but continue to show menu

---

### STEP 2: Read & Respond to Agent Mail (ALWAYS)

**THIS STEP IS MANDATORY - even for quick pause.**

Do NOT silently batch-ack messages. Actually READ them and RESPOND if needed.

#### 2A: Check Inbox (with registration fallback)

**IMPORTANT:** If inbox fails with "Agent not found", the agent may not be registered in this session. Run `am-register` first (it's idempotent), then retry inbox.

```bash
# First attempt
am-inbox "$agent_name" --unread

# If it fails with "Agent not found":
# 1. Run: am-register --name "$agent_name" --program claude-code --model sonnet-4.5
# 2. Then retry: am-inbox "$agent_name" --unread
```

**Best practice:** Run these as separate Bash tool calls, not chained together.

#### 2B: Display Messages to User
Show the user what messages are in the inbox. Read each message.

#### 2C: Respond If Needed
- If a message asks a question → reply with `am-reply`
- If a message changes requirements → note it for later
- If a message says "stop" or "wait" → acknowledge
- If a message is informational → acknowledge it

#### 2D: Acknowledge Messages
```bash
# Only AFTER reading and responding
am-inbox "$agent_name" --unread --json | jq -r '.[].id' | while read msg_id; do
  am-ack "$msg_id" --agent "$agent_name"
done
```

**Why this matters even when pausing:**
- Messages might affect what task to pick next
- Messages might say "this task is blocked anyway"
- You need context BEFORE choosing next work

---

### STEP 3: Quick Save Changes

```bash
echo "Quick saving changes..."

# Check git status
git_status=$(git status --porcelain)

if [[ -n "$git_status" ]]; then
  git add .

  # Quick commit (no verification)
  task_json=$(bd show "$task_id" --json)
  task_title=$(echo "$task_json" | jq -r '.[0].title')

  git commit -m "$(cat <<EOF
WIP: $task_title

Task: $task_id (paused, incomplete)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

  echo "Quick commit done"
else
  echo "No changes to save"
fi
```

---

### STEP 4: Release File Reservations

```bash
# Release all file reservations for this agent
am-reservations --agent "$agent_name" --json | jq -r '.[].path_pattern' | while read pattern; do
  am-release "$pattern" --agent "$agent_name"
done
```

---

### STEP 5: Announce Pause

```bash
am-send "[$task_id] Paused: $task_title" \
  "Task paused by $agent_name (incomplete).

Status: Paused (in_progress)
Reason: Switching to different work

Agent is now available for next task." \
  --from "$agent_name" \
  --to @active \
  --thread "$task_id" \
  --importance low
```

---

### STEP 6: Show Available Tasks Menu

```bash
echo ""
echo "┌──────────────────────────────────────────────────────────────────────────┐"
echo "│  ⏸️  Task Paused: $task_id \"$task_title\""
echo "│  👤 Agent: $agent_name"
echo "│  [JAT:IDLE actions=start]"
echo "└──────────────────────────────────────────────────────────────────────────┘"
echo ""

# Get available tasks
bd ready --json

# Display tasks
# Show next steps
```

---

## Output Example

**Successful pause:**
```
📬 Checking Agent Mail...
  1 unread message

  From: BackendDev (10 min ago)
  Subject: API endpoint ready
  Body: The /users endpoint is now available for testing

  → Acknowledged

💾 Quick saving changes...
   ✅ Quick commit done

🔓 Releasing file reservations...
   ✅ Released 2 file patterns

📢 Announcing task pause...
   ✅ Sent to @active

┌──────────────────────────────────────────────────────────────────────────┐
│  ⏸️  Task Paused: jat-abc "Add user settings page"                       │
│  👤 Agent: JustGrove                                                     │
│  [JAT:IDLE actions=start]                                                │
└──────────────────────────────────────────────────────────────────────────┘

📋 Available Tasks to Switch To (7 total):

   [1] jat-xyz - Update documentation for new API (task)
   [1] jat-def - Fix authentication timeout bug (bug)
   [2] jat-ghi - Add dark mode toggle (feature)
   ...

💡 Next steps:
   • /jat:start jat-xyz - Start highest priority task
   • /jat:start <task-id> - Start different task
   • /jat:start jat-abc - Resume paused task
   • Close terminal if done for the day
```

**No other tasks available:**
```
📬 Checking Agent Mail...
  No unread messages

┌──────────────────────────────────────────────────────────────────────────┐
│  ⏸️  Task Paused: jat-abc "Add user settings page"                       │
│  👤 Agent: JustGrove                                                     │
│  [JAT:IDLE actions=start]                                                │
└──────────────────────────────────────────────────────────────────────────┘

📋 No other ready tasks available.

💡 Next steps:
   • /jat:start jat-abc - Resume this task
   • /jat:plan - Create new tasks
   • Close terminal if done for the day
```

---

## Error Handling

**No active session:**
```
No active session detected.
Run /jat:start to begin working
```

**No task in progress:**
```
No task currently in progress.

[Shows available tasks menu anyway]
```

**Git commit failed:**
```
Failed to quick commit changes:
   [git error message]

Fix git issues or use 'git stash' manually
```

---

## Step Summary

| Step | Name | When |
|------|------|------|
| 1 | Get Task and Agent Identity | ALWAYS |
| 2 | Read & Respond to Mail | ALWAYS |
| 3 | Quick Save Changes | ALWAYS |
| 4 | Release Reservations | ALWAYS |
| 5 | Announce Pause | ALWAYS |
| 6 | Show Available Tasks | ALWAYS |

---

## Key Design Principles

1. **Always check Agent Mail first**
   - Read messages BEFORE pausing
   - Respond to questions, don't just ack
   - Context matters for choosing next work

2. **Quick, not sloppy**
   - Fast commit without verification
   - But still proper commit message
   - Clean handoff if someone else picks up

3. **Show menu, don't auto-start**
   - User chooses next task
   - Can resume paused task
   - Or spawn new agent for different work

---

## Use Cases

**Emergency exit (laptop dying):**
```bash
# Battery at 2%!
/jat:pause
# → Check mail (fast)
# → Quick commit (2 seconds)
# → Release locks
# → Done! Close lid
```

**Pivot to different work:**
```bash
# Working on frontend, suddenly need to fix backend bug
/jat:pause
# → Shows backend tasks in menu
/jat:start jat-backend-bug
```

**Blocked by dependency:**
```bash
# Can't continue, waiting for API team
/jat:pause
# → Shows other tasks
/jat:start jat-different-task
# (Original task stays in_progress, can resume later)
```
