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
/jat:start AgentName task-id    # Resume as AgentName, start task
```

**Quick mode** (skip conflict checks): Add `quick` to any command.

---

## What This Command Does

1. **Establish identity** - Use pre-registered agent (IDE-spawned) or create new (CLI)
2. **Select task** - From parameter or show recommendations
3. **Search memory** - Surface relevant context from past sessions
4. **Review prior tasks** - Check for duplicates and related work
5. **Start work** - Reserve files, update task status, announce start
6. **Plan approach** - Analyze task, emit rich working signal

---

## Implementation Steps

### STEP 1: Parse Parameters

Detect what was passed: task-id, agent-name, both, or none.

```bash
# Check if param is a valid task
jt show "$PARAM" --json >/dev/null 2>&1 && PARAM_TYPE="task-id"
```

---

### STEP 2: Get/Create Agent

#### 2A: Get Session ID
```bash
get-current-session-id
```

This automatically retries if the session file hasn't been created yet.

#### 2B: Check for Pre-Registered Agent (IDE-Spawned)

**IDE-spawned agents are already registered.** The spawn API:
- Generates the agent name
- Registers it in the Agent Mail database
- Creates the tmux session as `jat-{AgentName}`
- Writes an identity file for the agent to read

```bash
# Check if agent was pre-registered by IDE spawn API
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
PRE_REG_FILE=".claude/sessions/.tmux-agent-${TMUX_SESSION}"
if [[ -f "$PRE_REG_FILE" ]]; then
    AGENT_NAME=$(cat "$PRE_REG_FILE")
    echo "✓ Using pre-registered agent: $AGENT_NAME"
    # Skip Steps 2C and 2D - registration, tmux naming, and session file already done
fi
```

If the pre-registration file exists:
- Use that agent name
- Skip Steps 2C and 2D entirely (registration, tmux naming, and session file all done by spawn API + hook)
- Proceed directly to Step 3

#### 2C: Register Agent (Manual/CLI Only)

**Only needed if NOT spawned by IDE** (no pre-registration file found):

```bash
am-register --name "$AGENT_NAME" --program claude-code --model sonnet-4.5
tmux rename-session "jat-${AGENT_NAME}"
```

#### 2D: Write Session File

**Only needed for Manual/CLI** - the SessionStart hook automatically writes this for IDE-spawned agents (by reading the `.tmux-agent-{session}` file).

For manual/CLI sessions only:
```bash
mkdir -p .claude/sessions
# Use Write tool: Write(.claude/sessions/agent-{session_id}.txt, "AgentName")
```

---

### STEP 3: Select Task

**If task-id provided** → continue to Step 4

**If no task-id** → show recommendations and EXIT:

```bash
jt ready --json | jq -r '.[] | "  [\(.priority)] \(.id) - \(.title)"'
```

---

### STEP 4: Search Memory (skip with quick mode)

**Search project memory for relevant context from past sessions.**

This surfaces lessons, patterns, gotchas, and approaches from previous work on related areas.

```bash
# Extract key terms from task title and description
# Search project memory for relevant entries
jat-memory search "key terms from task title" --limit 5
```

The search returns JSON with matching memory chunks. Each result includes:
- `path` - Memory file name
- `taskId` - The task that created this memory
- `section` - Which section matched (summary, approach, decisions, lessons, etc.)
- `snippet` - The matching text
- `score` - Relevance score

**Output format** (if results found):
```
┌─ MEMORY: Found N relevant entries ──────────────────────────────┐
│                                                                 │
│  From jat-abc "Fix OAuth timeout":                              │
│    [lessons] Always use env vars for timeout values             │
│    [approach] Traced OAuth flow end-to-end, found upstream...   │
│                                                                 │
│  From jat-def "Add login page":                                 │
│    [gotchas] Refresh endpoint returns 200 on partial failures   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**How to use memory results:**
- Incorporate relevant lessons and gotchas into your approach
- Avoid repeating mistakes documented in past sessions
- Build on patterns established by previous agents
- Reference specific files and line numbers mentioned in memories

**If no memory index exists** (first run), skip silently. Memory builds up over time as tasks complete.

**If no results found**, proceed to Step 5.

---

### STEP 5: Review Prior Tasks (skip with quick mode)

**Search for related or duplicate work before starting.**

This helps avoid duplicate effort and surfaces relevant context from recent work.

```bash
DATE_7_DAYS_AGO=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)
jt search "$SEARCH_TERM" --updated-after "$DATE_7_DAYS_AGO" --limit 20 --json
```

**What to look for:**
- **Duplicates**: Closed tasks with nearly identical titles → may already be complete
- **Related work**: Tasks touching similar files/features → useful context
- **In-progress**: Another agent working on similar area → coordinate

