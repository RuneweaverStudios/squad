# JAT - Joe's Agent Tools

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> **The orchestration layer for the AI coding revolution**

## The Problem

As [Andrej Karpathy put it](https://x.com/karpathy/status/2004607146781278521):

> "I've never felt this much behind as a programmer. The profession is being dramatically refactored... There's a new programmable layer of abstraction to master involving agents, subagents, their prompts, contexts, memory, modes, permissions, tools, plugins, skills, hooks, MCP, LSP, slash commands, workflows, IDE integrations... **some powerful alien tool was handed around except it comes with no manual**."

**You could be 10X more powerful with AI agents. But how do you actually orchestrate them?**

Without proper tooling:
- You manually spawn agents in separate tmux sessions
- You lose track of which agents are working on what
- You can't see when agents get stuck or need input
- You don't know how much they're costing you
- You have no systematic way to handle errors
- You switch between 5 different tools just to check status

**JAT is the manual for the alien tool.**

---

## What is JAT?

JAT is an **Agent Development Environment** - a complete IDE for orchestrating AI coding agents at scale.

Think VS Code, but instead of helping *you* write code, it helps you orchestrate *agents* writing code.

### Core Features

**🎯 Agent Orchestration**
- **Cross-project dashboard**: See all agents across all projects in one UI
- Visual real-time tracking: watch 20+ agents working simultaneously
- One-click Epic Swarm: launch 4+ agents on parallel tasks
- Session state tracking (working, needs-input, review, completed)
- Smart question UI: agents' questions become clickable buttons

**🤖 Intelligent Automation**
- Pattern-based automation rules (regex → actions)
- Auto-proceed thresholds (P0-P3 bugs auto, P4 review)
- Error recovery presets (rate limits, API overload, network errors)
- Template variables with regex capture groups

**📋 Task Management**
- Beads integration: git-backed issue tracking
- Epic workflows with automatic task spawning
- Dependency tracking and visualization
- Review rules matrix (task-type × priority)

**💻 Full IDE Integration**
- `/files` - Monaco code editor with syntax highlighting
- `/work` - Live agent sessions with terminal output
- `/servers` - Dev server management (npm, browser)
- `/agents` - Agent grid with Kanban board view

**📊 Visibility & Control**
- Real-time token usage and cost tracking per agent
- Session timeline and activity feeds
- Signal-based state synchronization
- Keyboard shortcuts and command palette

**🔧 Developer Tools**
- 40+ bash/JavaScript tools (`bd-*`, `am-*`, `browser-*`)
- Agent Mail: identity and coordination system
- Browser automation (Playwright integration)
- Database tools and monitoring

---

## Quick Start

```bash
# Install (one-liner)
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash

# Reload shell
source ~/.bashrc  # or ~/.zshrc on macOS

# Initialize a project
cd ~/code/myproject
bd init

# Start the dashboard
jat-dashboard

# Launch agents (via browser or CLI)
jat myproject 4 --auto  # 4 agents in auto-attack mode
```

**First time?** See [QUICKSTART.md](./QUICKSTART.md) for a 5-minute walkthrough.

---

## The "New Programmable Layer" - JAT's Answer

Karpathy's checklist of things to master:

| Concept | How JAT Handles It |
|---------|-------------------|
| **agents, subagents** | Visual dashboard with real-time session cards |
| **prompts, contexts** | Command templates with variables, CLAUDE.md |
| **memory** | Beads history, session files, signals timeline |
| **modes** | Session states (working/review/completing) |
| **permissions** | Configurable via `~/.config/jat/projects.json` |
| **tools** | 40+ integrated bash/JS tools, extensible |
| **plugins** | Any bash script in `tools/` directory |
| **skills** | Templates + automation rules library |
| **hooks** | Pre/PostToolUse hooks documented in settings |
| **MCP** | Compatible - agents can use MCP servers |
| **LSP** | Monaco editor with language services |
| **slash commands** | Command palette + templates UI |
| **workflows** | Epic Swarm + automation rules + signals |
| **IDE integrations** | **JAT IS the IDE** - `/files`, `/work`, `/servers` |

---

## Architecture

```
JAT Agent IDE
├── Dashboard (SvelteKit)
│   ├── /work      → Agent sessions (live terminals)
│   ├── /files     → Code editor (Monaco)
│   ├── /servers   → Dev server controls
│   ├── /agents    → Agent grid & Kanban
│   ├── /tasks     → Beads task management
│   └── /config    → Automation rules & settings
│
├── Tools (bash/JS)
│   ├── bd-*       → Beads CLI (task operations)
│   ├── am-*       → Agent Mail (coordination)
│   ├── browser-*  → Browser automation
│   └── db-*       → Database tools
│
├── Signals (state sync)
│   ├── jat-signal → Emit state changes
│   └── SSE server → Real-time updates
│
└── Workflows
    ├── /jat:start    → Register agent, pick task
    ├── /jat:complete → Signal completion, sync beads
    └── Epic Swarm    → Parallel task execution
```

---

## Philosophy: Human-Defined Rules, Agent Execution

JAT follows a **declarative orchestration** model:

**You don't code the orchestration - you configure it:**

```typescript
// Automation Rule Example
{
  name: "Auto-retry on rate limit",
  patterns: [{ mode: "regex", value: "rate limit|429|too many requests" }],
  actions: [
    { type: "send_keys", value: "C-c", delayMs: 1000 },
    { type: "send_text", value: "y" }
  ],
  cooldownSeconds: 60
}
```

**You define thresholds, not workflows:**

```bash
# P0-P2 bugs auto-proceed, P3-P4 require review
bd-review-rules --type bug --max-auto 2
```

**You see everything, control everything:**

The dashboard shows all agents, their states, their costs, their outputs. When you need to intervene, you can - but most of the time, your rules handle it.

---

## Why JAT vs Manual Orchestration?

**Without JAT:**
```bash
# Terminal 1
tmux new -s agent1 && claude

# Terminal 2
tmux new -s agent2 && claude

# Terminal 3
tmux attach -t agent1  # Read scrollback manually
# Is it stuck? How much has it cost? ¯\_(ツ)_/¯

# Terminal 4
npm run dev  # Separate terminal for server

# Terminal 5
code .  # VS Code for editing

# Your browser
# http://localhost:3000  # Check if it works
```

**With JAT:**
```bash
jat-dashboard  # One command

# Browser shows:
# - 4 agents working (live terminals)
# - All tasks with status and priorities
# - Token usage: $2.47 today
# - Server: running on port 3000
# - File editor built-in
```

**One UI. Full visibility. Complete control.**

---

## Use Cases

**Solo Developer:**
- Launch 4 agents on your backlog
- Let them work overnight
- Wake up to completed tasks + review queue

**Team Lead:**
- Epic Swarm: 20 subtasks → 8 agents → 2 hours
- Dashboard tracks progress in real-time
- Auto-proceed on low-priority items

**Cross-Project Feature:**
- One feature touches API, UI, and docs
- Launch 3 agents (one per project)
- Watch them work simultaneously in one dashboard
- No switching terminals, no juggling windows

**Consultant:**
- Browser automation for client sites
- Database tools for migrations
- Multi-client orchestration from single dashboard

---

## Example: Epic Swarm Workflow

Create an epic with subtasks:

```bash
bd create "User Authentication System" --type epic
# Add checkboxes in description:
# - [ ] Design auth flow
# - [ ] Add login endpoint
# - [ ] Add registration endpoint
# - [ ] Add password reset
# - [ ] Write tests
# - [ ] Update documentation
```

Launch the swarm from dashboard:
1. Click epic → "Launch Epic Swarm"
2. Configure: 4 agents, parallel mode, review P0-P1 only
3. Watch agents spawn and work simultaneously
4. Progress bar shows completion in real-time
5. Low-priority tasks auto-complete, high-priority ones wait for review

**Zero manual coordination. Just results.**

---

## Slash Commands

| Command | What It Does |
|---------|--------------|
| `/jat:start` | Pick a task, reserve files, begin work |
| `/jat:complete` | Verify, commit, close task, end session |
| `/jat:bead` | Convert PRD or conversation to structured tasks |
| `/jat:verify` | Run tests, lint, security checks |
| `/jat:doctor` | Diagnose and repair JAT setup |

---

## Tools Reference

**40+ bash/JavaScript tools included:**

```bash
# Agent coordination
am-inbox Agent1 --unread        # Check messages
am-reserve "src/**" --ttl 3600  # Lock files
am-send "Done with API" --to Agent2

# Task management
bd ready                        # Tasks ready to work
bd create "Title" --priority 1  # Create task
bd dep add task-a task-b        # Add dependency

# Database
db-query "SELECT * FROM users LIMIT 5"
db-schema users

# Browser automation
browser-screenshot.js
browser-eval.js 'document.title'
```

See [shared/tools.md](./shared/tools.md) for complete reference.

---

## Installation

### Prerequisites

```bash
# Linux (Arch/Manjaro)
sudo pacman -S tmux sqlite jq nodejs npm

# Linux (Debian/Ubuntu)
sudo apt install tmux sqlite3 jq nodejs npm

# macOS
brew install tmux sqlite jq node
```

### Install JAT

```bash
# One-line installer (works on Linux and macOS)
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

**This installs:**
- Dashboard (SvelteKit)
- Agent Mail (11 bash tools)
- Beads CLI integration
- 40+ tools (`bd-*`, `am-*`, `browser-*`, `db-*`)
- Slash commands (`/jat:start`, `/jat:complete`, etc.)
- Global statusline

**Reload your shell:**
```bash
source ~/.bashrc  # or ~/.zshrc on macOS
```

See [INSTALL.md](./INSTALL.md) for troubleshooting.

---

## Configuration

`~/.config/jat/projects.json`:

```json
{
  "projects": {
    "myapp": {
      "name": "My App",
      "path": "~/code/myapp",
      "port": 3000,
      "active_color": "rgb(00d4aa)"
    }
  },
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "max_concurrent_agents": 8,
    "auto_proceed_delay": 2
  }
}
```

**Auto-discovered projects:**
```bash
jat init  # Scans ~/code/* for git repos with .beads/
```

---

## Documentation

| Doc | What |
|-----|------|
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute tutorial |
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Complete walkthrough |
| [CLAUDE.md](./CLAUDE.md) | Developer reference |
| [shared/signals.md](./shared/signals.md) | Signal system |
| [shared/automation.md](./shared/automation.md) | Automation rules |
| [shared/tools.md](./shared/tools.md) | All 40+ tools |
| [COMMANDS.md](./COMMANDS.md) | Slash commands |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guide |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        DASHBOARD                             │
│            Real-time monitoring + task management            │
└────────────────┬────────────────────────────┬───────────────┘
                 │ SSE (signals)              │ send-keys
                 ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│                         TMUX                                 │
│                                                              │
│   Each agent runs in a named tmux session (jat-AgentName)    │
│   Dashboard reads output, sends input via tmux send-keys     │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    COORDINATION LAYER                        │
│                                                              │
│   /jat:start  ──→  work  ──→  /jat:complete                  │
│                                                              │
│   ┌─────────────┐              ┌─────────────┐               │
│   │ Agent Mail  │              │   Beads     │               │
│   │ • Messaging │              │ • Tasks     │               │
│   │ • File locks│              │ • Deps      │               │
│   └─────────────┘              └─────────────┘               │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     AI CODING AGENTS                         │
│          (Claude Code, Aider, Cline, Codex, etc.)            │
└──────────────────────────────────────────────────────────────┘
```

