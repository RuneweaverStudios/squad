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

**IMPORTANT: Minimize LLM round-trips by issuing independent tool calls in parallel.**

The startup sequence is organized into 3 parallel rounds. Each round issues all its calls simultaneously in a single message, then processes the results before moving to the next round. This cuts startup from ~7 sequential turns to ~3.

```
ROUND 1 (parallel) ──► ROUND 2 (parallel) ──► ROUND 3 (parallel) ──► Banner
  Identity                 Starting signal        Task update
  Task details             Memory search           Working signal
  Git status               Prior task search
```

---

### ROUND 1: Gather Context (all parallel)

**Issue ALL of these tool calls in a single message:**

#### 1A: Identity — Pre-reg check + Session ID (one Bash call)

```bash
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null); PRE_REG_FILE=".claude/sessions/.tmux-agent-${TMUX_SESSION}"; test -f "$PRE_REG_FILE" && cat "$PRE_REG_FILE" || echo "NO_PRE_REG"
```

```bash
get-current-session-id
```

If `NO_PRE_REG` → manual/CLI session, must register (see Manual Registration below).

#### 1B: Task Details

```bash
jt show "$TASK_ID" --json
```

**If no task-id was provided**, show recommendations and EXIT instead:
```bash
jt ready --json | jq -r '.[] | "  [\(.priority)] \(.id) - \(.title)"'
```

#### 1C: Git Status

```bash
git branch --show-current && git diff-index --quiet HEAD -- && echo "clean" || echo "dirty"
```

**All three calls above go out in one parallel batch.** Wait for results before Round 2.

#### Manual Registration (only if NO_PRE_REG)

If not pre-registered by IDE, register before proceeding:

```bash
am-register --name "$AGENT_NAME" --program claude-code --model sonnet-4.5
tmux rename-session "jat-${AGENT_NAME}"
```

Then write session file:
```bash
mkdir -p .claude/sessions
# Use Write tool: Write(.claude/sessions/agent-{session_id}.txt, "AgentName")
```

---

### ROUND 2: Signal + Context Search (all parallel, skip searches with quick mode)

**Issue ALL of these tool calls in a single message.** These all depend on Round 1 results (agent name, session ID, task title, git status) but are independent of each other.

#### 2A: Emit Starting Signal

```bash
jat-signal starting '{
  "agentName": "AgentName",
  "sessionId": "abc123-...",
  "taskId": "jat-xyz",
  "taskTitle": "Task title",
  "project": "projectname",
  "model": "claude-opus-4-5-20251101",
  "tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "AskUserQuestion"],
  "gitBranch": "master",
  "gitStatus": "clean",
  "uncommittedFiles": []
}'
```

**Required fields:**
- `agentName` - Your assigned agent name
- `sessionId` - Claude Code session ID (from Round 1)
- `project` - Project name (e.g., "jat", "chimaro")
- `model` - Full model ID (e.g., "claude-opus-4-6")
- `tools` - Array of available tools in this session
- `gitBranch` - Current git branch name
- `gitStatus` - "clean" or "dirty"
- `uncommittedFiles` - Array of modified file paths (if dirty)

#### 2B: Search Memory

```bash
jat-memory search "key terms from task title" --limit 5 2>/dev/null || echo "NO_MEMORY_INDEX"
```

Extract key terms from the task title and description. If no memory index exists, skip silently.

**How to use memory results:**
- Incorporate relevant lessons and gotchas into your approach
- Avoid repeating mistakes documented in past sessions
- Build on patterns established by previous agents

#### 2C: Search Prior Tasks

```bash
DATE_7=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d); jt search "$SEARCH_TERM" --updated-after "$DATE_7" --limit 20 --json
```

**What to look for:**
- **Duplicates**: Closed tasks with nearly identical titles → may already be complete
- **Related work**: Tasks touching similar files/features → useful context
- **In-progress**: Another agent working on similar area → coordinate

**If a potential duplicate is found**, emit `needs_input` signal and ask the user before proceeding.

---

### ROUND 3: Start Work (all parallel)

**Issue BOTH of these tool calls in a single message.** Use memory and prior task results to inform your approach.

#### 3A: Update Task Status

```bash
jt update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME" --files "relevant/files/**"
```

#### 3B: Emit Working Signal

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
- `approach` - Brief description of your implementation plan (incorporate memory results)

**Optional fields:**
- `expectedFiles` - Array of file patterns you expect to modify
- `baselineCommit` - Current commit hash before changes

---

### Output the Banner

After Round 3 completes, output:
```
╔════════════════════════════════════════════════════════╗
║         STARTING WORK: {TASK_ID}                       ║
╚════════════════════════════════════════════════════════╝

Agent: {AGENT_NAME}
Task: {TASK_TITLE}
Priority: P{X}
Memory: {N relevant entries found | no index yet | no matches}

APPROACH:
  {YOUR_APPROACH_DESCRIPTION}
  (incorporating lessons from past sessions if any)
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

**File conflict:**
```
⚠️ Files already claimed by another task: src/**/*.ts (task jat-xyz)
Options: Choose different files, or pick a different task
```
