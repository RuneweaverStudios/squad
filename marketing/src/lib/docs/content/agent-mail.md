# Agent Mail

Agent Mail is the coordination layer that prevents agents from stepping on each other. It provides async messaging, file reservations, and identity management through lightweight bash tools backed by a SQLite database at `~/.agent-mail.db`.

## What it solves

When multiple agents work on the same codebase simultaneously, two things break fast: they edit the same files, and they lose track of what the others are doing. Agent Mail fixes both problems with advisory file reservations and threaded messaging.

The whole system runs as bash scripts. No servers, no sockets, no APIs. Just SQLite queries wrapped in CLI tools that any agent can call.

## Registering agents

Before an agent can send or receive messages, it needs an identity:

```bash
am-register --name CalmMeadow --program claude-code --model sonnet-4.5
```

This creates a row in the `agents` table. IDE-spawned agents get registered automatically by the spawn API, so `/jat:start` can skip this step.

Check the current identity:

```bash
am-whoami                # Shows current agent name
am-agents                # Lists all registered agents
```

## Sending messages

Messages are threaded by task ID. This keeps conversations organized when multiple tasks are in flight.

```bash
am-send "Starting auth work" "Implementing OAuth flow for Google login" \
  --from CalmMeadow \
  --to SwiftMoon \
  --thread myproject-abc
```

Send to multiple agents or broadcast groups:

```bash
# Send to all agents active in the last 60 minutes
am-send "Breaking change" "Renamed auth module" \
  --from CalmMeadow \
  --to @active \
  --importance high \
  --thread myproject-abc
```

### Broadcast recipients

| Recipient | Who receives |
|-----------|-------------|
| `@active` | Agents active in the last 60 minutes |
| `@recent` | Agents active in the last 24 hours |
| `@all` | Every registered agent |
| `@project:name` | Agents working on a specific project |
| `AgentName` | One specific agent |

## Checking inbox

```bash
# Unread messages only
am-inbox CalmMeadow --unread

# Unread messages, hiding already acknowledged ones
am-inbox CalmMeadow --unread --hide-acked

# Messages in a specific thread
am-inbox CalmMeadow --thread myproject-abc
```

After reading a message, acknowledge it:

```bash
am-ack 42 --agent CalmMeadow
```

Acknowledging marks the message as read. The `/jat:start` and `/jat:complete` commands always check the inbox first, read every message, respond if needed, and then acknowledge.

## Replying to messages

```bash
am-reply 42 "Got it, I'll avoid those files" --agent CalmMeadow
```

Replies stay in the same thread as the original message.

## Searching messages

```bash
# Search by text
am-search "OAuth" --thread myproject-abc

# All messages in a thread
am-inbox CalmMeadow --thread myproject-abc
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

## Thread-based communication

Every message has an optional `thread_id`. The convention is to use the Beads task ID as the thread:

- Mail `thread_id`: `myproject-abc`
- Message subject prefix: `[myproject-abc]`
- Reservation `reason`: `myproject-abc`

This keeps everything connected. You can pull up all communication about a task with one query:

```bash
am-inbox CalmMeadow --thread myproject-abc
```

## The typical coordination flow

```bash
# 1. Pick a task from Beads
bd ready --json

# 2. Reserve the files you plan to edit
am-reserve "src/**/*.ts" --agent CalmMeadow --ttl 3600 --exclusive --reason "myproject-abc"

# 3. Announce you're starting
am-send "[myproject-abc] Starting: Add auth" "Working on OAuth flow" \
  --from CalmMeadow --to @active --thread myproject-abc

# 4. Do the work...

# 5. Announce completion and release files
am-send "[myproject-abc] Completed" "OAuth implemented and tested" \
  --from CalmMeadow --to @active --thread myproject-abc
am-release "src/**/*.ts" --agent CalmMeadow
```

## Common pitfalls

| Error | Cause | Fix |
|-------|-------|-----|
| "from_agent not registered" | Agent identity not created | Run `am-register` first |
| "FILE_RESERVATION_CONFLICT" | Another agent holds exclusive lock | Wait for expiry or adjust your glob pattern |
| Empty inbox after sending | Sent to self or inactive recipient | Check recipient with `am-agents` |
| Messages not acknowledged | Forgot `am-ack` after reading | Always ack after reading and responding |

A few rules that save headaches:

- Always check Agent Mail before starting work (`/jat:start` does this automatically)
- Always check Agent Mail before completing work (`/jat:complete` does this too)
- Keep reservation patterns as narrow as possible
- Include the task ID in thread_id, subject, and reservation reason
- Dont use Agent Mail for task management. Beads is the task queue. Mail is for conversations and coordination.

## Tool reference

| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
| `am-whoami` | Check current identity |
| `am-agents` | List all agents |
| `am-send` | Send a message |
| `am-reply` | Reply to a message |
| `am-inbox` | Check inbox |
| `am-ack` | Acknowledge a message |
| `am-search` | Search messages |
| `am-reserve` | Reserve files |
| `am-release` | Release file reservations |
| `am-reservations` | List active reservations |

Every tool supports `--help` for full usage details.

## Next steps

- [Task Management](/docs/task-management/) - Beads task system that Agent Mail coordinates around
- [Architecture](/docs/architecture/) - How Agent Mail fits into the two-layer design
- [Multi-Agent Swarm](/docs/multi-agent/) - Running parallel agents with coordination
