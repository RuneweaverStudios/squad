---
argument-hint: [agent-name | task-id | auto | quick]
---

Get to work! Unified smart command that handles registration, task selection, conflict detection, and actually starts work.

# Start Working - Unified Smart Command

**Usage:**
- `/jat:start` - **Auto-create new agent** (fast! no prompt), show task recommendations
- `/jat:start auto` - **Auto-attack mode**: create agent, pick highest priority task, start immediately
- `/jat:start resume` - Show menu to **choose from existing agents**
- `/jat:start agent-name` - Register as specific agent, show tasks
- `/jat:start task-id` - Auto-register if needed, start that task
- `/jat:start task-id quick` - Skip conflict checks (fast mode)

**What this command does:**
1. **Smart Registration:** By default creates new agent instantly; use `resume` parameter to choose from existing agents
2. **Read & respond to Agent Mail** (ALWAYS - even before task selection)
3. **Task Selection:** From parameter, conversation context, or priority
4. **Conflict Detection:** File locks, git changes, dependencies
5. **Actually Starts Work:** Reserves files, sends Agent Mail, updates Beads

**Key behaviors:**
- **ALWAYS check Agent Mail** - before selecting or starting any task
- **Global agent uniqueness** - agents are unique across all projects
- **Session persistence** - updates `.claude/agent-{session_id}.txt` for statusline
- **Smart cleanup** - auto-releases file reservations from closed tasks

**IMPORTANT: Agents are globally unique across all projects.** You cannot have two agents with the same name, even in different projects. This simplifies registration - we just check `am-agents` globally without any project filtering.

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

### STEP 0: Parse Parameters

Extract parameter and detect mode:

```bash
PARAM="$1"  # Could be: empty, "resume", "auto", agent-name, task-id, or "quick"
PARAM2="$2" # Could be: empty, task-id, or "quick"
QUICK_MODE=false
RESUME_MODE=false
AUTO_MODE=false

# Check for resume mode
if [[ "$PARAM" == "resume" ]]; then
  RESUME_MODE=true
  PARAM_TYPE="none"
fi

# Check for auto mode (auto-attack backlog)
if [[ "$PARAM" == "auto" ]]; then
  AUTO_MODE=true
  PARAM_TYPE="none"
fi

# Check for quick mode (can be $1 or $2 or $3)
if [[ "$PARAM" == "quick" ]] || [[ "$2" == "quick" ]] || [[ "$3" == "quick" ]]; then
  QUICK_MODE=true
fi

# Determine parameter type
if [[ "$RESUME_MODE" == "false" ]] && [[ "$AUTO_MODE" == "false" ]]; then
  if [[ -z "$PARAM" ]] || [[ "$PARAM" == "quick" ]]; then
    PARAM_TYPE="none"
  elif bd show "$PARAM" --json >/dev/null 2>&1; then
    # First arg IS a task-id
    PARAM_TYPE="task-id"
    TASK_ID="$PARAM"
  elif [[ -n "$PARAM2" ]] && [[ "$PARAM2" != "quick" ]] && bd show "$PARAM2" --json >/dev/null 2>&1; then
    # First arg is NOT a task-id, but second arg IS a task-id
    # This is the "agent-name task-id" pattern from dashboard spawn
    PARAM_TYPE="agent-and-task"
    REQUESTED_AGENT="$PARAM"
    TASK_ID="$PARAM2"
  else
    PARAM_TYPE="agent-name"
    REQUESTED_AGENT="$PARAM"
  fi
fi
```

---

### STEP 1: Get Agent Identity

#### 1A: Get Session ID
```bash
~/code/jat/scripts/get-current-session-id
# → Extract session_id value
```

#### 1B: Check Current Agent Status
```bash
# Check if agent file exists
SESSION_ID="a019c84c-..."; test -f ".claude/agent-${SESSION_ID}.txt" && cat ".claude/agent-${SESSION_ID}.txt" || echo "NO_AGENT"
```