**If a potential duplicate is found**, emit `needs_input` signal and ask the user before proceeding.

---

### STEP 6: Conflict Detection (skip with quick mode)

```bash
am-reservations --json          # Check file locks
git diff-index --quiet HEAD --  # Check uncommitted changes
jt show "$TASK_ID" --json | jq -r '.[0].dependencies[]'  # Check deps
```

---

### STEP 7: Start Task

```bash
jt update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME"
am-reserve "relevant/files/**" --agent "$AGENT_NAME" --ttl 3600 --reason "$TASK_ID"
am-send "[$TASK_ID] Starting: $TASK_TITLE" "Starting work" --from "$AGENT_NAME" --to @active --thread "$TASK_ID"
```

---

### STEP 8: Emit Signals & Begin Work

**CRITICAL: You must emit BOTH signals in sequence before starting actual work.**

The IDE tracks agent state through these signals. Without them, your session shows incorrect status.

#### 8A: Emit Starting Signal (immediately after registration)

```bash
jat-signal starting '{
  "agentName": "AgentName",
  "sessionId": "abc123-...",
  "taskId": "jat-xyz",
  "taskTitle": "Task title",
  "project": "projectname",
  "model": "claude-opus-4-5-20251101",
  "tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite", "AskUserQuestion"],
  "gitBranch": "master",
  "gitStatus": "clean",
  "uncommittedFiles": []
}'
```

**Required fields:**
- `agentName` - Your assigned agent name
- `sessionId` - Claude Code session ID (from get-current-session-id)
- `project` - Project name (e.g., "jat", "chimaro")
- `model` - Full model ID (e.g., "claude-opus-4-5-20251101", "claude-sonnet-4-20250514")
- `tools` - Array of available tools in this session
- `gitBranch` - Current git branch name
- `gitStatus` - "clean" or "dirty"
- `uncommittedFiles` - Array of modified file paths (if dirty)

**Optional fields:**
- `taskId` - Task ID if starting on a specific task
- `taskTitle` - Task title if starting on a specific task

#### 8B: Emit Working Signal (REQUIRED before coding)

**Do NOT skip this step.** After reading the task, reviewing memory results, and planning your approach, emit the working signal:

```bash
jat-signal working '{
  "taskId": "jat-123",
  "taskTitle": "Add user auth",
  "approach": "Implement OAuth via Supabase, add login page, protect routes",
  "expectedFiles": ["src/lib/auth/*", "src/routes/login/*"],
  "baselineCommit": "abc123"
}'
```

**Required fields:**
- `taskId` - The task ID you're working on
- `taskTitle` - The task title
- `approach` - Brief description of your implementation plan

**Optional fields:**
- `expectedFiles` - Array of file patterns you expect to modify
- `baselineCommit` - Current commit hash before changes

#### 8C: Output the Banner

After BOTH signals are emitted, output the banner:
```
╔════════════════════════════════════════════════════════╗
║         🚀 STARTING WORK: {TASK_ID}                    ║
╚════════════════════════════════════════════════════════╝

✅ Agent: {AGENT_NAME}
📋 Task: {TASK_TITLE}
🎯 Priority: P{X}
🧠 Memory: {N relevant entries found | no index yet | no matches}

┌─ APPROACH ──────────────────────────────────────────────┐
│  {YOUR_APPROACH_DESCRIPTION}                            │
│  (incorporating lessons from past sessions if any)      │
└─────────────────────────────────────────────────────────┘
```

---

## Asking Questions During Work

**CRITICAL: Always emit `needs_input` signal BEFORE asking questions.**

When you need clarification from the user, follow this pattern:

### Step 1: Emit the signal FIRST
```bash
jat-signal needs_input '{
  "taskId": "jat-abc",
  "question": "Brief description of what you need",
  "questionType": "clarification"
}'
```

**Question types:**
- `clarification` - Need more details about requirements
- `decision` - User needs to choose between options
- `approval` - Confirming before a significant action
- `blocker` - Cannot proceed without this information
- `duplicate_check` - Found potential duplicate task

### Step 2: Ask using AskUserQuestion tool
```
Use the AskUserQuestion tool with your options
```

### Step 3: After response, emit working signal
```bash
jat-signal working '{
  "taskId": "jat-abc",
  "taskTitle": "Task title",
  "approach": "Updated approach based on user response..."
}'
```

### Common Examples

**Clarifying requirements:**
```bash
jat-signal needs_input '{
  "taskId": "jat-abc",
  "question": "Should the export include archived items?",
  "questionType": "clarification"
}'
```

