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
5. **Plan approach** - Analyze task, describe implementation strategy
6. **Emit rich signal** - Send structured working signal with task context, approach, and baseline

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
find .claude/sessions -name "context-*.json" -mtime +7 -delete 2>/dev/null
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
╔════════════════════════════════════════════════════════╗
║              📋 Available Tasks                        ║
╚════════════════════════════════════════════════════════╝

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

### STEP 7: Plan Approach & Emit Rich Signal

**You MUST emit a rich `working` signal for dashboard state tracking.**

After reading the task details, plan your approach before starting work:

1. **Analyze the task** - Understand what needs to be done
2. **Plan your approach** - Write a brief description of how you'll tackle it
3. **Identify expected files** - List files you'll likely modify
4. **Get baseline commit** - Capture the git SHA for rollback capability

```bash
# Get baseline commit
git rev-parse HEAD
# → Save this value as BASELINE_COMMIT

# Get task details (if not already captured)
bd show "$TASK_ID" --json | jq -r '.[0] | "\(.title)|\(.description)|\(.priority)|\(.type)|\(.dependencies // [] | join(","))"'
```

**Emit rich working signal:**

```bash
# Build the rich signal payload
# Required fields: taskId, taskTitle
# Recommended fields: approach, expectedFiles, baselineCommit

jat-signal working '{
  "taskId": "{TASK_ID}",
  "taskTitle": "{TASK_TITLE}",
  "taskDescription": "{TASK_DESCRIPTION}",
  "taskPriority": {PRIORITY},
  "taskType": "{TYPE}",
  "approach": "{YOUR_APPROACH_DESCRIPTION}",
  "expectedFiles": ["{FILE1}", "{FILE2}", "..."],
  "estimatedScope": "small|medium|large",
  "baselineCommit": "{BASELINE_COMMIT}",
  "baselineBranch": "{CURRENT_BRANCH}",
  "dependencies": ["{DEP_TASK_ID}", "..."]
}'
```

**Approach planning guidance:**
- **approach**: 1-2 sentences describing your implementation strategy
- **expectedFiles**: Array of file patterns you expect to modify
- **estimatedScope**:
  - `small` = 1-2 files, few lines
  - `medium` = 3-10 files, moderate changes
  - `large` = 10+ files, significant refactoring

**Example rich working signal:**

```bash
jat-signal working '{
  "taskId": "jat-123",
  "taskTitle": "Add user authentication",
  "taskDescription": "Implement login/logout with session management",
  "taskPriority": 1,
  "taskType": "feature",
  "approach": "Will implement OAuth flow using Supabase auth, add login page, protect routes with middleware",
  "expectedFiles": ["src/lib/auth/*", "src/routes/login/*", "src/hooks.server.ts"],
  "estimatedScope": "medium",
  "baselineCommit": "abc123def",
  "baselineBranch": "main",
  "dependencies": []
}'
```

Then output the banner:

```
╔════════════════════════════════════════════════════════╗
║         🚀 STARTING WORK: {TASK_ID}                    ║
╚════════════════════════════════════════════════════════╝

✅ Agent: {AGENT_NAME}
📋 Task: {TASK_TITLE}
🎯 Priority: P{X}
📁 Type: {bug/feature/task}

┌─ TASK DETAILS ──────────────────────────────────────────┐
│  {DESCRIPTION}                                          │
└─────────────────────────────────────────────────────────┘

┌─ APPROACH ──────────────────────────────────────────────┐
│  {YOUR_APPROACH_DESCRIPTION}                            │
├─ EXPECTED FILES ────────────────────────────────────────┤
│  • {FILE1}                                              │
│  • {FILE2}                                              │
└─────────────────────────────────────────────────────────┘
```

---

### STEP 8: Evaluate Clarity

**Before coding, check if the task is clear.**

If unclear, signal and request clarification:

```bash
# Signal that you need user input
jat-signal needs_input '{"taskId":"{TASK_ID}","question":"[Your question]","questionType":"text"}'
```

