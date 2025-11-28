---
argument-hint:
---

Complete current task properly with full verification, then show menu of available tasks and recommend next task.

# Agent Complete - Finish Task Properly

**Usage:**
- `/jat:complete` - Complete current task with full verification, show menu

**What this command does:**
1. **Read & Respond to Agent Mail** (ALWAYS - before completing)
2. **Full Completion Protocol**:
   - Verify task (tests, lint, security, browser checks)
   - Commit changes with proper message
3. **Beads Task Management**:
   - Mark task as complete in Beads (`bd close`)
   - Release file reservations
4. **Announce Completion** in Agent Mail
5. **Next Task Selection**:
   - Show available tasks menu
   - Display recommended next task with one-line command
   - Wait for user to choose (does NOT auto-start)

**Key behaviors:**
- **ALWAYS check Agent Mail first** - before completing work
- Mail = read + respond + ack (not just silent batch-ack)

**When to use:**
- After you display "🔍 READY FOR REVIEW" and user approves
- **Careful workflow**: You want to choose next task manually
- **Context switch**: Might want different type of work next
- **Review point**: Want to check status before continuing
- **End of work**: Last task before closing terminal

**When NOT to use:**
- Want to keep going automatically → use `/jat:next` instead
- Need to pivot quickly → use `/jat:pause` instead

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

**The typical flow:**
1. You finish coding → display "🔍 READY FOR REVIEW"
2. User reviews and runs `/jat:complete`
3. You run completion steps (commit, close, release, announce)
4. THEN display "✅ TASK COMPLETE"

**Why this matters:**
- Other agents check Beads to see if tasks are available
- If you say "complete" but haven't run `bd close`, another agent will see the task as still in-progress
- This causes confusion and coordination problems

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
- If no in_progress task → **continue to Step 1D** (spontaneous work detection)

---

### STEP 1D: Spontaneous Work Detection (If No Task Found)

**Only execute if Step 1C found no `in_progress` task.**

This step detects ad-hoc work done without a formal Beads task and offers to create a backfilled task record for proper attribution and audit trail.

#### Analyze Conversation Context

Review recent conversation for **completed work signals**:

1. **Work completion phrases:**
   - "I added...", "I fixed...", "I implemented...", "I refactored..."
   - "Built...", "Created...", "Removed...", "Changed...", "Updated..."
   - "Done with...", "Finished...", "Completed..."
   - "The fix...", "The solution...", "Root cause was..."

2. **File/code references:**
   - File paths mentioned in tool calls or discussion
   - Code snippets shared or modified
   - Technical details of implementation

3. **Problem/solution context:**
   - What problem was being solved?
   - What was the approach taken?
   - Any decisions or trade-offs made?

#### Analyze Git State

```bash
# Check for uncommitted changes
git status --porcelain

# Get summary of what changed
git diff --stat

# Recent commits (may include work from this session)
git log --oneline -5
```

#### Synthesize Work Summary

Combine conversation signals + git state to infer:
- **Title**: Verb + noun describing the work (e.g., "Fix jat CLI -p flag causing non-interactive sessions")
- **Type**: `bug`, `feature`, `task`, or `chore` based on nature of work
- **Description**: What was done and why
- **Files touched**: From git diff + conversation context

#### Present Proposal

**If work detected**, display proposal and ask for confirmation:

```
╔══════════════════════════════════════════════════════════════════════════╗
║               🔍 SPONTANEOUS WORK DETECTED                               ║
╚══════════════════════════════════════════════════════════════════════════╝

No formal task was in progress, but I detected work in this session:

📋 Proposed Task:
   Title: [inferred title]
   Type: [task/bug/feature/chore]
   Description: [inferred description]

📁 Files Changed:
   [list from git status/diff]

Would you like me to create a backfilled task record and complete it?
This preserves attribution and maintains the audit trail.

[Proceed? Y/n]
```

#### If User Confirms

```bash
# Create the backfilled task (already in_progress since work is done)
bd create "[title]" \
  --type [type] \
  --description "[description]" \
  --assignee "$agent_name" \
  --status in_progress

# Extract task_id from output
# Set $task_id and $task_title variables
# Continue to Step 2 (Read & Respond to Mail)
```

#### If User Declines

