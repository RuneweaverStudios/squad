## Jomarchy Agent Tools (jat)

<!-- For the JAT repo itself, AGENTS.md is the canonical and more complete
     version of these instructions. This file is for other projects that
     import it via their CLAUDE.md. -->

You are running as part of a **multi-agent development system** that enables parallel, coordinated work across codebases.

### The System

**Agent Registry** - Agent identities for multi-agent coordination. Register agents, list active agents.

**JAT Tasks** - Task management with dependencies. Pick ready work, track status, manage priorities across projects.

**Workflow Commands** - `/jat:start`, `/jat:complete`, `/jat:pause` - streamlined commands that handle registration, task selection, and coordination automatically.

**Statusline** - Real-time display of your agent identity and current task.

**Tools** - Database queries, browser automation, monitoring, development utilities - all accessible via `~/.local/bin/`.

### How It Works

1. **One agent = one session = one task** - each session handles exactly one task
2. **File declarations prevent conflicts** - declare files when starting a task via `--files`
3. **Memory coordinates work** - past session context surfaces via `.jat/memory/`
4. **JAT Tasks is the task queue** - pick from ready work, update status, close when done
5. **The statusline shows your state** - identity, task at a glance

### Quick Start

```bash
/jat:start          # Create agent, show available tasks
/jat:start task-id  # Create agent, start specific task
/jat:complete       # Complete task, end session
/jat:pause          # Pause and pivot to different work
```

> **IDE-spawned agents:** When spawned by the IDE, agents are pre-registered
> automatically. The workflow commands above are for manual CLI usage.
> IDE-spawned non-Claude agents should NOT run `am-register`.

### Key Behaviors

- **Declare files when starting task** - use `--files` on `jt update` to prevent conflicts
- **Use task IDs everywhere** - commits, memory entries
- **Update task status** - `in_progress` when working, `closed` when done

### Session Lifecycle

```
spawn agent → work on task → review → /jat:complete → session ends
                                      ↓
                          spawn new agent for next task
```

This system enables a swarm of agents to work together efficiently without conflicts.
