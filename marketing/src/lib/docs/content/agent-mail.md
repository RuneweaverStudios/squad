# Agent Registry

The Agent Registry is the coordination layer that gives agents persistent identities for multi-agent workflows. It provides identity management through lightweight bash tools backed by a SQLite database at `~/.agent-mail.db`.

## What it solves

When multiple agents work on the same codebase simultaneously, they need unique identities to coordinate. The Agent Registry provides explicit agent registration, identity lookup, and discovery.

File declarations (which files an agent plans to edit) are managed through the task system via `jt update --files`, keeping coordination data alongside the task itself.

The whole system runs as bash scripts. No servers, no sockets, no APIs. Just SQLite queries wrapped in CLI tools that any agent can call.

## Registering agents

Before an agent can start work, it needs an identity:

```bash
am-register --name CalmMeadow --program claude-code --model sonnet-4.5
```

This creates a row in the `agents` table. IDE-spawned agents get registered automatically by the spawn API, so `/jat:start` can skip this step.

Check the current identity:

```bash
am-whoami                # Shows current agent name
am-agents                # Lists all registered agents
```

## File declarations

File declarations tell other agents which files you plan to edit. They are managed on the task itself via the `--files` flag on `jt update`:

```bash
jt update myproject-abc --status in_progress --assignee CalmMeadow --files "src/lib/auth/**/*.ts"
```

When a task is closed with `jt close`, its file declarations are automatically cleared.

## Cross-session context via memory

Instead of messaging between agents, JAT uses a persistent memory system. When an agent completes a task, it writes a memory entry to `.jat/memory/` containing lessons, patterns, gotchas, and decisions from that session.

The next agent working on related code picks up this context automatically during `/jat:start`, which searches memory for relevant entries based on the task title and description.

This approach is more reliable than real-time messaging because:
- Memory persists across sessions (messages require both agents to be active)
- Memory is searchable by topic (messages are only threaded by task ID)
- Memory captures structured knowledge (not just conversation)

## The typical coordination flow

```bash
# 1. Pick a task
jt ready --json

# 2. Claim the task and declare files
jt update myproject-abc --status in_progress --assignee CalmMeadow --files "src/**/*.ts"

# 3. Do the work...

# 4. Close the task (auto-clears file declarations)
jt close myproject-abc --reason "Completed"
```

## Common pitfalls

| Error | Cause | Fix |
|-------|-------|-----|
| "from_agent not registered" | Agent identity not created | Run `am-register` first |

A few rules that save headaches:

- Keep file declaration patterns as narrow as possible
- Declare files when starting a task via `--files` on `jt update`
- The `jt close` command clears file declarations automatically

## Tool reference

| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
| `am-whoami` | Check current identity |
| `am-agents` | List all agents |
| `am-delete-agent` | Remove an agent |

Every tool supports `--help` for full usage details.

## Next steps

- [Task Management](/docs/task-management/) - JAT task system that the registry coordinates around
- [Architecture](/docs/architecture/) - How the Agent Registry fits into the two-layer design
- [Multi-Agent Swarm](/docs/multi-agent/) - Running parallel agents with coordination
