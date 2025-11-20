# Smart Start - Integrated Registration and Task Start

**Usage:** `/start [parameter]`

**Examples:**
- `/start` - Resume current agent or auto-detect/create
- `/start agent` - Force show agent menu (even if AGENT_NAME set)
- `/start task-abc` - Start specific task (auto-registers if needed)

**What this command does:**
1. Checks AGENT_NAME environment variable
2. If not set: detects agents active in last hour or auto-creates new agent
3. If parameter is "agent": forces interactive agent selection menu
4. If parameter is task ID: starts that specific task
5. Reviews inbox and acknowledges messages
6. Shows ready tasks from Beads
7. Categorizes tasks and provides recommendations

This is the "just get me working" command - seamlessly handles both registration and task start.

---

## Implementation

Follow these steps:

### Step 0: Parse Parameter

Extract the parameter from command arguments:

```bash
PARAM="$1"  # Could be empty, "agent", or a task ID (e.g., "dirt-abc")
```

### Step 1: Check AGENT_NAME Environment Variable

**CRITICAL:** Always check AGENT_NAME first:

```bash
if [ -n "$AGENT_NAME" ] && [ "$PARAM" != "agent" ]; then
  # Agent already registered and not forcing menu
  AGENT_REGISTERED=true
  # Skip to Step 7 (if PARAM is task ID) or Step 8 (if no param)
else
  # Need to register agent
  AGENT_REGISTERED=false
  # Continue to Step 2
fi
```

**Special case:** If `PARAM == "agent"`, force show agent menu even if AGENT_NAME is set.

### Step 2: Detect Recent Agents

**Only run if AGENT_REGISTERED==false** (from Step 1):

Use the smart agent detection utility to find agents active in the last hour:

```bash
RECENT_AGENTS=$(./scripts/get-recent-agents 60)
AGENT_COUNT=$(echo "$RECENT_AGENTS" | jq 'length')
```

### Step 3: Handle Recent Agents Found

If `AGENT_COUNT > 0`, get the most recent agent and offer options:

```bash
MOST_RECENT=$(echo "$RECENT_AGENTS" | jq -r '.[0]')
```

Use AskUserQuestion to show:
- **Option 1 (default):** Resume {MOST_RECENT} (just press Enter)
- **Option 2:** Create new agent identity
- **Option 3:** Show all agents (switch to `/agent:register` flow)

If user selects Option 1: Use `MOST_RECENT` as the agent name (go to Step 6)
If user selects Option 2: Generate new agent (go to Step 5)
If user selects Option 3: Redirect to `/agent:register` command

### Step 4: Handle No Recent Agents

If `AGENT_COUNT == 0`, show friendly message and create new agent:

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    🌟 Starting Fresh Session                             ║
╚══════════════════════════════════════════════════════════════════════════╝

No agents active in the last hour. Creating new agent identity...
```

Then proceed to Step 5.

### Step 5: Create New Agent Identity

Auto-generate new agent name:

```bash
NEW_AGENT=$(am-register --program claude-code --model sonnet-4.5 | \
  grep "Registered:" | awk '{print $3}')
```

Show confirmation:
```
✨ Created new agent: {NEW_AGENT}
```

Use `NEW_AGENT` as the agent name (continue to Step 6).

### Step 6: Register Agent

**Only run if AGENT_REGISTERED==false:**

```bash
AGENT_NAME={AgentName}  # From Step 3 or 5
am-register --name $AGENT_NAME --program claude-code --model sonnet-4.5
```

**If AGENT_REGISTERED==true:** Agent is already registered, use existing `$AGENT_NAME`.

### Step 7: Set Environment Variable for Statusline

**CRITICAL:** Set the AGENT_NAME environment variable so the statusline displays correctly:

```bash
export AGENT_NAME=$AGENT_NAME
```

**Note:** If AGENT_REGISTERED==true, this variable is already set from previous session.

This enables the statusline to show your agent identity, task progress, and indicators.

### Step 7.5: Check if Starting Specific Task

**If PARAM looks like a task ID** (e.g., matches pattern "dirt-*" or "project-*"):

```bash
# Assume PARAM is a task ID
TASK_ID="$PARAM"

# Verify task exists
if bd show "$TASK_ID" --json >/dev/null 2>&1; then
  # Valid task, proceed to task start flow (call /agent:start with task ID)
  # This delegates to the comprehensive /agent:start command
  echo "Starting task $TASK_ID..."
  # Call /agent:start command with task ID
  # (command execution continues there)
  exit 0