```
Understood. No task record created.

Options:
  • /jat:start - Pick up a new task
  • bd create "..." - Manually create a task
  • Just commit your changes directly with git
```

**Exit the /jat:complete flow** - do not continue to Step 2.

#### If No Work Detected

```
No task in progress and no spontaneous work detected.

Options:
  • /jat:start - Pick a task to work on
  • bd list - View available tasks
```

**Exit the /jat:complete flow** - do not continue to Step 2.

---

#### Real Example: Spontaneous Bug Fix

**Conversation signals detected:**
```
User: "jat jat 4 crashed all terminals"
Agent: "I see the issue... The -p flag makes Claude non-interactive..."
Agent: "Let me update the jat script..."
Agent: "Now try running jat jat 4 again"
```

**Git state:**
```
M cli/jat
```

**Proposed backfill:**
```
Title: Fix jat CLI -p flag causing non-interactive sessions
Type: bug
Description: The -p flag was causing Claude Code to run in print mode
             (non-interactive), exiting immediately after processing.
             Removed -p and pass prompt as positional argument instead.
Files: cli/jat
```

---

### STEP 2: Read & Respond to Agent Mail (ALWAYS)

**THIS STEP IS MANDATORY - runs before any completion work.**

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
- If a message changes requirements → adjust your plan
- If a message says "stop" or "wait" → pause and clarify
- If a message is informational → acknowledge it

#### 2D: Acknowledge Messages
```bash
# Only AFTER reading and responding
am-inbox "$agent_name" --unread --json | jq -r '.[].id' | while read msg_id; do
  am-ack "$msg_id" --agent "$agent_name"
done
```

**Why this matters:**
- Messages might say "don't complete yet, found a bug"
- Messages might say "requirements changed"
- Messages might say "I need to review first"
- You need context BEFORE completing work

---

### STEP 3: Verify Task

```bash
echo "Verifying task before completion..."

# Run verification checks:
# - Tests
# - Lint
# - Security scan
# - Browser checks (if applicable)

# If verification fails, STOP and report issues
# Do NOT continue to completion
```

---

### STEP 4: Commit Changes

```bash
echo "Committing changes..."

# Get task details for commit message
task_json=$(bd show "$task_id" --json)
task_title=$(echo "$task_json" | jq -r '.[0].title')
task_type=$(echo "$task_json" | jq -r '.[0].issue_type')

# Check git status
git_status=$(git status --porcelain)

if [[ -n "$git_status" ]]; then
  git add .
  git commit -m "$(cat <<EOF
$task_type: $task_title

Task: $task_id

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
else
  echo "No changes to commit"
fi
```

---

### STEP 5: Mark Task Complete in Beads

```bash
bd close "$task_id" --reason "Completed by $agent_name"
```

---

### STEP 6: Release File Reservations

```bash
# Release all file reservations for this agent
am-reservations --agent "$agent_name" --json | jq -r '.[].path_pattern' | while read pattern; do
  am-release "$pattern" --agent "$agent_name"
done
```

---

### STEP 7: Announce Completion

```bash
am-send "[$task_id] Completed: $task_title" \
  "Task completed by $agent_name.

Status: Complete
Type: $task_type
Verification: Full (tests, lint, security)

Agent is now available for next task." \
  --from "$agent_name" \
  --to @active \
  --thread "$task_id"
```

---

### STEP 8: Show Final Summary + Available Tasks Menu

```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Task Completed: $task_id \"$task_title\""
echo "👤 Agent: $agent_name"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get available tasks
bd ready --json

# Display recommended next task (highest priority)
# Display full task menu
# Show next steps
```

---

## Quick Mode Behavior

**This command does NOT have a quick mode.**

For quick completion without verification, use `/jat:next quick` instead.

**Still done (NEVER skip these):**
- STEP 2: Read & respond to Agent Mail
- All other steps

---

## Output Examples

