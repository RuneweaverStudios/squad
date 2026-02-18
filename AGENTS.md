# SQUAD Agent Instructions

<!-- This is the canonical source for agent workflow instructions.
     It is imported by CLAUDE.md (for Claude Code agents) and read directly
     by other agent programs (Pi, Codex, Gemini, OpenCode, Aider).
     Keep this file self-contained - no @import syntax. -->

You are running as part of a **multi-agent development system** called SQUAD (Jomarchy Agent Tools). This system enables parallel, coordinated work across codebases using multiple AI coding agents.

## Quick Start

```bash
/squad:start                 # Start a session (pick a task)
/squad:start squad-abc123      # Start a specific task
/squad:complete              # Complete your task
/squad:verify                # Verify in browser
```

> **Command prefix:** Claude Code uses `/squad:` commands. Other agents (Pi, Codex, Gemini, etc.)
> use `/skill:squad-` skills. The behavior is identical.

## Core Principles

1. **One agent = one session = one task** - Each session handles exactly one task
2. **File declarations prevent conflicts** - Declare files when starting a task via `--files`
3. **Memory coordinates work** - Past session context surfaces via `.squad/memory/`
4. **SQUAD Tasks is the task queue** - Pick from ready work, update status, close when done
5. **Signals track your state** - The IDE monitors agents through `squad-signal`

## SQUAD Tasks (Task Management)

This project uses `st` (SQUAD Tasks) for issue tracking.

```bash
st ready                    # Find available work (highest priority, no blockers)
st show <id>                # View task details
st show <id> --json         # JSON format
st update <id> --status in_progress --assignee AgentName
st close <id> --reason "Completed"
st list --status open       # List all open tasks
st search "keyword"         # Search tasks
```

**Status values** (use underscores, not hyphens):
- `open` - Available to start
- `in_progress` - Being worked on
- `blocked` - Waiting on something
- `closed` - Completed

**Task types:** `bug`, `feature`, `task`, `epic`, `chore`, `chat`

### Dependencies

```bash
st dep add parent-id child-id   # parent depends on child
st dep tree task-id             # Show dependency tree
st dep remove parent-id child-id
```

### Epics

Epics are **blocked by their children** (children are READY, epic waits):

```bash
# Create epic
st create "Epic title" --type epic --priority 1

# Create children
st create "Child task" --type task --priority 2

# Set dependencies: epic depends on children (NOT children on epic)
st dep add epic-id child-id
```

## Agent Registry (Identity)

Agent identities for multi-agent coordination. All tools are in `~/.local/bin/`.

```bash
# Identity
am-register --name AgentName --program pi --model sonnet
am-whoami
am-agents                                         # List all agents

# File Declarations (prevent conflicts) - via st on the task itself
st update task-id --status in_progress --assignee AgentName --files "src/**/*.ts"
```

Cross-session context is handled by agent memory (`.squad/memory/`).

## Signals (IDE State Tracking)

The IDE tracks your state through signals. Emit them in order:

```bash
# 1. Starting (after registration)
squad-signal starting '{"agentName":"NAME","sessionId":"ID","project":"PROJECT","model":"MODEL","gitBranch":"BRANCH","gitStatus":"clean","tools":["bash","read","write","edit"],"uncommittedFiles":[]}'

# 2. Working (before coding)
squad-signal working '{"taskId":"ID","taskTitle":"TITLE","approach":"PLAN"}'

# 3. Needs Input (before asking user)
squad-signal needs_input '{"taskId":"ID","question":"QUESTION","questionType":"clarification"}'

# 4. Review (when work is done)
squad-signal review '{"taskId":"ID","taskTitle":"TITLE","summary":["ITEM1","ITEM2"]}'
```

**Signal types:** `starting`, `working`, `needs_input`, `review`, `completing`, `complete`

## Session Lifecycle

```
Spawn agent
    |
    v
 STARTING   /squad:start
    | squad-signal working
    v
 WORKING  <--> NEEDS INPUT
    | squad-signal review
    v
 REVIEW     Work done, awaiting user
    | /squad:complete
    v
 COMPLETE   Task closed, session ends
```

To work on another task: spawn a new agent session.

## Completion Workflow

When finishing work:

1. Emit `review` signal
2. Show "READY FOR REVIEW" with summary
3. Wait for user to run `/squad:complete`
4. Complete handles: mail check, verify, commit, close, release, announce

**Never say "Task Complete" until `st close` has run.**

### Completion Steps (squad-step)

These tools emit progress signals automatically:

```bash
squad-step verifying --task ID --title TITLE --agent NAME    # 0%
squad-step committing --task ID --title TITLE --agent NAME   # 25%
squad-step closing --task ID --title TITLE --agent NAME      # 50%
squad-step releasing --task ID --title TITLE --agent NAME    # 75%
squad-step complete --task ID --title TITLE --agent NAME     # 100%
```

## Available Tools

All tools are bash commands in `~/.local/bin/`. Every tool has `--help`.

### Task Management
| Tool | Purpose |
|------|---------|
| `st` | SQUAD Tasks CLI for task management |
| `st-epic-child` | Set epic-child dependency correctly |

### Agent Registry
| Tool | Purpose |
|------|---------|
| `am-register` | Create agent identity |
| `am-agents` | List agents |
| `am-whoami` | Current identity |

### Signals
| Tool | Purpose |
|------|---------|
| `squad-signal` | Emit status signal to IDE |
| `squad-step` | Emit completion step signal |

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
| `squad-secret` | Retrieve secrets |

### Search
| Tool | Purpose |
|------|---------|
| `squad-search` | Unified search across tasks, memory, and files |

Use `squad-search` as your primary context retrieval tool. Search broadly first, then drill into specific sources:

```bash
squad-search "auth middleware"             # Meta search (all sources)
squad-search tasks "OAuth timeout" --json  # Deep task search
squad-search memory "browser automation"   # Memory search (past sessions)
squad-search files "refreshToken"          # File content search
```

### Skills
| Tool | Purpose |
|------|---------|
| `squad-skills` | Browse, install, and manage skills from the catalog |

Skills installed via `squad-skills install` are automatically synced to your agent program. Claude Code gets them as commands in `~/.claude/commands/`, Pi gets them in `~/.pi/agent/skills/`, and other agents receive skill summaries via prompt injection at spawn.

## Commit Messages

Use the task type as prefix:

```bash
git commit -m "task(squad-abc): Add feature X"
git commit -m "bug(squad-abc): Fix race condition"
git commit -m "feat(squad-abc): Implement new endpoint"
```

## Key Behaviors

- **Declare files when starting task** - use `--files` on `st update` to prevent conflicts
- **Use task IDs everywhere** - commits, memory entries
- **Update task status** - `in_progress` when working, `closed` when done
- **Emit signals in order** - starting -> working -> review -> complete
- **Push to remote** - work is NOT complete until `git push` succeeds
