# JAT Agent Instructions

You are running as part of a **multi-agent development system** called JAT (Jomarchy Agent Tools). This system enables parallel, coordinated work across codebases using multiple AI coding agents.

## Quick Start

```bash
# Start a session (pick a task)
/skill:jat-start

# Start a specific task
/skill:jat-start jat-abc123

# Complete your task
/skill:jat-complete

# Verify in browser
/skill:jat-verify
```

## Core Principles

1. **One agent = one session = one task** - Each session handles exactly one task
2. **File reservations prevent conflicts** - Always reserve before editing shared files
3. **Messages coordinate work** - Check Agent Mail before starting and completing
4. **JAT Tasks is the task queue** - Pick from ready work, update status, close when done
5. **Signals track your state** - The IDE monitors agents through `jat-signal`

## JAT Tasks (Task Management)

This project uses `jt` (JAT Tasks) for issue tracking.

```bash
jt ready                    # Find available work (highest priority, no blockers)
jt show <id>                # View task details
jt show <id> --json         # JSON format
jt update <id> --status in_progress --assignee AgentName
jt close <id> --reason "Completed"
jt list --status open       # List all open tasks
jt search "keyword"         # Search tasks
```

**Status values** (use underscores, not hyphens):
- `open` - Available to start
- `in_progress` - Being worked on
- `blocked` - Waiting on something
- `closed` - Completed

**Task types:** `bug`, `feature`, `task`, `epic`, `chore`

### Dependencies

```bash
jt dep add parent-id child-id   # parent depends on child
jt dep tree task-id             # Show dependency tree
jt dep remove parent-id child-id
```

### Epics

Epics are **blocked by their children** (children are READY, epic waits):

```bash
# Create epic
jt create "Epic title" --type epic --priority 1

# Create children
jt create "Child task" --type task --priority 2

# Set dependencies: epic depends on children (NOT children on epic)
jt dep add epic-id child-id
```

## Agent Mail (Coordination)

Async messaging between agents. All tools are in `~/.local/bin/`.

```bash
# Identity
am-register --name AgentName --program pi --model sonnet
am-whoami

# Messages
am-inbox AgentName --unread                       # Check inbox
am-send "Subject" "Body" --from Me --to Other --thread task-id
am-reply MSG_ID "Response" --agent AgentName
am-ack MSG_ID --agent AgentName                   # Acknowledge

# File Reservations (prevent conflicts)
am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --reason "task-id"
am-release "src/**/*.ts" --agent AgentName
am-reservations --json                            # List all locks
```

**Broadcast recipients:** `@active` (last 60min), `@recent` (24h), `@all`

## Signals (IDE State Tracking)

The IDE tracks your state through signals. Emit them in order:

```bash
# 1. Starting (after registration)
jat-signal starting '{"agentName":"NAME","sessionId":"ID","project":"PROJECT","model":"MODEL","gitBranch":"BRANCH","gitStatus":"clean","tools":["bash","read","write","edit"],"uncommittedFiles":[]}'

# 2. Working (before coding)
jat-signal working '{"taskId":"ID","taskTitle":"TITLE","approach":"PLAN"}'

# 3. Needs Input (before asking user)
jat-signal needs_input '{"taskId":"ID","question":"QUESTION","questionType":"clarification"}'

# 4. Review (when work is done)
jat-signal review '{"taskId":"ID","taskTitle":"TITLE","summary":["ITEM1","ITEM2"]}'
```

**Signal types:** `starting`, `working`, `needs_input`, `review`, `completing`, `complete`

## Session Lifecycle

```
Spawn agent
    |
    v
 STARTING   /skill:jat-start
    | jat-signal working
    v
 WORKING  <--> NEEDS INPUT
    | jat-signal review
    v
 REVIEW     Work done, awaiting user
    | /skill:jat-complete
    v
 COMPLETE   Task closed, session ends
```

To work on another task: spawn a new agent session.

## Completion Workflow

When finishing work:

1. Emit `review` signal
2. Show "READY FOR REVIEW" with summary
3. Wait for user to run `/skill:jat-complete`
4. Complete handles: mail check, verify, commit, close, release, announce

**Never say "Task Complete" until `jt close` has run.**

### Completion Steps (jat-step)

These tools emit progress signals automatically:

```bash
jat-step verifying --task ID --title TITLE --agent NAME    # 0%
jat-step committing --task ID --title TITLE --agent NAME   # 20%
jat-step closing --task ID --title TITLE --agent NAME      # 40%
jat-step releasing --task ID --title TITLE --agent NAME    # 60%
jat-step announcing --task ID --title TITLE --agent NAME   # 80%
jat-step complete --task ID --title TITLE --agent NAME     # 100%
```

## Available Tools

All tools are bash commands in `~/.local/bin/`. Every tool has `--help`.

### Task Management
| Tool | Purpose |
|------|---------|
| `jt` | JAT Tasks CLI for task management |
| `jt-epic-child` | Set epic-child dependency correctly |

### Agent Mail
| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
| `am-inbox` | Check messages |
| `am-send` | Send message |
| `am-reply` | Reply to message |
| `am-ack` | Acknowledge message |
| `am-reserve` | Lock files |
| `am-release` | Unlock files |
| `am-reservations` | List locks |
| `am-search` | Search messages |
| `am-agents` | List agents |
| `am-whoami` | Current identity |

### Signals
| Tool | Purpose |
|------|---------|
| `jat-signal` | Emit status signal to IDE |
| `jat-step` | Emit completion step signal |

### Browser Automation
| Tool | Purpose |
|------|---------|
| `browser-start.js` | Launch Chrome with CDP |
| `browser-nav.js` | Navigate to URL |
| `browser-screenshot.js` | Capture screenshot |
| `browser-eval.js` | Execute JS in page |
| `browser-pick.js` | Click element |
| `browser-wait.js` | Wait for condition |

### Database
| Tool | Purpose |
|------|---------|
| `db-query` | Run SQL, returns JSON |
| `db-schema` | Show table structure |
| `jat-secret` | Retrieve secrets |

### Skills
| Tool | Purpose |
|------|---------|
| `jat-skills` | Browse, install, and manage skills from the catalog |

Skills installed via `jat-skills install` are automatically synced to your agent program. Claude Code gets them as commands in `~/.claude/commands/`, Pi gets them in `~/.pi/agent/skills/`, and other agents receive skill summaries via prompt injection at spawn.

## Commit Messages

Use the task type as prefix:

```bash
git commit -m "task(jat-abc): Add feature X"
git commit -m "bug(jat-abc): Fix race condition"
git commit -m "feat(jat-abc): Implement new endpoint"
```

## Key Behaviors

- **Always check Agent Mail first** - before starting or completing work
- **Reserve files before editing** - prevents stepping on other agents
- **Use task IDs everywhere** - thread_id, reservation reason, commits
- **Update task status** - `in_progress` when working, `closed` when done
- **Emit signals in order** - starting -> working -> review -> complete
- **Push to remote** - work is NOT complete until `git push` succeeds
