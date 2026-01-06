# JAT - The Agentic IDE

**The complete development environment for AI-assisted coding.**

Stop switching between VS Code, terminal, browser, and task tracker. JAT gives you everything you need to supervise AI coding agents from one dashboard.

![Dashboard](https://img.shields.io/badge/Dashboard-SvelteKit-orange)
![Agents](https://img.shields.io/badge/Agents-20+-green)
![Tools](https://img.shields.io/badge/Tools-40+-blue)

## The Shift

Traditional development: **You write code.**

Agentic development: **You supervise. Agents code.**

JAT is built for this new workflow. Instead of an IDE that helps you type faster, it's an IDE that helps you manage agents better.

## What's Inside

| Route | Purpose |
|-------|---------|
| `/tasks` | Convert PRDs into your backlog. Create tasks, set priorities, manage epics. |
| `/work` | Live agent sessions. Watch them code, answer questions, review output. |
| `/files` | Code editor + Git. Review changes, make edits, commit and push. |
| `/servers` | Dev servers. Start/stop npm, manage browser sessions. |
| `/config` | Settings. Automation rules, review thresholds, templates. |

Everything you need. Nothing you don't.

## Quick Start

```bash
# Install
git clone https://github.com/joemcgee/jat.git ~/code/jat
cd ~/code/jat && ./install.sh
source ~/.bashrc

# Launch
jat

# Open http://localhost:5174
# Add a project, create a task, spawn an agent
```

## The Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   1. CREATE TASK         "Add user authentication"               │
│         ↓                                                        │
│   2. SPAWN AGENT         Dashboard launches Claude Code          │
│         ↓                                                        │
│   3. MONITOR             Watch progress in /work                 │
│         ↓                                                        │
│   4. ANSWER QUESTIONS    "Which OAuth provider?" → click button  │
│         ↓                                                        │
│   5. REVIEW CODE         Agent signals ready → check /files      │
│         ↓                                                        │
│   6. APPROVE & COMMIT    One click to complete                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Features

### Agent Management
- **Spawn agents** on any task with one click
- **Epic Swarm** - launch 4+ agents on parallel subtasks
- **Live sessions** - terminal output streams to dashboard
- **Smart questions** - agent questions become clickable buttons
- **State tracking** - working, needs-input, review, completed

### Code & Git
- **Monaco editor** - syntax highlighting, multi-file tabs
- **Git integration** - stage, commit, push without leaving dashboard
- **File tree** - lazy-loading, context menus, keyboard navigation
- **Review diffs** - see exactly what agents changed

### Task Management
- **Beads** - lightweight, git-backed issue tracking
- **Dependencies** - tasks block other tasks automatically
- **Epics** - group related tasks, track completion
- **Priorities** - P0-P4 with visual indicators

### Automation
- **Auto-proceed rules** - low-priority tasks complete without review
- **Error recovery** - auto-retry on rate limits, network errors
- **Pattern matching** - regex triggers custom actions
- **Templates** - reusable prompts with variables

### Dev Servers
- **npm management** - start/stop/restart from dashboard
- **Browser sessions** - Playwright integration for testing
- **Status monitoring** - see what's running across projects

## Architecture

```
~/code/jat/
├── dashboard/          # SvelteKit app (the IDE)
├── tools/              # 40+ CLI tools
│   ├── core/           # Database, monitoring
│   ├── mail/           # Agent coordination (am-*)
│   ├── browser/        # Browser automation
│   └── signal/         # State synchronization
├── commands/           # Slash commands (/jat:start, /jat:complete)
└── shared/             # Documentation for agents
```

## Requirements

- **Node.js** 20+
- **tmux** (agent sessions run here)
- **Claude Code** or similar AI coding assistant
- **sqlite3**, **jq** (installed by install.sh)

## Configuration

Settings live in `~/.config/jat/`:

```
projects.json     # Your projects and defaults
review-rules.json # Auto-proceed thresholds by type/priority
```

Dashboard settings at `/config`:
- Max concurrent sessions
- Default Claude model
- Spawn stagger timing
- Automation rules

## For VS Code Users

You don't have to give up VS Code. JAT works alongside it:

- Use VS Code for deep debugging, refactoring
- Use JAT for agent supervision, task management
- Files sync via git - edit anywhere

But many users find they **stop opening VS Code** once they're comfortable with JAT. The Monaco editor handles 90% of review/edit needs.

## Documentation

| Doc | Purpose |
|-----|---------|
| [CLAUDE.md](./CLAUDE.md) | Full technical reference |
| [dashboard/CLAUDE.md](./dashboard/CLAUDE.md) | Dashboard development guide |
| [shared/](./shared/) | Agent-facing documentation |

## FAQ

**Q: Is this just for Claude Code?**

A: JAT is optimized for Claude Code but works with any terminal-based AI assistant. The key is tmux session management and the signal protocol.

**Q: Can I use this with my existing projects?**

A: Yes. Run `bd init` in any git repo to add Beads task tracking. JAT discovers projects automatically.

**Q: How many agents can I run?**

A: Tested with 20+ concurrent agents. Limited by your machine and API rate limits, not JAT.

**Q: Is there a hosted version?**

A: No. JAT runs locally on your machine. Your code never leaves your computer.

## Credits

- **Beads** - Task management engine ([steveyegge/beads](https://github.com/steveyegge/beads))
- **Monaco** - Code editor (VS Code's editor)
- **SvelteKit** - Dashboard framework
- **DaisyUI** - UI components

## License

MIT

---

**JAT: Stop managing terminals. Start managing agents.**