#### 1C: Handle Agent Registration Based on Parameter

**If PARAM_TYPE == "agent-and-task" (dashboard spawn with explicit agent):**

This is the PREFERRED path from dashboard spawn. Both agent name and task ID are provided explicitly, eliminating any ambiguity about which agent to use.

```bash
AGENT_NAME="$REQUESTED_AGENT"

# Check if agent exists in am-agents
if am-agents | grep -q "^  ${AGENT_NAME}$"; then
  echo "✓ Using pre-created agent: $AGENT_NAME"
  # Agent already exists from spawn endpoint - just use it
else
  # Edge case: agent name provided but doesn't exist yet
  echo "Creating agent: $AGENT_NAME"
  am-register --name "$AGENT_NAME" --program claude-code --model sonnet-4.5
fi

# Task ID is already set from parameter parsing
# No need to detect assignee - we have explicit agent name
```

**If PARAM_TYPE == "task-id" (legacy: task-id only, no agent name):**

When ONLY a task-id is provided (legacy behavior), check if the task already has an assignee. This handles backward compatibility but is less reliable than the explicit agent-and-task path.

```bash
# Get task assignee
EXISTING_ASSIGNEE=$(bd show "$TASK_ID" --json | jq -r '.[0].assignee // empty')

if [[ -n "$EXISTING_ASSIGNEE" ]]; then
  # Check if assignee exists in am-agents
  if am-agents | grep -q "^  ${EXISTING_ASSIGNEE}$"; then
    # REUSE the existing agent (don't create a new one!)
    AGENT_NAME="$EXISTING_ASSIGNEE"
    echo "✓ Resuming assigned agent: $AGENT_NAME"
    # Skip am-register - agent already exists
  else
    # Assignee name exists but agent not registered (edge case)
    # Create the agent with that name
    echo "Creating agent: $EXISTING_ASSIGNEE"
    am-register --name "$EXISTING_ASSIGNEE" --program claude-code --model sonnet-4.5
    AGENT_NAME="$EXISTING_ASSIGNEE"
  fi
else
  # No assignee - create new agent (fallback to default behavior)
  echo "No assignee on task, creating new agent..."
  am-register --program claude-code --model sonnet-4.5
  # → Extract agent name from output
fi
```

**Why this matters:** When the dashboard's spawn endpoint launches a task:
1. Spawn creates an agent (e.g., "DullHill") via `am-register`
2. Spawn assigns the task to that agent via `bd update --assignee DullHill`
3. Spawn sends `/jat:start DullHill task-id` to Claude (PREFERRED: explicit agent name)

The explicit agent name in the command ensures `/jat:start` uses the EXACT agent that spawn created. The legacy task-id-only path exists for backward compatibility but is less reliable.

**If PARAM_TYPE == "agent-name":**
```bash
AGENT_NAME="$REQUESTED_AGENT"

# Simple global lookup
if am-agents | grep -q "^  ${AGENT_NAME}$"; then
  echo "Resuming existing agent: $AGENT_NAME"
else
  echo "Creating new agent: $AGENT_NAME"
  am-register --name "$AGENT_NAME" --program claude-code --model sonnet-4.5
fi
```

**If no agent registered (default mode, no task-id):**
```bash
# Auto-create new agent immediately (FAST!)
am-register --program claude-code --model sonnet-4.5
# → Extract agent name from output
# → WAIT for success message before proceeding (avoid race condition with inbox)
```

**If resume mode:**
```bash
# Show menu of ONLY logged-out agents
# Filter out agents with active session files
# User chooses which agent to resume
```

#### 1D: Write to Session File

```bash
# Use Write tool with session ID from Step 1A
Write(.claude/agent-{session_id}.txt, "AgentName")
```

#### 1E: Rename tmux Session (CRITICAL - DO NOT SKIP)

**🚨 CRITICAL STEP - ALWAYS RUN THIS 🚨**