**Spontaneous work completion (no prior task):**
```
📋 Checking for in_progress task...
   No task found for SwiftMoon

🔍 Analyzing session for spontaneous work...

╔══════════════════════════════════════════════════════════════════════════╗
║               🔍 SPONTANEOUS WORK DETECTED                               ║
╚══════════════════════════════════════════════════════════════════════════╝

No formal task was in progress, but I detected work in this session:

📋 Proposed Task:
   Title: Fix jat CLI -p flag causing non-interactive sessions
   Type: bug
   Description: The -p flag was causing Claude Code to run in print mode
                (non-interactive), exiting immediately after processing.
                Removed -p and pass prompt as positional argument instead.

📁 Files Changed:
   M cli/jat

Would you like me to create a backfilled task record and complete it?
This preserves attribution and maintains the audit trail.

[Proceed? Y/n] Y

✓ Created backfill task: jat-abc "Fix jat CLI -p flag causing non-interactive sessions"

📬 Checking Agent Mail...
  No unread messages

🔍 Verifying task before completion...
   ✅ No tests configured
   ✅ Lint clean

💾 Committing changes...
   ✅ Committed: "bug: Fix jat CLI -p flag causing non-interactive sessions"

✅ Marking task complete in Beads...
   ✅ Closed jat-abc

📢 Announcing task completion...
   ✅ Sent to @active

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Task Completed: jat-abc "Fix jat CLI -p flag causing non-interactive sessions"
👤 Agent: SwiftMoon
📝 Note: Backfilled from spontaneous work
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Available tasks menu follows...]
```

---

**Standard completion (existing task):**
```
📬 Checking Agent Mail...
  1 unread message

  From: TeamLead (20 min ago)
  Subject: [jat-abc] Review note
  Body: Looks good, just add a comment to the main function

  → Acknowledged (already addressed in code)

🔍 Verifying task before completion...
   ✅ Tests passed (12/12)
   ✅ Lint clean
   ✅ Security scan clean

💾 Committing changes...
   ✅ Committed: "feat: Add user settings page"

✅ Marking task complete in Beads...
   ✅ Closed jat-abc

🔓 Releasing file reservations...
   ✅ Released 2 file patterns

📢 Announcing task completion...
   ✅ Sent to @active

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Task Completed: jat-abc "Add user settings page"
👤 Agent: JustGrove
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Recommended Next Task:
   → jat-xyz "Update documentation for new API" (Priority: P1, Type: task)

   Type: /jat:start jat-xyz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Available Tasks (8 total):

   [1] jat-xyz - Update documentation for new API (task)
   [1] jat-def - Fix authentication timeout bug (bug)
   [2] jat-ghi - Add dark mode toggle (feature)
   ...

💡 Next steps:
   • /jat:start jat-xyz - Start recommended task
   • /jat:start <task-id> - Start different task
   • /jat:status - Review current state
   • Close terminal if done for the day

[JAT:IDLE actions=start]
```

**The `[JAT:IDLE ...]` marker tells the dashboard this agent completed work and is waiting for next task selection.**

---

## Error Handling

**No active session:**
```
No active session detected.
Run /jat:start to begin working
```

**No task in progress (with spontaneous work):**
```
🔍 SPONTANEOUS WORK DETECTED
[Proposal displayed, user confirms]
✓ Created backfill task: jat-xyz
[Continues to normal completion flow]
```

**No task in progress (no work detected):**
```
No task in progress and no spontaneous work detected.
Run /jat:start to pick a task
```

**Verification failed:**
```
Task verification failed:
   • 2 tests failing
   • 5 lint errors

Fix issues and try again
Or run /jat:verify to see detailed error report
```

---

## Step Summary

| Step | Name | When |
|------|------|------|
| 1A-C | Get Task and Agent Identity | ALWAYS |
| 1D | Spontaneous Work Detection | If no in_progress task found |
| 2 | Read & Respond to Mail | ALWAYS (after task identified) |
| 3 | Verify Task | ALWAYS |
| 4 | Commit Changes | ALWAYS |
| 5 | Mark Task Complete | ALWAYS |
| 6 | Release Reservations | ALWAYS |
| 7 | Announce Completion | ALWAYS |
| 8 | Show Menu + Recommended | ALWAYS |

---

## Key Design Principles

1. **Always check Agent Mail first**
   - Read messages BEFORE completing work
   - Respond to questions, don't just ack
   - Context matters for decision-making

2. **Full verification required**
   - No quick mode for this command
   - Use `/jat:next quick` if you need speed

3. **Show menu, don't auto-start**
   - User chooses next task
   - Recommend highest priority
   - Different from `/jat:next` which auto-continues
