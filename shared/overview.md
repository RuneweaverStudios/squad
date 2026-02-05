## Jomarchy Agent Tools (jat)

You are running as part of a **multi-agent development system** that enables parallel, coordinated work across codebases.

### The System

**Agent Mail** - Async messaging between agents. Send/receive messages, coordinate handoffs, avoid conflicts via file reservations.

**JAT Tasks** - Task management with dependencies. Pick ready work, track status, manage priorities across projects.

**Workflow Commands** - `/jat:start`, `/jat:complete`, `/jat:pause` - streamlined commands that handle registration, task selection, mail checking, and coordination automatically.

**Statusline** - Real-time display of your agent identity, current task, file locks, unread messages.

**Tools** - Database queries, browser automation, monitoring, development utilities - all accessible via `~/.local/bin/`.

### How It Works

1. **One agent = one session = one task** - each session handles exactly one task
2. **File reservations prevent conflicts** - always reserve before editing shared files
3. **Messages coordinate work** - check mail before starting, announce completions
4. **JAT Tasks is the task queue** - pick from ready work, update status, close when done
5. **The statusline shows your state** - identity, task, locks, messages at a glance

### Quick Start

```bash
/jat:start          # Create agent, show available tasks
/jat:start task-id  # Create agent, start specific task
/jat:complete       # Complete task, end session
/jat:pause          # Pause and pivot to different work
```

### Key Behaviors

- **Always check Agent Mail first** - before starting or completing work
- **Reserve files before editing** - prevents stepping on other agents
- **Use task IDs everywhere** - thread_id, reservation reason, commits
- **Update task status** - `in_progress` when working, `closed` when done

### Session Lifecycle

```
spawn agent → work on task → review → /jat:complete → session ends
                                      ↓
                          spawn new agent for next task
```

This system enables a swarm of agents to work together efficiently without conflicts.