If the launcher created a `jat-pending-*` tmux session, rename it to `jat-{AgentName}` so the dashboard can track this agent properly.

```bash
# Step 1: Check current tmux session name
tmux display-message -p '#S'
# → If output is "jat-pending-*", continue to Step 2

# Step 2: Rename the session (replace AGENT_NAME with your actual agent name)
tmux rename-session "jat-LightSun"  # Example: jat-{YourAgentName}
```

**What happens if you skip this:**
- ❌ `/work` page shows "pending-882263-1" instead of your agent name
- ❌ Dashboard can't track your session properly
- ❌ Agent grid shows correct name but `/work` panel is wrong
- ❌ Session appears disconnected even though it's running

**Why this matters:**
- Dashboard counts active agents by looking for `jat-*` tmux sessions
- Sessions named `jat-pending-*` are filtered out as "still being set up"
- Agent names like "BoldRock" → session becomes `jat-BoldRock`
- This enables proper agent tracking and the "kill session" feature

---

### STEP 2: Smart Cleanup of Previous Work

**Check for and clean up stale state from previous tasks.**

```bash
# Get active reservations for this agent
am-reservations --agent "$AGENT_NAME" --json

# For each reservation:
#   - Extract task ID from reason
#   - Check task status in Beads
#   - If task is closed: auto-release silently
#   - If task is in_progress: ask user what to do
```

**Benefits:**
- Automatically cleans up completed work
- Prevents stale statusline display
- Asks user for guidance on ambiguous cases

---

### STEP 3: Read & Respond to Agent Mail (ALWAYS)

**THIS STEP IS MANDATORY - runs before any task selection or work.**

Do NOT silently batch-ack messages. Actually READ them and RESPOND if needed.

#### 3A: Check Inbox (with registration fallback)

**IMPORTANT:** Run `am-register` and `am-inbox` as separate sequential commands. If inbox fails with "Agent not found", the registration may not have fully committed - run register again, then retry inbox.

```bash
# First attempt
am-inbox "$AGENT_NAME" --unread

# If it fails with "Agent not found":
# 1. Run am-register again (it's idempotent - will just resume existing agent)
# 2. Then retry am-inbox
```

**Best practice:** Always run these as separate Bash tool calls, not chained with `;` or `&&` in the same command. This ensures each command fully completes before the next starts.

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
am-inbox "$AGENT_NAME" --unread --json | jq -r '.[].id' | while read msg_id; do
  am-ack "$msg_id" --agent "$AGENT_NAME"
done
```

**Why this matters:**
- Messages might say "don't start that task, it's blocked"
- Messages might say "I already completed this task"
- Messages might say "requirements changed"
- You need context BEFORE selecting or starting work

---

### STEP 4: Determine Task to Work On

#### If PARAM_TYPE == "task-id":
```bash
TASK_ID="$PARAM"
# Verify task exists
if ! bd show "$TASK_ID" --json >/dev/null 2>&1; then
  echo "Error: Task '$TASK_ID' not found in Beads"
  exit 1
fi
# Continue to STEP 5
```

#### If AUTO_MODE == true (auto-attack backlog):
```bash
# Get highest priority ready task and start it immediately
READY_TASKS=$(bd ready --json)
READY_COUNT=$(echo "$READY_TASKS" | jq 'length')

if [[ "$READY_COUNT" -eq 0 ]]; then
  echo "╔══════════════════════════════════════════════════════════════════════════╗"
  echo "║                    ✅ Backlog Clear!                                      ║"
  echo "╚══════════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "No ready tasks available. All caught up!"
  echo ""
  echo "Options:"
  echo "  - Create a task: bd create \"Task title\" --type task --priority 1"
  echo "  - View all tasks: bd list"
  echo "  - Check blocked tasks: bd list --status blocked"
  exit 0
fi

# Pick highest priority task (first in sorted list)
TASK_ID=$(echo "$READY_TASKS" | jq -r '.[0].id')
TASK_TITLE=$(echo "$READY_TASKS" | jq -r '.[0].title')
TASK_PRIORITY=$(echo "$READY_TASKS" | jq -r '.[0].priority')