else
  echo "❌ Error: Task '$TASK_ID' not found in Beads"
  echo "💡 Use 'bd list' to see available tasks"
  exit 1
fi
```

**If PARAM is empty or "agent":** Continue to Step 8 (task recommendations).

### Step 8: Review Inbox

```bash
# Get unread messages
UNREAD_MESSAGES=$(am-inbox $AGENT_NAME --unread --json)
UNREAD_COUNT=$(echo "$UNREAD_MESSAGES" | jq 'length')

# Acknowledge all messages
echo "$UNREAD_MESSAGES" | jq -r '.[].id' | \
  xargs -I {} am-ack {} --agent $AGENT_NAME
```

### Step 9: Get Ready Tasks

```bash
READY_TASKS=$(bd ready --json)
READY_COUNT=$(echo "$READY_TASKS" | jq 'length')
```

### Step 10: Categorize and Recommend Tasks

Analyze ready tasks:
1. Check file reservations (am-reservations) for conflicts
2. Identify highest priority tasks (P0 > P1 > P2)
3. Determine capability based on task requirements
4. Recommend best task to start with

### Step 11: Report to User

Use this output format:

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 SESSION STARTED: {AgentName}                       ║
╚══════════════════════════════════════════════════════════════════════════╝

✅ Agent: {AgentName}
📬 Inbox: {X} messages acknowledged
📋 Ready tasks: {X} total

┌─ TOP PRIORITY TASKS ───────────────────────────────────────────────────┐
│                                                                        │
│  🎯 {task-id} (P{X}) - {title}                                         │
│     Status: Ready to start | No conflicts                             │
│                                                                        │
│  🔒 {task-id} (P{X}) - {title}                                         │
│     Status: {Agent} is working on this (files locked)                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ RECOMMENDATION ───────────────────────────────────────────────────────┐
│                                                                        │
│  🌟 Best task to start: {task-id} - {title}                            │
│                                                                        │
│  Why: {Highest priority + no file conflicts + good capability match}  │
│                                                                        │
│  💡 To begin: Say "p0" or "p1" to see tasks, or mention task ID       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Decision Flow Summary

```
/start [parameter?]
    |
    ├─ Check AGENT_NAME env var
    |   |
    |   ├─ Set AND param != "agent" ──YES──> Use existing agent → Check param type
    |   |                                        |
    |   |                                        ├─ Empty ──> Show task recommendations
    |   |                                        └─ Task ID ──> Start specific task
    |   |
    |   └─ Not set OR param == "agent" ──> Need registration → Detect recent agents
    |       |
    |       ├─ Found recent agents? ──YES──> Ask user:
    |       |                                  - Resume most recent (default)
    |       |                                  - Create new
    |       |                                  - Show all agents
    |       |
    |       └─ NO recent agents ──> Auto-create new → Continue

Continue (after registration):
    → Set AGENT_NAME env var
    → Check param type:
        ├─ Empty or "agent" ──> Review inbox → Get ready tasks → Recommend
        └─ Task ID ──> Delegate to /agent:start with task ID
```

---

## Notes

- **AGENT_NAME aware:** Checks environment variable first to avoid re-registration
- **Smart detection:** Automatically finds "closed then reopened" sessions
- **One-command workflow:** Handles both registration AND task start
- **Task ID support:** `/start task-abc` delegates to full `/agent:start` flow
- **Force menu:** `/start agent` shows agent selection even if already registered
- **Sensible defaults:** Press Enter to resume most recent agent
- **Statusline integration:** Sets AGENT_NAME for rich terminal UI

---

## Parameter Combinations

| Command | Behavior |
|---------|----------|
| `/start` | Check AGENT_NAME → resume OR detect recent agents OR auto-create |
| `/start agent` | Force show agent menu (ignore AGENT_NAME) |
| `/start task-abc` | Auto-register if needed, then start task task-abc |
| `/start task-abc` (with AGENT_NAME set) | Skip registration, start task immediately |

---

## Comparison with Other Commands

| Command | Use Case |
|---------|----------|
| `/start` | "Just get me working" - seamless registration + task recommendations |
| `/start agent` | "Show me all agents" - force interactive menu |
| `/start task-abc` | "Start this specific task" - auto-register if needed |
| `/r AgentName` | "Resume specific agent" - explicit agent menu (deprecated quick-register) |
| `/agent:register` | "Full registration flow" - comprehensive agent setup |
| `/agent:start` | "Full task start flow" - comprehensive conflict checks + work start |
