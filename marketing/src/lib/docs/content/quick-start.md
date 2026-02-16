# Quick Start

This guide walks you through the full lifecycle: launching the IDE, creating a task, running an agent on it, and completing the work. Takes about five minutes.

## Start the IDE

```bash
jat
```

This command checks dependencies, starts the SvelteKit dev server, and opens your browser. The IDE usually runs at `http://127.0.0.1:5174`.

If you prefer to skip the IDE and work purely from the terminal, thats fine too. Every operation in JAT has a CLI equivalent.

## Create a task

Tasks live in the JAT task system. You can create them from the IDE's task view or from the command line:

```bash
jt create "Add user settings page" \
  --type feature \
  --priority 1 \
  --labels frontend,ui \
  --description "Create a settings page where users can update their profile, change email, and manage notification preferences."
```

This creates a task with a generated ID like `myproject-abc`. The task starts in `open` status, ready for an agent to pick up.

You can also create tasks directly in the IDE. Go to the Tasks page and click the "+" button. The IDE uses AI to auto-suggest priority, type, and labels based on your title.

## Launch an agent session

Every agent session runs inside tmux. The recommended way to start is with a launcher function:

```bash
jat myproject 1 --auto
```

This creates one tmux session, starts Claude Code inside it, and automatically runs `/jat:start auto` to pick the highest-priority ready task.

For manual control, start a session and pick your task:

```bash
jat-myproject        # Launches a single agent session
```

Then inside the Claude session:

```bash
/jat:start myproject-abc
```

The `/jat:start` command does several things in sequence:

1. Registers the agent with a generated name (like "CalmMeadow")
2. Searches memory for relevant context from past sessions
3. Claims the task by setting status to `in_progress`
4. Declares files to prevent conflicts with other agents
5. Emits signals so the IDE can track progress

## Work on the task

The agent now codes, tests, and iterates like any normal Claude Code session. During work, the IDE shows real-time status through the signal system.

If the agent needs clarification, it emits a `needs_input` signal and asks a question. In the IDE, this renders as clickable buttons instead of typing a number in the terminal.

When the agent finishes coding, it emits a `review` signal and displays a summary:

```
┌────────────────────────────────────────────────────────┐
│  READY FOR REVIEW: myproject-abc                       │
└────────────────────────────────────────────────────────┘

Summary:
  - Created settings page component
  - Added profile update API endpoint
  - Wrote 12 unit tests

Run /jat:complete when ready to close this task.
```

At this point the work is done but the task is still `in_progress`. You review the changes before completing.

## Complete the task

Once youre satisfied with the work:

```bash
/jat:complete
```

This triggers the completion protocol:

1. Runs verification (tests, lint, type checking)
2. Commits changes with a task-ID-prefixed message
3. Closes the task (`jt close`)
4. Clears file declarations
5. Generates a structured completion bundle with suggested follow-up tasks

The session ends after completion. To work on the next task, spawn a new agent.

## Session lifecycle

Every session follows this state machine:

```
  ┌──────────┐
  │ STARTING │  /jat:start registers agent, picks task
  └────┬─────┘
       │
       ▼
  ┌──────────┐      ┌─────────────┐
  │ WORKING  │ <--> │ NEEDS INPUT │  Agent asks questions as needed
  └────┬─────┘      └─────────────┘
       │
       ▼
  ┌──────────┐
  │  REVIEW  │  Work done, waiting for user approval
  └────┬─────┘
       │
       ▼
  ┌──────────┐
  │ COMPLETE │  Task closed, session ends
  └──────────┘

  To work on another task: spawn a new agent
```

The one-agent-one-task rule keeps sessions focused. No context pollution between tasks. No confusion about which files belong to which change.

## Run multiple agents

JAT really shines when you run several agents in parallel:

```bash
jat myproject 4 --auto
```

This launches four agents with a 15-second stagger between each. Every agent picks the next highest-priority ready task automatically. File declarations prevent conflicts, and the IDE shows all sessions in a unified dashboard.

## Common commands

| Command | What it does |
|---------|-------------|
| `jat` | Start the IDE |
| `jat myproject 4 --auto` | Launch 4 auto-attacking agents |
| `/jat:start` | Register agent and show available tasks |
| `/jat:start task-id` | Start a specific task |
| `/jat:complete` | Run the full completion protocol |
| `/jat:pause` | Pause current work and pivot |
| `jt ready --json` | List tasks ready to start |
| `jt list --status open` | List all open tasks |
| `jt show task-id --json` | Check task details and file declarations |

## Next steps

- [Sessions & Agents](/docs/sessions/) - How agent identity and sessions work
- [Task Management](/docs/task-management/) - Creating tasks, dependencies, and epics
- [Multi-Agent Swarm](/docs/multi-agent/) - Running parallel agents on a backlog