echo "🎯 Auto-selected: [$TASK_PRIORITY] $TASK_ID - $TASK_TITLE"
echo ""

# Continue to STEP 5 (start this task)
```

#### If PARAM_TYPE == "none" or "agent-name" (no auto mode):
```bash
# Show task recommendations (DO NOT auto-start)
READY_TASKS=$(bd ready --json)
READY_COUNT=$(echo "$READY_TASKS" | jq 'length')

if [[ "$READY_COUNT" -eq 0 ]]; then
  echo "No ready tasks available"
  exit 0
fi

# Display tasks
echo "Available Tasks:"
echo "$READY_TASKS" | jq -r '.[] | "  [\(.priority)] \(.id) - \(.title)"'

echo ""
echo "To start working on a task, run:"
echo "   /jat:start TASK_ID"

# EXIT HERE - don't continue to remaining steps
exit 0
```

---

**The following steps (5-11) ONLY execute when a task-id is provided.**

---

### STEP 5: Detect Task Type (Bulk vs Normal)

```bash
task_info=$(bd show "$TASK_ID" --json)
title=$(echo "$task_info" | jq -r '.[0].title')
labels=$(echo "$task_info" | jq -r '.[0].labels[]' 2>/dev/null || echo "")

# Check bulk indicators
if echo "$title" | grep -iE "(fix .* errors|eliminate|cleanup|remove all)" >/dev/null; then
  TASK_MODE="bulk"
else
  TASK_MODE="normal"
fi
```

---

### STEP 6: Conflict Detection (Skip if QUICK_MODE or BULK)

**Only run if QUICK_MODE=false AND TASK_MODE=normal:**

#### 6A: Check File Reservations
```bash
RESERVATIONS=$(am-reservations --json)
# Check if task files are locked by another agent
# If conflicts found: show which agent has locks
```

#### 6B: Check Git Working Directory
```bash
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "Warning: Uncommitted changes detected"
  echo "Consider committing or stashing before starting new work"
fi
```

#### 6C: Check Task Dependencies
```bash
deps=$(echo "$task_info" | jq -r '.[0].dependencies[]' 2>/dev/null)
# Verify all dependency tasks are completed
# If blocked: show blocking tasks
```

---

### STEP 7: Update Task in Beads

```bash
# Get task details
bd show "$TASK_ID" --json
TASK_TITLE=$(bd show "$TASK_ID" --json | jq -r '.[0].title')
TASK_PRIORITY=$(bd show "$TASK_ID" --json | jq -r '.[0].priority')

# Update task status and assignee
bd update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME"
```

---

### STEP 8: Create Reservations

Reserve files that will be modified for this task.

```bash
# Parse task description for file patterns
# Reserve appropriate files

am-reserve "relevant/file/patterns/**" \
  --agent "$AGENT_NAME" \
  --ttl 3600 \
  --exclusive \
  --reason "$TASK_ID"
```

**Guidelines:**
- Reserve files mentioned in task description
- Use appropriate glob patterns (not too broad)
- Set reasonable TTL (1 hour default)
- Include task ID in reason

---

### STEP 9: Announce Task Start

```bash
am-send "[$TASK_ID] Starting: $TASK_TITLE" \
  "Starting work on $TASK_ID

**Task:** $TASK_TITLE
**Agent:** $AGENT_NAME
**Reserved files:** (list patterns)" \
  --from "$AGENT_NAME" \
  --to @active \
  --thread "$TASK_ID"