**Why tmux?**
- Already installed everywhere
- Named sessions (easy to target)
- Agents don't need to know about the dashboard
- Dashboard sends input via `tmux send-keys`

---

## FAQ

**Which AI assistants work with this?**
Any CLI agent with bash access: Claude Code, Aider, Cline, Codex, Continue.dev, etc.

**What if two agents edit the same file?**
File reservations prevent it. Second agent gets `FILE_RESERVATION_CONFLICT` and picks different work.

**Can I use just the tools without the dashboard?**
Yes. All 40+ tools work standalone as bash scripts.

**Do I need to run a server?**
Only the dashboard (SvelteKit dev server). Everything else is bash + SQLite.

**How much does it cost to run agents?**
Dashboard shows real-time token usage per agent. Typical: 100K-1M tokens/day ≈ $0.30-$3/day.

**Can agents work on multiple projects?**
Yes. Dashboard shows all projects. Agents coordinate via Agent Mail across projects.

---

## Credits

- **Agent Mail:** [@Dicklesworthstone](https://github.com/Dicklesworthstone)
- **Beads:** [@steveyegge](https://github.com/steveyegge)
- **Inspiration:** [Mario Zechner's "What if you don't need MCP?"](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)
- **Problem framing:** [@karpathy](https://x.com/karpathy/status/2004607146781278521)

---

## Related Projects

- [Beads](https://github.com/steveyegge/beads) - Git-backed task management
- [Gas Town](https://github.com/steveyegge/gastown) - Multi-agent workspace manager (CLI-based alternative)
- [Jomarchy](https://github.com/joewinke/jomarchy) - Linux configuration system
- [Sidecar Kit](https://github.com/joewinke/sidecar-kit) - Build your own agent dashboard

---

## License

MIT License - see [LICENSE](LICENSE)

---

## The Bottom Line

Karpathy said:
> "I could be 10X more powerful if I just properly string together what has become available"

**JAT is the string.**

You don't need to figure out how to hold the alien tool. JAT gives you:
- The orchestration layer
- The visibility you need
- The control you want
- The manual that didn't exist

**Claim the 10X boost. Get JAT.**

[Install](#installation) | [Quickstart](./QUICKSTART.md) | [Docs](./GETTING_STARTED.md) | [Issues](https://github.com/joewinke/jat/issues)
