# Workflow Commands

JAT provides three slash commands that handle the full agent lifecycle. These commands automate registration, task selection, conflict detection, verification, and completion. They are the primary interface between agents and the JAT coordination system.

## /jat:start

Begins a work session. This command establishes agent identity, searches memory for relevant context, and selects a task.

```bash
/jat:start                    # Create agent, show available tasks
/jat:start task-id            # Create agent, start specific task
/jat:start AgentName          # Resume as named agent
/jat:start AgentName task-id  # Resume as named agent on specific task
```

**Step-by-step execution:**

1. **Parse parameters** to detect if a task ID, agent name, or both were provided
2. **Get/create agent** by checking for pre-registered identity (IDE-spawned) or registering a new one via `am-register`
3. **Search memory** for relevant context from past sessions via `jat-memory search`
4. **Select task** from parameter or display ready work with `jt ready --json`
5. **Review prior tasks** to check for duplicates and related work in the last 7 days
6. **Detect conflicts** by checking file reservations and uncommitted changes
7. **Start task** by updating task status and reserving files
8. **Emit signals** in sequence: `starting` then `working`

The starting signal fires immediately after registration:

```bash
jat-signal starting '{
  "agentName": "FairBay",
  "sessionId": "abc123",
  "project": "jat",
  "model": "claude-opus-4-5-20251101",
  "gitBranch": "master",
  "gitStatus": "clean",
  "tools": ["Bash","Read","Write","Edit","Glob","Grep"],
  "uncommittedFiles": []
}'
```

The working signal fires after reading the task and planning the approach:

```bash
jat-signal working '{
  "taskId": "jat-abc",
  "taskTitle": "Add user auth",
  "approach": "Implement OAuth via Supabase"
}'
```

Both signals are mandatory. Without them, the IDE shows incorrect session state.

## /jat:complete

Finishes the current task with full verification. The session ends after this command runs.

```bash
/jat:complete          # Complete with review
/jat:complete --kill   # Complete and auto-kill session
```

**Step-by-step execution:**

| Step | Action | Tool | Signal |
|------|--------|------|--------|
| 1 | Get task and agent identity | `get-current-session-id`, task lookup | - |
| 2 | Verify task (tests, lint, security) | `jat-step verifying` | completing (0%) |
| 3 | Commit changes | `jat-step committing` | completing (25%) |
| 4 | Mark task complete | `jat-step closing` | completing (50%) |
| 4.5 | Auto-close eligible parent epics | `jt epic close-eligible` | - |
| 5 | Release file reservations | `jat-step releasing` | completing (75%) |
| 6 | Generate completion bundle and emit | `jat-step complete` | complete (100%) |

**The difference between "Ready for Review" and "Complete" matters.** Ready for Review means the agent finished coding and is presenting results. Complete means the task is closed and reservations released. Never say "Task Complete" before step 6 finishes.

The `--kill` flag tells the IDE to auto-terminate the tmux session after completion. Without it, the session stays open for the user to review output.

**Spontaneous work detection** activates when `/jat:complete` runs but no task is marked `in_progress`. The command analyzes the conversation and git state to detect ad-hoc work, then offers to create a backfilled task record.

## /jat:pause

Pauses current work to pivot to something else. Unlike `/jat:complete`, this doesn't close the task.

The agent's task stays `in_progress`. File reservations remain active.

Use `/jat:pause` when you need to:

- Switch to an urgent bug while mid-feature
- Hand off partial work to another agent
- Stop for external input that might take hours

## Session lifecycle diagram

```
IDE spawns agent
       |
       v
  +-----------+
  | STARTING  |  /jat:start (emit starting signal)
  +-----+-----+
        | emit working signal
        v
  +-----------+      +--------------+
  |  WORKING  |<---->| NEEDS INPUT  |
  +-----+-----+      +--------------+
        | emit review signal
        v
  +-----------+
  |  REVIEW   |  Work done, awaiting user approval
  +-----+-----+
        | /jat:complete
        v
  +-----------+
  | COMPLETE  |  Task closed, session ends
  +-----------+
```

After completion, the user spawns a new agent for the next task. One agent = one session = one task. This keeps context clean and prevents token budget bloat from long conversations.

## See also

- [Signals](/docs/signals/) for the signal protocol at each step
- [Work Sessions](/docs/work-sessions/) for how the IDE displays session state
- [Multi-Agent Swarm](/docs/multi-agent/) for auto-spawning agents on tasks
- [Automation](/docs/automation/) for auto-completing review steps
