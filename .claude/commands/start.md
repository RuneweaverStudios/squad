# Smart Start - Auto-detect or Create Agent

**Usage:** `/start [AgentName]`

**Examples:**
- `/start` - Auto-detect recent agents or create new
- `/start MyAgent` - Quick register as specific agent (same as `/r MyAgent`)

**What this command does:**
1. Detects agents active in the last hour using smart agent detection
2. If recent agents found: offers to resume the most recent one
3. If no recent agents: creates a new agent identity
4. Reviews inbox and acknowledges messages
5. Shows ready tasks from Beads
6. Categorizes tasks and provides recommendations

This is the "just get me working" command - optimized for quick session start.

---

## Implementation

Follow these steps:

### Step 1: Check for Explicit Agent Name

If user provided an agent name argument (e.g., `/start MyAgent`), skip to Step 6 with that name.

### Step 2: Detect Recent Agents

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

```bash
AGENT_NAME={AgentName}  # From Step 1, 3, or 5
am-register --name $AGENT_NAME --program claude-code --model sonnet-4.5
```

### Step 7: Set Environment Variable for Statusline

**CRITICAL:** Set the AGENT_NAME environment variable so the statusline displays correctly:

```bash
export AGENT_NAME=$AGENT_NAME
```

This enables the statusline to show your agent identity, task progress, and indicators.

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
/start [AgentName?]
    |
    ├─ Has explicit name? ──YES──> Register {AgentName} → Continue
    |
    └─ NO → Detect recent agents (get-recent-agents 60)
        |
        ├─ Found recent agents? ──YES──> Ask user:
        |                                  - Resume most recent (default)
        |                                  - Create new
        |                                  - Show all agents
        |
        └─ NO recent agents ──> Auto-create new → Continue

Continue:
    → Register agent
    → Set AGENT_NAME env var
    → Review inbox
    → Get ready tasks
    → Categorize & recommend
    → Report to user
```

---

## Notes

- **Smart detection:** Automatically finds "closed then reopened" sessions
- **One-command start:** Optimized for fastest path to productivity
- **Sensible defaults:** Press Enter to resume most recent agent
- **Flexible:** Still allows explicit agent name or new identity creation
- **Statusline integration:** Sets AGENT_NAME for rich terminal UI

---

## Comparison with Other Commands

| Command | Use Case |
|---------|----------|
| `/start` | "Just get me working" - auto-detect or quick create |
| `/start MyAgent` | "Resume as specific agent" - same as `/r MyAgent` |
| `/r AgentName` | "I know which agent I want" - direct resume |
| `/agent:register` | "Let me see all options" - full interactive menu |