Then output the clarification request:

```
┌────────────────────────────────────────────────────────┐
│  ❓ NEED CLARIFICATION: {TASK_ID}                      │
└────────────────────────────────────────────────────────┘

Questions:
  1. [Specific question]
```

**Wait for user response.** When they answer, re-emit the working signal to resume.

---

### STEP 9: Begin Work

```bash
bd show "$TASK_ID"
```

Read the full task details and start coding.

---

## When You Finish Working

**🚨 CRITICAL: You MUST emit a rich `review` signal when done.**

The dashboard tracks your state via signals. Without signaling, you'll show "Working" even when you're done. This confuses users who don't know you're waiting for them.

### Gather Review Data

Before emitting the review signal, gather the following data:

```bash
# Get file changes with stats
git diff --stat HEAD~1

# Get total lines changed
git diff --numstat HEAD~1 | awk '{added+=$1; removed+=$2} END {print "Added:", added, "Removed:", removed}'

# Get recent commits for this task
git log --oneline -5
```

### Build Rich Review Signal

The review signal should include:
- **summary**: Array of accomplishment bullet points
- **filesModified**: Array of file changes with stats
- **keyDecisions**: Architectural choices made (if any)
- **testsStatus**: "passing", "failing", "none", or "skipped"
- **buildStatus**: "clean", "warnings", or "errors"
- **reviewFocus**: Areas the reviewer should pay attention to

```bash
jat-signal review '{
  "taskId": "{TASK_ID}",
  "taskTitle": "{TASK_TITLE}",
  "summary": [
    "Added rich review signal validation",
    "Updated jat-signal-validate with new fields",
    "Documented rich review signal in start.md"
  ],
  "approach": "Extended existing validation to support full ReviewSignal interface",
  "filesModified": [
    {
      "path": "signal/jat-signal-validate",
      "changeType": "modified",
      "linesAdded": 130,
      "linesRemoved": 15,
      "description": "Added validation for review signal fields"
    },
    {
      "path": "commands/jat/start.md",
      "changeType": "modified",
      "linesAdded": 85,
      "linesRemoved": 20,
      "description": "Documented rich review signal"
    }
  ],
  "totalLinesAdded": 215,
  "totalLinesRemoved": 35,
  "keyDecisions": [
    {
      "decision": "Made all new fields optional for backward compatibility",
      "rationale": "Existing workflows should continue to work"
    }
  ],
  "testsStatus": "none",
  "buildStatus": "clean",
  "reviewFocus": [
    "Check validation logic for filesModified array",
    "Verify documentation matches TypeScript interface"
  ],
  "commits": [
    {
      "sha": "abc1234",
      "message": "task: Add rich review signal validation"
    }
  ]
}'
```

### Review Signal Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | **Yes** | Task ID (e.g., "jat-abc") |
| `taskTitle` | string | No | Task title |
| `summary` | string[] | **Recommended** | Bullet points of accomplishments |
| `approach` | string | No | How the implementation was done |
| `filesModified` | object[] | **Recommended** | Files changed with stats |
| `totalLinesAdded` | number | No | Total lines added |
| `totalLinesRemoved` | number | No | Total lines removed |
| `keyDecisions` | object[] | No | Architectural decisions made |
| `testsStatus` | enum | **Recommended** | "passing", "failing", "none", "skipped" |
| `testsRun` | number | No | Number of tests executed |
| `testsPassed` | number | No | Number of tests passing |
| `buildStatus` | enum | **Recommended** | "clean", "warnings", "errors" |
| `buildWarnings` | string[] | No | Warning messages if any |
| `reviewFocus` | string[] | **Recommended** | Areas to focus review on |
| `knownLimitations` | string[] | No | Edge cases not handled |
| `commits` | object[] | No | Commits made (sha + message) |

### filesModified Object

