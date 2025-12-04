Check current state and synchronize with coordination systems (Agent Mail, Beads, git).

# Agent Status & Sync

**Use this command when:**
- You want to see what's happening without starting work
- Checking in to stay active in the system
- Quick coordination sync before deciding what to do
- Getting oriented after being away

**What this does:**
- Shows your current state (task, reservations, inbox, git)
- Acknowledges Agent Mail messages (minimal coordination)
- Updates your last_active timestamp (keeps you alive in system)
- **Does NOT start or resume work** - just reports and syncs

**Usage:**
- `/status` - Full status check and sync

---

Follow these steps in order:

1. **Verify agent identity:**
   - Check if you have an active agent registration
   - Get your agent name and last_active timestamp

2. **Check Agent Mail inbox:**
   - Fetch all unread messages
   - Identify urgent messages
   - **Acknowledge all messages** (mark as read, update coordination)
   - Summarize key messages by category

3. **Check current task context:**
   - Look for active file reservations (indicates current work)
   - Check agent task_description (your declared focus)
   - Identify what you were last working on

4. **Check Beads task queue:**
   - Run `bd ready --json` to see available work
   - If you have a current task, check its status
   - Show high priority tasks (P0/P1)

5. **Check git status:**
   - Run `git status` to see uncommitted changes
   - Run `git log -5` to see recent activity
   - Identify if others have been committing

6. **Check file reservation landscape:**
   - List all active reservations in the project
   - Identify potential conflicts or coordination needs
   - Show who's working on what

7. **Update last_active:**
   - Run: `am-register --name YourAgentName --program claude-code --model sonnet-4.5`
   - Keeps you visible as an active agent in the system

8. **Analyze state and generate smart recommendations:**
   - Detect urgent coordination needs
   - Identify stale blockers (could be force-released)
   - Spot planning opportunities
   - Calculate priority-ranked action recommendations
   - Generate specific commands to run

9. **Report comprehensive status** to console (see format below)

---

## Output Format

After completing all steps above, format your final output using this template:

```
╔══════════════════════════════════════════════════════════════════════════╗
║                      📊 AGENT STATUS & SYNC                              ║
║                                                                          ║
║                    🤖 Agent: [YOUR-AGENT-NAME]                           ║
║                    ⏰ Last Active: [X hours/minutes ago]                 ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ YOUR CURRENT STATE ───────────────────────────────────────────────────┐
│                                                                        │
│  🎯 Current Focus: [task-id and title, or "No active task"]            │
│  📊 Task Status: [open/in-progress/paused/etc, or "N/A"]               │
│  🔒 Active Reservations: [X files/patterns, or "None"]                 │
│     • [pattern1] - expires in [X hours]                                │
│     • [pattern2] - expires in [Y hours]                                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ INBOX SYNC ───────────────────────────────────────────────────────────┐
│                                                                        │
│  📬 Total Messages: [X total, Y new since last check]                  │
│  ✅ Acknowledged: [all X messages marked as read]                      │
│                                                                        │
│  📋 Message Summary:                                                   │
│  ⚠️  Urgent ([X]):                                                     │
│     • [msg-id] from [agent]: [brief subject]                           │
│                                                                        │
│  💬 Coordination ([X]):                                                │
│     • [msg-id] from [agent]: [brief subject]                           │
│                                                                        │
│  ℹ️  Informational ([X]):                                              │
│     • [msg-id] from [agent]: [brief subject]                           │
│                                                                        │
│  💡 Action Items:                                                      │
│     • [List messages that require response or action]                  │
│     • Or: "No action items"                                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ BEADS TASK QUEUE ─────────────────────────────────────────────────────┐
│                                                                        │
│  📊 Ready Tasks: [X tasks total]                                       │
│                                                                        │
│  🔥 High Priority (P0/P1):                                             │
│     • [task-id] (P0) - [brief description]                             │
│     • [task-id] (P1) - [brief description]                             │
│     • Or: "No high priority tasks"                                     │
│                                                                        │
│  📋 Your Tasks:                                                        │
│     • [task-id] - [status] - [description]                             │
│     • Or: "No tasks assigned to you"                                   │
│                                                                        │
│  🚫 Blocked Tasks: [X tasks]                                           │
│     • [task-id] - blocked by [reason/dependency]                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ GIT STATUS ───────────────────────────────────────────────────────────┐
│                                                                        │
│  📝 Working Directory:                                                 │
│     • Modified: [X files, or "Clean"]                                  │
│     • Staged: [Y files, or "None"]                                     │
│     • Untracked: [Z files, or "None"]                                  │
│                                                                        │
│  📜 Recent Commits (last 5):                                           │
│     • [hash] - [author] ([time ago]) - [subject]                       │
│     • [hash] - [author] ([time ago]) - [subject]                       │
│     • [hash] - [author] ([time ago]) - [subject]                       │
│                                                                        │
│  🔄 Branch Status:                                                     │
│     • Current: [branch-name]                                           │
│     • Ahead/Behind: [X commits ahead, Y behind origin]                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ PROJECT COORDINATION ─────────────────────────────────────────────────┐
│                                                                        │
│  🤖 Active Agents: [X agents active in last 24h]                       │
│     • [AgentName1] - [last active: X hours ago] - "[task description]" │
│     • [AgentName2] - [last active: Y hours ago] - "[task description]" │
│                                                                        │
│  🔒 Active File Reservations (All Agents):                             │
│     • [AgentName]: [pattern1] - [reason] - [expires in X hours]        │
│     • [AgentName]: [pattern2] - [reason] - [expires in Y hours]        │
│     • Or: "No active reservations by other agents"                     │
│                                                                        │
│  ⚡ Coordination Opportunities:                                        │
│     • [List potential parallel work or coordination needs]             │
│     • Or: "No coordination needs identified"                           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ SMART RECOMMENDATIONS (Priority-Ranked) ──────────────────────────────┐
│                                                                        │
│  🎯 HIGHEST PRIORITY ACTION:                                           │
│     → [Specific command to run]                                        │
│     Why: [Explanation of why this is top priority]                     │
│                                                                        │
│  Detected Situations:                                                  │
│                                                                        │
│  [If urgent messages detected:]                                        │
│  ⚠️  URGENT: [X] messages need immediate response                      │
│     • From [agent]: [subject] - [why urgent]                           │
│     → Recommended: Reply to [agent] about [topic] first                │
│                                                                        │
│  [If stale blockers detected:]                                         │
│  🔓 STALE BLOCKER DETECTED                                             │
│     • Task [task-id] blocked for [X days]                              │
│     • Blocker: "[reason]"                                              │
│     • Agent [who-can-unblock] inactive for [Y hours]                   │
│     → Recommended: Escalate or force-release if safe                   │
│     → Command: Review blocker and decide action                        │
│                                                                        │
│  [If stale file reservations detected:]                                │
│  🔒 STALE RESERVATION DETECTED                                         │
│     • Agent [agent-name] has reservation on [pattern]                  │
│     • Last active: [X hours] ago (reservation expires in [Y hours])    │
│     • Holding: [list of patterns]                                      │
│     → May be safe to force-release if needed                           │
│     → Check Agent Mail for context first                               │
│                                                                        │
│  [If planning opportunity detected:]                                   │
│  📋 PLANNING OPPORTUNITY                                               │
│     • [X] ready tasks but unclear dependencies                         │
│     • Recent messages mention new feature: "[topic]"                   │
│     → Recommended: Create planning doc and run `/plan`                 │
│     → Command: `/plan [new-feature-spec.md]`                           │
│                                                                        │
│  [If high-value work available:]                                       │
│  🔥 HIGH-VALUE WORK AVAILABLE                                          │
│     • [X] P0 tasks ready (no blockers)                                 │
│     • Top task: [task-id] - [description]                              │
│     → Recommended: Start immediately                                   │
│     → Command: `/start [task-id]`                                      │
│                                                                        │
│  [If your task is paused/blocked:]                                     │
│  ⏸️  YOUR TASK STATUS: [Paused/Blocked]                                │
│     • Task [task-id]: [reason for pause/block]                         │
│     • [If blocked]: Blocker - "[blocker-reason]"                       │
│     • [If blocked]: Check if blocker cleared                           │
│     → [If clear]: Resume with `/start [task-id]`                       │
│     → [If not clear]: Pick different work with `/start`                │
│                                                                        │
│  [If coordination needed:]                                             │
│  🤝 COORDINATION NEEDED                                                │
│     • Agent [agent-name] working on related task [task-id]             │
│     • File overlap detected: [patterns]                                │
│     → Recommended: Coordinate before starting work                     │
│     → Command: Send message to discuss approach                        │
│                                                                        │
│  [If all clear:]                                                       │
│  ✅ ALL CLEAR - READY TO WORK                                          │
│     • No urgent messages                                               │
│     • No blockers or conflicts                                         │
│     • [X] tasks ready                                                  │
│     → Recommended: Start highest priority task                         │
│     → Command: `/start` (auto-selects best task)                       │
│                                                                        │
│  [If nothing urgent:]                                                  │
│  ☕ QUIET PERIOD                                                       │
│     • All tasks assigned or blocked                                    │
│     • No urgent coordination needs                                     │
│     • Good time for: planning, documentation, code review              │
│     → Consider: `/plan` for upcoming work or take a break              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║                     ✅ STATUS SYNC COMPLETE ✅                           ║
║                                                                          ║
║                       	📊 State: [Ready/Paused/Blocked/etc]				║
║                       	⏰ Last Active: Updated							║
║																			║
║ 	                     🤖 Agent: [YOUR-AGENT-NAME]    					║
║																			║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Smart Recommendation Logic

**How recommendations are prioritized:**

1. **Urgent messages** (highest priority)
   - Detection: Message has `importance: "urgent"` or `ack_required: true`
   - Detection: Message age < 1 hour and from blocked agent
   - Action: Respond immediately before starting new work

2. **Stale blockers** (high priority - unblock others)
   - Detection: Task blocked for >24 hours
   - Detection: Agent who can unblock is inactive >12 hours
   - Action: Escalate, contact agent, or consider force-release if safe

3. **Stale file reservations** (medium priority - free resources)
   - Detection: Agent inactive >24 hours but holding reservations
   - Detection: Reservation expires in <2 hours but agent not active
   - Action: Check context, potentially force-release if blocking you

4. **Your paused/blocked task** (medium priority - finish what you started)
   - Detection: You have active task that's paused or blocked
   - Detection: Check if blocker has cleared (task completed, agent responded)
   - Action: Resume if blocker clear, or ack that still blocked

5. **High-value work** (standard priority)
   - Detection: P0 tasks with no blockers
   - Detection: P1 tasks that are dependencies for others
   - Action: Start highest impact task

6. **Coordination opportunities** (proactive)
   - Detection: Multiple agents working on related tasks
   - Detection: File pattern overlap in reservations
   - Detection: Recent messages about same feature/component
   - Action: Coordinate before potential conflicts arise

7. **Planning opportunities** (lower priority)
   - Detection: Many ready tasks but no clear structure
   - Detection: Messages discussing new features without tasks created
   - Detection: No P0 tasks but lots of P2 ideas
   - Action: Create planning doc and run `/plan`

8. **All clear** (default)
   - Detection: None of the above
   - Action: Start best available task with `/start`

**Priority calculation:**
- Urgent messages > Unblocking others > Your work > New work > Planning
- Commands are provided ready-to-run (copy-paste)
- Reasoning is included ("Why: ...")

---

## What Gets Updated

**Minimal writes (coordination):**
- ✅ Agent Mail messages marked as read (acknowledged)
- ✅ Agent last_active timestamp updated
- ❌ No task selection or starting
- ❌ No file reservations
- ❌ No commits or git operations
- ❌ No Beads status changes

**Purpose:** Stay synchronized with coordination systems without committing to new work.

---

## Use Cases

1. **Morning check-in:**
   - See what happened overnight
   - Ack messages from other agents
   - Decide what to work on

2. **After being away:**
   - Get oriented quickly
   - See current project state
   - Update your presence in system

3. **Before making decisions:**
   - Should I resume or start new?
   - Are there urgent messages?
   - What are other agents doing?

4. **Quick coordination sync:**
   - Stay active in the system
   - Keep up with messages
   - Maintain awareness

---

**IMPORTANT:**
- This is a read-mostly operation (only acks messages and updates last_active)
- Does NOT start or resume work - just reports state
- Use before `/start` or `/resume` to make informed decisions
- Safe to run frequently without side effects

---

## Dashboard State Markers

**This command does NOT output state markers.**

Status is informational - it shows you state but doesn't change it. If you want to change dashboard state:

| Desired State | Command/Marker |
|---------------|----------------|
| Working | `/jat:start` outputs `[JAT:WORKING task=xxx]` |
| Needs Input | AskUserQuestion tool or `[JAT:NEEDS_INPUT]` |
| Ready for Review | Output `[JAT:NEEDS_REVIEW]` when work is done |
| Completed | `/jat:complete` outputs `[JAT:IDLE]` after `bd close` |
| Paused | `/jat:pause` outputs `[JAT:IDLE]` |

**If dashboard state seems stuck:**
Running `/jat:status` won't fix it - the dashboard reads terminal output for markers. To fix stuck state:
1. Re-output the appropriate marker for your current state
2. Or run the appropriate command (`/jat:start`, `/jat:complete`, etc.)