```

---

### STEP 10: Display Task Details

Display comprehensive start summary:

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 STARTING WORK: {TASK_ID}                           ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [JAT:WORKING task={TASK_ID}]                                            ║
╚══════════════════════════════════════════════════════════════════════════╝

✅ Agent: {AGENT_NAME}
📋 Task: {TASK_TITLE}
🎯 Priority: P{X}
📁 Type: {bug/feature/task}
⏱️  Status: In Progress

┌─ TASK DETAILS ─────────────────────────────────────────────────────────┐
│                                                                        │
│  {DESCRIPTION}                                                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ WORK CONTEXT ─────────────────────────────────────────────────────────┐
│                                                                        │
│  🔒 Files reserved: {PATTERNS}                                         │
│  📬 Agent Mail thread: {TASK_ID}                                       │
│  🔗 Dependencies: {NONE or list}                                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**The `[JAT:WORKING ...]` marker is embedded in the header box so the dashboard can detect this agent is actively working.**

---

### STEP 11: Evaluate Task Clarity

**Before diving into work, assess if the task is clear enough to proceed.**

Check the task description for:
- **Unclear requirements**: Vague language like "improve", "fix", "update" without specifics
- **Missing context**: References to things not explained
- **Ambiguous scope**: Could mean multiple different things
- **Missing acceptance criteria**: No way to know when "done"

**If task is CLEAR → proceed to Step 12 (Begin Work)**

**If task is UNCLEAR → request clarification:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ❓ NEED CLARIFICATION: {TASK_ID}                                        │
│  [JAT:NEEDS_INPUT]                                                       │
└──────────────────────────────────────────────────────────────────────────┘

I've picked up this task but need some clarification before I can start:

📋 Task: {TASK_TITLE}

❓ Questions:
  1. [Specific question about unclear requirement]
  2. [Another question if needed]

Please provide more details so I can proceed effectively.
```

**The `[JAT:NEEDS_INPUT]` marker alerts the dashboard** - the user will see this session needs attention (orange highlight).

**Wait for user response before proceeding.**

---

### STEP 11B: Resume After Input (When User Responds)

**When the user provides clarification, output the WORKING marker to signal you're resuming:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✅ Got it! Resuming work on {TASK_ID}                                   │
│  [JAT:WORKING task={TASK_ID}]                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**This is critical for the triage queue interface.** When you output `[JAT:WORKING]`, the dashboard:
- Removes this session from the "needs attention" queue
- Shows the session as actively working (blue state)
- Allows the operator to move on to the next agent needing input

**State transitions:**
```
needs-input  ──[user responds]──►  [JAT:WORKING task=xxx]  ──►  working
```

**Then continue to Step 12 (Begin Work).**

---

### STEP 12: Begin Work

```bash
bd show "$TASK_ID"
```

Display full task details to the user and begin working on the task.

---

## When You Finish Working

**CRITICAL: When you complete the coding work, display "Ready for Review" - NOT "Complete".**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🔍 READY FOR REVIEW: {TASK_ID}                                          │
│  [JAT:READY actions=complete]                                            │
│  [JAT:NEEDS_REVIEW]                                                      │
└──────────────────────────────────────────────────────────────────────────┘

Changes made:
  - [summary of what you changed]
  - [files modified]

Next steps:
  • Review the changes above
  • /jat:complete - Complete this task (commits, closes, releases locks)
