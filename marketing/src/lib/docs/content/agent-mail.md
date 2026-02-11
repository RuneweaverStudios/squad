# Agent Registry

The Agent Registry is the coordination layer that prevents agents from stepping on each other. It provides identity management and advisory file reservations through lightweight bash tools backed by a SQLite database at `~/.agent-mail.db`.

## What it solves

When multiple agents work on the same codebase simultaneously, they edit the same files and create conflicts. The Agent Registry fixes this with explicit agent identities and advisory file reservations (leases).

The whole system runs as bash scripts. No servers, no sockets, no APIs. Just SQLite queries wrapped in CLI tools that any agent can call.

## Registering agents

Before an agent can reserve files, it needs an identity:

```bash
am-register --name CalmMeadow --program claude-code --model sonnet-4.5
```

This creates a row in the `agents` table. IDE-spawned agents get registered automatically by the spawn API, so `/jat:start` can skip this step.

Check the current identity:

```bash
am-whoami                # Shows current agent name
am-agents                # Lists all registered agents
```

## File reservations

File reservations are advisory locks that tell other agents "I'm working on these files." They dont block filesystem access. They just make conflicts visible before they happen.

### Reserving files

```bash
am-reserve "src/lib/auth/**/*.ts" \
  --agent CalmMeadow \
  --ttl 3600 \
  --exclusive \
  --reason "myproject-abc"
```

| Option | Purpose |
|--------|---------|
| `--ttl` | Reservation expires after this many seconds |
| `--exclusive` | No other agent can reserve overlapping files |
| `--reason` | Usually the task ID, for traceability |

The glob pattern follows standard shell globbing. Be specific to avoid locking too many files.

### Checking reservations

```bash
# All active reservations
am-reservations

# Your reservations
am-reservations --agent CalmMeadow
```

Before starting work, agents should check what files are already reserved:

```bash
am-reservations --json | jq '.[] | select(.agent != "CalmMeadow")'
```

### Releasing reservations

When work is done, release the locks:

```bash
am-release "src/lib/auth/**/*.ts" --agent CalmMeadow
```

The `/jat:complete` command releases all reservations for the completing agent automatically.

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

# 2. Reserve the files you plan to edit
am-reserve "src/**/*.ts" --agent CalmMeadow --ttl 3600 --exclusive --reason "myproject-abc"

# 3. Do the work...

# 4. Release files on completion
am-release "src/**/*.ts" --agent CalmMeadow
```

## Messaging tools (available, not required)

The database also stores messages via `am-send`, `am-inbox`, `am-reply`, `am-ack`, and `am-search`. These messaging tools are available for manual coordination between agents but are **not used in standard workflows** (`/jat:start` and `/jat:complete` do not check or send messages).

Agent memory (`.jat/memory/`) replaces messaging for cross-session context transfer.

## Common pitfalls

| Error | Cause | Fix |
|-------|-------|-----|
| "from_agent not registered" | Agent identity not created | Run `am-register` first |
| "FILE_RESERVATION_CONFLICT" | Another agent holds exclusive lock | Wait for expiry or adjust your glob pattern |

A few rules that save headaches:

- Keep reservation patterns as narrow as possible
- Include the task ID in the reservation reason
- The `/jat:complete` command releases all reservations automatically

## Tool reference

| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
| `am-whoami` | Check current identity |
| `am-agents` | List all agents |
| `am-reserve` | Reserve files |
| `am-release` | Release file reservations |
| `am-reservations` | List active reservations |

Messaging tools (available but not used in workflows):

| Tool | Purpose |
|------|---------|
| `am-send` | Send a message |
| `am-reply` | Reply to a message |
| `am-inbox` | Check inbox |
| `am-ack` | Acknowledge a message |
| `am-search` | Search messages |

Every tool supports `--help` for full usage details.

## Next steps

- [Task Management](/docs/task-management/) - JAT task system that the registry coordinates around
- [Architecture](/docs/architecture/) - How the Agent Registry fits into the two-layer design
- [Multi-Agent Swarm](/docs/multi-agent/) - Running parallel agents with coordination
