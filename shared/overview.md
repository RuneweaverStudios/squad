## Jomarchy Agent Tools (squad)

<!-- For the SQUAD repo itself, AGENTS.md is the canonical and more complete
     version of these instructions. This file is for other projects that
     import it via their CLAUDE.md. -->

You are running as part of a **multi-agent development system** that enables parallel, coordinated work across codebases.

### The System

**Agent Registry** - Agent identities for multi-agent coordination. Register agents, list active agents.

**SQUAD Tasks** - Task management with dependencies. Pick ready work, track status, manage priorities across projects.

**Workflow Commands** - `/squad:start`, `/squad:complete`, `/squad:pause` - streamlined commands that handle registration, task selection, and coordination automatically.

**Statusline** - Real-time display of your agent identity and current task.

**Tools** - Database queries, browser automation, monitoring, development utilities - all accessible via `~/.local/bin/`.

### How It Works

1. **One agent = one session = one task** - each session handles exactly one task
2. **File declarations prevent conflicts** - declare files when starting a task via `--files`
3. **Memory coordinates work** - past session context surfaces via `.squad/memory/`
4. **SQUAD Tasks is the task queue** - pick from ready work, update status, close when done
5. **The statusline shows your state** - identity, task at a glance

### Quick Start

```bash
/squad:start          # Create agent, show available tasks
/squad:start task-id  # Create agent, start specific task
/squad:complete       # Complete task, end session
/squad:pause          # Pause and pivot to different work
```

> **IDE-spawned agents:** When spawned by the IDE, agents are pre-registered
> automatically. The workflow commands above are for manual CLI usage.
> IDE-spawned non-Claude agents should NOT run `am-register`.

### Key Behaviors

- **Declare files when starting task** - use `--files` on `st update` to prevent conflicts
- **Use task IDs everywhere** - commits, memory entries
- **Update task status** - `in_progress` when working, `closed` when done

### Session Lifecycle

```
spawn agent → work on task → review → /squad:complete → session ends
                                      ↓
                          spawn new agent for next task
```

This system enables a swarm of agents to work together efficiently without conflicts.