```

**Markers explained:**
- `[JAT:READY actions=complete]` - Dashboard shows "Done" button
- `[JAT:NEEDS_REVIEW]` - Dashboard shows review state (yellow accent), waits for user

**One agent = one session = one task.** When this task completes, the session ends or user spawns a new agent for the next task.

**NEVER say "Task Complete" until AFTER the user runs `/jat:complete`.**

Why? Because:
- Other agents check Beads to see task status
- If you say "complete" but haven't run `bd close`, the task is still `in_progress`
- This causes confusion when other agents see conflicting information

| State | Meaning | Beads Status |
|-------|---------|--------------|
| 🔍 Ready for Review | Code done, awaiting user decision | `in_progress` |
| ✅ Task Complete | Closed, reservations released | `closed` |

---

## Session State Machine (Dashboard Triage)

**The dashboard detects session states from markers in terminal output.** This enables a triage/queue interface for operators managing multiple agents.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SESSION STATE MACHINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌───────┐                                                                │
│    │ idle  │ ◄─────────────────────────────────────────────────────────┐    │
│    └───┬───┘                                                           │    │
│        │                                                               │    │
│        │ [JAT:WORKING task=xxx] (task assigned)                        │    │
│        ▼                                                               │    │
│    ┌─────────┐                                                         │    │
│    │ working │ ◄──────────────────────────────┐                        │    │
│    └────┬────┘                                │                        │    │
│         │                                     │                        │    │
│         │ [JAT:NEEDS_INPUT]                   │ [JAT:WORKING task=xxx] │    │
│         ▼                                     │ (user responded)       │    │
│    ┌─────────────┐                            │                        │    │
│    │ needs-input │ ───────────────────────────┘                        │    │
│    └─────────────┘                                                     │    │
│         ▲                                                              │    │
│         │                                                              │    │
│    ┌────┴────┐                                                         │    │
│    │ working │                                                         │    │
│    └────┬────┘                                                         │    │
│         │                                                              │    │
│         │ [JAT:NEEDS_REVIEW]                                           │    │
│         ▼                                                              │    │
│    ┌──────────────────┐                                                │    │
│    │ ready-for-review │                                                │    │
│    └────────┬─────────┘                                                │    │
│             │                                                          │    │
│             │ [JAT:IDLE] (after /jat:complete)                         │    │
│             ▼                                                          │    │
│    ┌───────────┐                                                       │    │
│    │ completed │ ──────────────────────────────────────────────────────┘    │
│    └───────────┘                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**States and Markers:**

| State | Dashboard Color | Marker | Meaning |
|-------|----------------|--------|---------|
| `idle` | Gray | (none) | No task assigned, new session |
| `working` | Blue | `[JAT:WORKING task=xxx]` | Agent actively coding |
| `needs-input` | Orange | `[JAT:NEEDS_INPUT]` | Agent blocked, needs user clarification |
| `ready-for-review` | Yellow | `[JAT:NEEDS_REVIEW]` | Agent finished, awaiting user review |
| `completed` | Green | `[JAT:IDLE]` | Task closed, session can end |

**Triage Queue Interface:**
- Shows only agents in `needs-input` or `ready-for-review` states
- Operator responds to one → agent outputs `[JAT:WORKING]` → drops from queue
- Operator moves to next agent needing attention
- Agents in `working` state run quietly in background

**Key: Most recent marker wins.** If an agent outputs `[JAT:NEEDS_INPUT]` then later `[JAT:WORKING]`, the dashboard shows `working` state.

---

## Quick Mode Behavior

**When using `/jat:start task-id quick`:**

**Skipped:**
- STEP 6: Conflict detection (file locks, git status, dependencies)

**Still done (NEVER skip these):**
- STEP 3: Read & respond to Agent Mail
- STEP 7: Update Task in Beads
- STEP 8: Create Reservations
- STEP 9: Announce Task Start
- STEPS 10-11: Display and begin work

---

## Output Examples

**With task-id provided:**
```
📬 Checking Agent Mail...
  1 unread message

  From: TeamLead (30 min ago)
  Subject: Sprint priorities
  Body: Focus on P0/P1 tasks this week

  → Acknowledged

╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 STARTING WORK: jat-abc                            ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [JAT:WORKING task=jat-abc]                                              ║
╚══════════════════════════════════════════════════════════════════════════╝

✅ Agent: ShortShore
📋 Task: Add user settings page
🎯 Priority: P1
📁 Type: feature
⏱️  Status: In Progress