```json
{
  "path": "src/lib/auth.ts",
  "changeType": "modified",  // "added" | "modified" | "deleted"
  "linesAdded": 50,
  "linesRemoved": 10,
  "description": "Added OAuth token refresh"
}
```

### Output Summary

After emitting the signal, output a summary:

```
┌────────────────────────────────────────────────────────┐
│  🔍 READY FOR REVIEW: {TASK_ID}                        │
└────────────────────────────────────────────────────────┘

📋 Summary:
  • [accomplishment 1]
  • [accomplishment 2]

📁 Files Modified: {N} files (+{added}/-{removed} lines)
  • path/to/file.ts (modified, +50/-10)
  • path/to/new.ts (added, +100)

🧪 Tests: {status}
🏗️ Build: {status}

🎯 Review Focus:
  • [focus area 1]
  • [focus area 2]

Run /jat:complete when ready to close this task.
```

### When to Signal Review

- After completing any substantial code changes
- After writing documentation or analysis
- After fixing a bug (even if more testing is recommended)
- Before asking "should I mark this complete?"
- Whenever you're done and waiting for user input

### Do NOT

- Say "I'm done" without running `jat-signal review`
- Just stop outputting and wait
- Use vague phrases like "let me know if you have questions"
- Emit a thin signal without the rich payload

**Do NOT say "Task Complete" until the user runs `/jat:complete`.**

The task is still `in_progress` in Beads until `/jat:complete` runs `bd close`.

---

## Session Lifecycle

```
┌──────────────────────────────────────────────────────┐
│              ONE AGENT = ONE TASK                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Dashboard spawns agent                              │
│        │                                             │
│        ▼                                             │
│  ┌──────────┐                                        │
│  │ STARTING │  Running /jat:start                    │
│  └────┬─────┘                                        │
│       │ jat-signal working '{...}'                   │
│       ▼                                              │
│  ┌──────────┐      ┌─────────────┐                   │
│  │ WORKING  │◄────►│ NEEDS INPUT │                   │
│  └────┬─────┘      └─────────────┘                   │
│       │ jat-signal review '{...}'                    │
│       ▼                                              │
│  ┌──────────┐                                        │
│  │  REVIEW  │  Code done, awaiting user              │
│  └────┬─────┘                                        │
│       │ /jat:complete                                │
│       ▼                                              │
│  ┌──────────┐                                        │
│  │   DONE   │  Task closed, session ends             │
│  └──────────┘                                        │
│                                                      │
│  To work on another task → spawn new agent           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Dashboard State Signals

| Signal Command | State | Dashboard Color |
|----------------|-------|-----------------|
| `jat-signal starting '{...}'` | Starting | Cyan |
| `jat-signal working '{...}'` | Working | Blue |
| `jat-signal needs_input '{...}'` | Needs Input | Orange |
| `jat-signal review '{...}'` | Ready for Review | Yellow |
| `jat-signal completed '{...}'` | Done | Green |

**Signals are captured by PostToolUse hook** and written to `/tmp/jat-signal-{session}.json`.

**Why signals matter:**
- Without explicit signals, users don't know you're waiting for them
- The dashboard shows "Working" indefinitely if no state change is detected
- Agents that "go quiet" without a signal appear stuck
- **Always run `jat-signal review` when you finish working**

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

# Emit rich working signal (after reading task)
jat-signal working '{"taskId":"jat-abc","taskTitle":"...","approach":"...","expectedFiles":["..."],"baselineCommit":"..."}'

# When done coding - emit rich review signal:
jat-signal review '{
  "taskId":"jat-abc",
  "taskTitle":"Add feature X",
  "summary":["Implemented X","Added tests for X"],
  "filesModified":[
    {"path":"src/x.ts","changeType":"added","linesAdded":100,"linesRemoved":0}
  ],
  "totalLinesAdded":100,
  "totalLinesRemoved":0,
  "testsStatus":"passing",
  "buildStatus":"clean",
  "reviewFocus":["Check error handling in x.ts"]
}'
# Then output summary and wait for user to run /jat:complete
```
