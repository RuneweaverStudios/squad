---
name: squad-start
description: Begin working on a SQUAD task. Registers agent identity, selects a task, searches memory, detects conflicts, declares files, emits IDE signals, and starts work. Use this at the beginning of every SQUAD session.
metadata:
  author: squad
  version: "1.0"
---

# /skill:squad-start - Begin Working

**One agent = one session = one task.** Each session handles exactly one task from start to completion.

## Usage

```
/skill:squad-start                    # Show available tasks
/skill:squad-start task-id            # Start specific task
/skill:squad-start AgentName          # Resume as AgentName
/skill:squad-start AgentName task-id  # Resume as AgentName on task
```

Add `quick` to skip conflict checks.

## What This Does

1. **Establish identity** - Register or resume agent in Agent Registry
2. **Select task** - From parameter or show recommendations
3. **Search memory** - Surface context from past sessions
4. **Review prior tasks** - Check for duplicates and related work
5. **Start work** - Declare files, update task status
6. **Emit signals** - IDE tracks state through squad-signal

## Step-by-Step Instructions

**IMPORTANT: Minimize round-trips by issuing independent tool calls in parallel.**

Startup uses 3 parallel rounds. Each round issues all calls simultaneously, then processes results before the next round.

```
ROUND 1 (parallel) → ROUND 2 (parallel) → ROUND 3 (parallel) → Banner
  Identity              Starting signal       Task update
  Task details          Memory search          Working signal
  Git status            Prior task search
```

### ROUND 1: Gather Context (all parallel)

**Issue ALL of these tool calls in a single message:**

**1A: Identity** — Check for IDE pre-registration + get session ID:
```bash
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null); PRE_REG_FILE=".claude/sessions/.tmux-agent-${TMUX_SESSION}"; test -f "$PRE_REG_FILE" && cat "$PRE_REG_FILE" || echo "NO_PRE_REG"
```
```bash
get-current-session-id
```

**1B: Task details** (if task-id provided):
```bash
st show "$TASK_ID" --json
```
If no task-id, show `st ready` and stop here.

**1C: Git status:**
```bash
git branch --show-current && git diff-index --quiet HEAD -- && echo "clean" || echo "dirty"
```

**Manual Registration** (only if `NO_PRE_REG`):
```bash
am-register --name "$AGENT_NAME" --program pi --model "$MODEL_ID"
tmux rename-session "squad-${AGENT_NAME}" 2>/dev/null
mkdir -p .claude/sessions
echo "$AGENT_NAME" > ".claude/sessions/agent-${SESSION_ID}.txt"
```

### ROUND 2: Signal + Context Search (all parallel)

**Issue ALL of these tool calls in a single message:**

**2A: Starting signal:**
```bash
squad-signal starting '{
  "agentName": "NAME", "sessionId": "ID", "taskId": "TASK_ID",
  "taskTitle": "TITLE", "project": "PROJECT", "model": "MODEL_ID",
  "tools": ["bash","read","write","edit"], "gitBranch": "BRANCH",
  "gitStatus": "clean", "uncommittedFiles": []
}'
```

**2B: Memory search:**
```bash
squad-memory search "key terms from task title" --limit 5 2>/dev/null || echo "NO_MEMORY_INDEX"
```

**2C: Prior task search:**
```bash
DATE_7=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d); st search "$SEARCH_TERM" --updated-after "$DATE_7" --limit 20 --json
```

Look for duplicates, related work, and in-progress tasks in similar areas.

### ROUND 3: Start Work (all parallel)

**Issue BOTH of these tool calls in a single message:**

**3A: Update task status:**
```bash
st update "$TASK_ID" --status in_progress --assignee "$AGENT_NAME" --files "relevant/files/**"
```

**3B: Working signal** (incorporate memory results into approach):
```bash
squad-signal working '{
  "taskId": "TASK_ID", "taskTitle": "TASK_TITLE",
  "approach": "Brief description of implementation plan",
  "expectedFiles": ["src/**/*.ts"], "baselineCommit": "COMMIT_HASH"
}'
```

### Output Banner

```
╔════════════════════════════════════════════════════════════╗
║         STARTING WORK: {TASK_ID}                           ║
╚════════════════════════════════════════════════════════════╝

Agent: {AGENT_NAME}
Task: {TASK_TITLE}
Priority: P{X}

Approach:
  {YOUR_APPROACH_DESCRIPTION}
```

## Asking Questions During Work

**Always emit `needs_input` signal BEFORE asking questions:**

```bash
squad-signal needs_input '{
  "taskId": "TASK_ID",
  "question": "Brief description of what you need",
  "questionType": "clarification"
}'
```

Question types: `clarification`, `decision`, `approval`, `blocker`, `duplicate_check`

After getting a response, emit `working` signal to resume.

## When You Finish Working

**Emit `review` signal BEFORE presenting results:**

```bash
squad-signal review '{
  "taskId": "TASK_ID",
  "taskTitle": "TASK_TITLE",
  "summary": ["What you accomplished", "Key changes"],
  "filesModified": [
    {"path": "src/file.ts", "changeType": "modified", "linesAdded": 50, "linesRemoved": 10}
  ]
}'
```

Then output:
```
READY FOR REVIEW: {TASK_ID}

Summary:
  - [accomplishment 1]
  - [accomplishment 2]

Run /skill:squad-complete when ready to close this task.
```

## Signal Reference

| Signal | When | Required Fields |
|--------|------|-----------------|
| `starting` | After registration | agentName, sessionId, project, model, gitBranch, gitStatus, tools |
| `working` | Before coding | taskId, taskTitle, approach |
| `needs_input` | Before asking questions | taskId, question, questionType |
| `review` | When work complete | taskId, taskTitle, summary |