**Choosing between approaches:**
```bash
jat-signal needs_input '{
  "taskId": "jat-abc",
  "question": "Two approaches possible: (1) Add new endpoint, (2) Extend existing. Which do you prefer?",
  "questionType": "decision",
  "options": ["new_endpoint", "extend_existing"]
}'
```

**Confirming destructive action:**
```bash
jat-signal needs_input '{
  "taskId": "jat-abc",
  "question": "This will delete 50 old records. Proceed?",
  "questionType": "approval"
}'
```

**Blocked on external dependency:**
```bash
jat-signal needs_input '{
  "taskId": "jat-abc",
  "question": "Need API credentials for the payment service. Can you provide?",
  "questionType": "blocker"
}'
```

---

## When You Finish Working

**CRITICAL: You MUST emit a `review` signal BEFORE presenting your findings to the user.**

This applies to ALL work completion - not just code changes. Research, investigation, documentation, and analysis tasks all require a review signal.

**For code changes:**
```bash
jat-signal review '{
  "taskId": "jat-abc",
  "taskTitle": "Add feature X",
  "summary": ["Implemented X", "Added tests"],
  "filesModified": [
    {"path": "src/x.ts", "changeType": "added", "linesAdded": 100, "linesRemoved": 0}
  ],
  "testsStatus": "passing",
  "buildStatus": "clean",
  "reviewFocus": ["Check error handling"]
}'
```

**For research/investigation tasks (no code changes):**
```bash
jat-signal review '{
  "taskId": "jat-abc",
  "taskTitle": "Investigate auth timeout issue",
  "summary": ["Found root cause: token refresh timing", "Identified fix location"],
  "findings": ["Issue is in src/auth/refresh.ts:45", "Timeout set to 5s but API takes 8s"],
  "recommendedActions": ["Increase timeout to 15s", "Add retry logic"]
}'
```

**Emit the signal FIRST, then output:**
```
┌────────────────────────────────────────────────────────┐
│  🔍 READY FOR REVIEW: {TASK_ID}                        │
└────────────────────────────────────────────────────────┘

📋 Summary:
  • [accomplishment 1]
  • [accomplishment 2]

Run /jat:complete when ready to close this task.
```

**Do NOT say "Task Complete"** until the user runs `/jat:complete`.

---

## Session Lifecycle

```
IDE spawns agent
       │
       ▼
  ┌──────────┐
  │ STARTING │  /jat:start
  └────┬─────┘
       │ jat-signal working
       ▼
  ┌──────────┐      ┌─────────────┐
  │ WORKING  │◄────►│ NEEDS INPUT │
  └────┬─────┘      └─────────────┘
       │ jat-signal review
       ▼
  ┌──────────┐
  │  REVIEW  │  Work done, awaiting user
  └────┬─────┘
       │ /jat:complete
       ▼
  ┌──────────┐
  │ COMPLETE │  Task closed, session ends
  └──────────┘

To work on another task → spawn new agent
```

---

## Signal Reference

**Signals must be emitted in order as you progress through states:**

| Order | Signal | State | When | Key Fields |
|-------|--------|-------|------|------------|
| 1 | `jat-signal starting '{...}'` | Starting | Immediately after registration | agentName, model, gitBranch, gitStatus, tools |
| 2 | `jat-signal working '{...}'` | Working | After reading task, before coding | taskId, taskTitle, approach, expectedFiles |
| - | `jat-signal needs_input '{...}'` | Needs Input | When clarification needed (anytime) | taskId, question, questionType |
| 3 | `jat-signal review '{...}'` | Ready for Review | When work complete, before /jat:complete | taskId, summary, filesModified or findings |

### Minimal Copy-Paste Templates

```bash
# Starting (after registration)
jat-signal starting '{"agentName":"NAME","sessionId":"ID","project":"PROJECT","model":"MODEL","gitBranch":"BRANCH","gitStatus":"clean","tools":[],"uncommittedFiles":[]}'

# Working (after reading task)
jat-signal working '{"taskId":"ID","taskTitle":"TITLE","approach":"APPROACH"}'

# Needs Input (before AskUserQuestion)
jat-signal needs_input '{"taskId":"ID","question":"QUESTION","questionType":"clarification"}'

# Review (before presenting findings)
jat-signal review '{"taskId":"ID","taskTitle":"TITLE","summary":["ITEM1","ITEM2"]}'
```

---

## Error Handling

**Task not found:**
```
Error: Task 'invalid-id' not found
Use 'jt list' to see available tasks
```

**Reservation conflict:**
```
⚠️ File conflict: src/**/*.ts reserved by OtherAgent (expires in 30 min)
Options: Wait, contact OtherAgent, or choose different task
```
