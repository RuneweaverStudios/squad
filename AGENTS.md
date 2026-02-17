# JAT Agent Instructions

<!-- This is the canonical source for agent workflow instructions.
     It is imported by CLAUDE.md (for Claude Code agents) and read directly
     by other agent programs (Pi, Codex, Gemini, OpenCode, Aider).
     Keep this file self-contained - no @import syntax. -->

You are running as part of a **multi-agent development system** called JAT (Jomarchy Agent Tools). This system enables parallel, coordinated work across codebases using multiple AI coding agents.

## Quick Start

```bash
/jat:start                 # Start a session (pick a task)
/jat:start jat-abc123      # Start a specific task
/jat:complete              # Complete your task
/jat:verify                # Verify in browser
```

> **Command prefix:** Claude Code uses `/jat:` commands. Other agents (Pi, Codex, Gemini, etc.)
> use `/skill:jat-` skills. The behavior is identical.

## Core Principles

1. **One agent = one session = one task** - Each session handles exactly one task
2. **File declarations prevent conflicts** - Declare files when starting a task via `--files`
3. **Memory coordinates work** - Past session context surfaces via `.jat/memory/`
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

**Task types:** `bug`, `feature`, `task`, `epic`, `chore`, `chat`

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

## Agent Registry (Identity)

Agent identities for multi-agent coordination. All tools are in `~/.local/bin/`.

```bash
# Identity
am-register --name AgentName --program pi --model sonnet
am-whoami
am-agents                                         # List all agents

# File Declarations (prevent conflicts) - via jt on the task itself
jt update task-id --status in_progress --assignee AgentName --files "src/**/*.ts"
```

Cross-session context is handled by agent memory (`.jat/memory/`).

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
 STARTING   /jat:start
    | jat-signal working
    v
 WORKING  <--> NEEDS INPUT
    | jat-signal review
    v
 REVIEW     Work done, awaiting user
    | /jat:complete
    v
 COMPLETE   Task closed, session ends
```

To work on another task: spawn a new agent session.

## Completion Workflow

When finishing work:

1. Emit `review` signal
2. Show "READY FOR REVIEW" with summary
3. Wait for user to run `/jat:complete`
4. Complete handles: mail check, verify, commit, close, release, announce

**Never say "Task Complete" until `jt close` has run.**

### Completion Steps (jat-step)

These tools emit progress signals automatically:

```bash
jat-step verifying --task ID --title TITLE --agent NAME    # 0%
jat-step committing --task ID --title TITLE --agent NAME   # 25%
jat-step closing --task ID --title TITLE --agent NAME      # 50%
jat-step releasing --task ID --title TITLE --agent NAME    # 75%
jat-step complete --task ID --title TITLE --agent NAME     # 100%
```

## Available Tools

All tools are bash commands in `~/.local/bin/`. Every tool has `--help`.

### Task Management
| Tool | Purpose |
|------|---------|
| `jt` | JAT Tasks CLI for task management |
| `jt-epic-child` | Set epic-child dependency correctly |

### Agent Registry
| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
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

### Search
| Tool | Purpose |
|------|---------|
| `jat-search` | Unified search across tasks, memory, and files |

Use `jat-search` as your primary context retrieval tool. Search broadly first, then drill into specific sources:

```bash
jat-search "auth middleware"             # Meta search (all sources)
jat-search tasks "OAuth timeout" --json  # Deep task search
jat-search memory "browser automation"   # Memory search (past sessions)
jat-search files "refreshToken"          # File content search
```

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

- **Declare files when starting task** - use `--files` on `jt update` to prevent conflicts
- **Use task IDs everywhere** - commits, memory entries
- **Update task status** - `in_progress` when working, `closed` when done
- **Emit signals in order** - starting -> working -> review -> complete
- **Push to remote** - work is NOT complete until `git push` succeeds
