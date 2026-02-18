---
name: squad-complete
description: Complete current SQUAD task with full verification. Verifies work (tests/lint), commits changes, writes memory entry, closes task, and emits final signal. Session ends after completion.
metadata:
  author: squad
  version: "1.0"
---

# /skill:squad-complete - Finish Task Properly

Complete current task with full verification protocol. Session ends after completion.

## Usage

```
/skill:squad-complete         # Complete task, show completion block
/skill:squad-complete --kill  # Complete and auto-kill session
```

## What This Does

1. **Verify task** (tests, lint, security)
2. **Commit changes** with proper message
3. **Write memory entry** - Save context for future agents
4. **Mark task complete** (`st close`)
5. **Emit completion signal** to IDE

## Prerequisites

You MUST have emitted a `review` signal before running this:

```bash
squad-signal review '{
  "taskId": "TASK_ID",
  "taskTitle": "TASK_TITLE",
  "summary": ["What you accomplished"],
  "filesModified": [
    {"path": "src/file.ts", "changeType": "modified", "linesAdded": 50, "linesRemoved": 10}
  ]
}'
```

## Step-by-Step Instructions

### STEP 1: Get Current Task and Agent Identity

#### 1A: Get Agent Name

Check the tmux session name or identity file:

```bash
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null)
# Agent name is the tmux session without "squad-" prefix
AGENT_NAME="${TMUX_SESSION#squad-}"
```

#### 1B: Get Current Task

Find your in-progress task:

```bash
st list --json | jq -r '.[] | select(.assignee == "AGENT_NAME" and .status == "in_progress") | .id'
```

If no task found, check for spontaneous work (uncommitted changes without a formal task).

### STEP 1D: Spontaneous Work Detection

**Only if no in_progress task was found.**

Check git status and conversation context for work that was done without a formal task:

```bash
git status --porcelain
git diff --stat
git log --oneline -5
```

If work is detected, propose creating a backfill task record:

```bash
st create "INFERRED_TITLE" \
  --type INFERRED_TYPE \
  --description "INFERRED_DESCRIPTION" \
  --assignee "$AGENT_NAME" \
  --status in_progress
```

If no work detected, exit the completion flow.

### STEP 2: Verify Task

Run verification checks appropriate to the project:

```bash
# Emit verifying signal
squad-step verifying --task "$TASK_ID" --title "$TASK_TITLE" --agent "$AGENT_NAME"

# Then run checks:
# - Tests (npm test, pytest, etc.)
# - Lint (eslint, ruff, etc.)
# - Type check (tsc --noEmit, etc.)
# - Build (npm run build, etc.)
```

If verification fails, stop and fix issues before continuing.

### STEP 2.5: Update Documentation (If Appropriate)

Only update docs when changes affect how others use the codebase:
- New tool/command added
- New API endpoint
- Breaking change
- New configuration option

Most tasks do NOT need doc updates.

### STEP 3: Commit Changes

```bash
# Get task type for commit prefix
TASK_TYPE=$(st show "$TASK_ID" --json | jq -r '.[0].issue_type // "task"')

# Commit with proper message format
squad-step committing --task "$TASK_ID" --title "$TASK_TITLE" --agent "$AGENT_NAME" --type "$TASK_TYPE"
```

If `squad-step` is not available, commit manually:

```bash
git add -A
git commit -m "TASK_TYPE($TASK_ID): TASK_TITLE

Co-Authored-By: Pi Agent <noreply@pi.dev>"
```

### STEP 3.5: Write Memory Entry

Save context from this session for future agents. Use the Write tool to create:

```
.squad/memory/{YYYY-MM-DD}-{taskId}-{slug}.md
```

Include YAML frontmatter (task, agent, project, completed, files, tags, labels, priority, type) and sections: Summary, Approach, Decisions (if notable), Key Files, Lessons (if any).

Then trigger incremental index:

```bash
squad-memory index --project "$(pwd)"
```

If indexing fails, log the error but continue. Memory is non-blocking.

### STEP 4: Mark Task Complete

```bash
squad-step closing --task "$TASK_ID" --title "$TASK_TITLE" --agent "$AGENT_NAME"
```

Or manually:

```bash
st close "$TASK_ID" --reason "Completed by $AGENT_NAME"
```

### STEP 4.5: Auto-Close Eligible Epics

```bash
st epic close-eligible
```

### STEP 5: Emit Completion Signal

```bash
squad-step complete --task "$TASK_ID" --title "$TASK_TITLE" --agent "$AGENT_NAME"
```

This generates a structured completion bundle and emits the final `complete` signal.

Then output the completion banner:

```
TASK COMPLETED: $TASK_ID
Agent: $AGENT_NAME

Summary:
  - [accomplishment 1]
  - [accomplishment 2]

Quality: tests passing, build clean

Session complete. Spawn a new agent for the next task.
```

## "Ready for Review" vs "Complete"

| State | Meaning | Task Status |
|-------|---------|--------------|
| Ready for Review | Code done, awaiting user decision | in_progress |
| Complete | Closed, reservations released | closed |

**Never say "Task Complete" until st close has run.**

## Error Handling

**No task in progress:**
```
No task in progress. Run /skill:squad-start to pick a task.
```

**Verification failed:**
```
Verification failed:
  - 2 tests failing
  - 5 lint errors
Fix issues and try again.
```

## Step Summary

| Step | Name | Tool |
|------|------|------|
| 1 | Get Task and Agent Identity | st list, tmux |
| 1D | Spontaneous Work Detection | git status |
| 2 | Verify Task | squad-step verifying |
| 2.5 | Update Documentation | (if appropriate) |
| 3 | Commit Changes | squad-step committing |
| 3.5 | Write Memory Entry | Write tool + squad-memory index |
| 4 | Mark Task Complete | squad-step closing |
| 4.5 | Auto-Close Epics | st epic close-eligible |
| 5 | Emit Completion Signal | squad-step complete |