Reserving files...
  ✓ Reserved src/routes/settings/**

Announcing start...
  ✓ Sent to @active

[Task details displayed, ready to work]
```

**Without task-id (show recommendations):**
```
╔══════════════════════════════════════════════════════════════════════════╗
║                    ✨ Creating New Agent Session                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Created agent: ShortShore

📬 Checking Agent Mail...
  No unread messages

╔══════════════════════════════════════════════════════════════════════════╗
║                         📋 Available Tasks                               ║
╚══════════════════════════════════════════════════════════════════════════╝

  [P0] jat-xyz - Critical bug fix
  [P1] jat-abc - Add user settings page
  [P2] jat-def - Update documentation

────────────────────────────────────────────────────────────────────────────

💡 To start working on a task, run:

   /jat:start TASK_ID

Example: /jat:start jat-xyz
```

**No ready tasks:**
```
📬 Checking Agent Mail...
  No unread messages

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

**Task not found:**
```
Error: Task 'invalid-id' not found in Beads
Use 'bd list' to see available tasks
```

**Agent already active:**
```
Error: Agent 'ShortShore' is already active in another session
Options:
  1. Close that terminal first
  2. Choose a different agent name
  3. Run /jat:start to create a new agent
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
   - Read messages BEFORE selecting or starting work
   - Respond to questions, don't just ack
   - Context matters for decision-making

2. **Global agent uniqueness**
   - Agent names are globally unique across all projects
   - Simple `am-agents | grep` lookup (no project filtering)

3. **Session-aware registration**
   - Always write to `.claude/agent-{session_id}.txt`
   - Enables multiple concurrent agents in different terminals

4. **Smart cleanup**
   - Auto-releases reservations from closed tasks
   - Prevents stale statusline display

5. **Explicit steps, no bundling**
   - Each step is separate and visible
   - Harder to accidentally skip steps
   - Clear audit trail

---

## Step Summary

| Step | Name | When |
|------|------|------|
| 0 | Parse Parameters | ALWAYS |
| 1 | Get Agent Identity | ALWAYS |
| 2 | Smart Cleanup | ALWAYS |
| 3 | Read & Respond to Mail | ALWAYS |
| 4 | Determine Task | ALWAYS (exits if no task-id) |
| 5 | Detect Task Type | If task-id provided |
| 6 | Conflict Detection | If task-id and not quick |
| 7 | Update Task in Beads | If task-id provided |
| 8 | Create Reservations | If task-id provided |
| 9 | Announce Task Start | If task-id provided |
| 10 | Display Task Details | If task-id provided |
| 11 | Evaluate Task Clarity | If task-id provided (may output `[JAT:NEEDS_INPUT]`) |
| 12 | Begin Work | If task is clear |

---

## Parameter Combinations

| Command | Behavior |
|---------|----------|
| `/jat:start` | Auto-create agent → check mail → show task recommendations |
| `/jat:start auto` | Auto-create agent → check mail → **auto-pick & start** highest priority task |
| `/jat:start resume` | Choose from logged-out agents → check mail → show tasks |
| `/jat:start MyAgent` | Register as MyAgent → check mail → show tasks |
| `/jat:start MyAgent task-abc` | **Use MyAgent** (PREFERRED dashboard spawn path) → check mail → **start** task-abc |
| `/jat:start task-abc` | (Legacy) Reuse assigned agent (if exists) OR create new → check mail → **start** task-abc |
| `/jat:start task-abc quick` | (Legacy) Reuse assigned agent (if exists) OR create new → check mail → **start** task-abc (skip conflicts) |

**For launching multiple agents to attack backlog:**
```bash
jat myproject 4 --auto   # Launches 4 agents, each auto-starts highest priority task
```

---

## Comparison with Other Commands

| Command | Use Case |
|---------|----------|
| `/jat:start` | "Show me what to work on" - registration + mail + recommendations |
| `/jat:start MyAgent task-abc` | "Dashboard spawn" - use explicit agent + start task (no duplicates) |
| `/jat:start task-abc` | "Start this specific task NOW" - full task start flow |
| `/jat:next` | "Complete current + auto-start next" - drive mode |
| `/jat:complete` | "I'm done with this task" - complete and show menu |
| `/jat:pause` | "Quick pivot" - pause current and show menu |
| `/jat:status` | "What am I working on?" - current status check |
