# JAT - Agent Management for AI Coding Assistants

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dashboard](https://img.shields.io/badge/Dashboard-SvelteKit-red)](./dashboard/)
[![Tools](https://img.shields.io/badge/Tools-28+-blue)](#tools)
[![Commands](https://img.shields.io/badge/Commands-5-purple)](#commands)

**Manage 20+ AI agents across all your projects from one dashboard.**

Without JAT, you're managing 1-2 agents in separate terminals. With JAT, you see every agent, every task, every project in one interface. Organize your entire backlog, spawn agents on demand, and watch them coordinate automatically.

<!-- PLACEHOLDER: Demo video coming - see assets/RECORDING-SCRIPT.md -->

---

## Quick Start

```bash
# Install and launch dashboard
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
source ~/.bashrc && jat-dashboard

# Dashboard opens at http://localhost:5174
# Add projects from the UI, spawn agents, watch them work
```

**Want to see it in action first?**
```bash
jat demo                        # Watch 3 agents coordinate on a sample project
```

**First time?** See [GETTING_STARTED.md](./GETTING_STARTED.md) for a complete walkthrough.

---

## What You Get

### Dashboard

Your command center for all agents across all projects.

<!-- PLACEHOLDER: Dashboard screenshot coming - see assets/RECORDING-SCRIPT.md -->

| Route | What It Does |
|-------|--------------|
| `/projects` | **The main view.** All sessions + tasks grouped by project. Spawn agents, see terminal output, click to answer questions, manage tasks. |
| `/agents` | Agent registry, file locks, coordination status |
| `/automation` | Rules for error recovery, prompt responses, stall detection |
| `/config` | Edit slash commands, configure hooks, manage MCP servers |

**Why this matters:**
- **Scale from 1-2 to 20+ agents** - See all of them at once, not in separate terminals
- **Unified task backlog** - Every project's `.beads/` in one view
- **Clickable question UI** - No more typing "1" or "2" in terminals
- **Full configuration UI** - Edit commands, hooks, and actions without touching JSON files
- **Real-time signals** - Know instantly when an agent needs you
- Terminal output with ANSI rendering, token tracking, 32 themes

### Agent Coordination

Run multiple agents without conflicts:

```bash
jat my-project 4                # Launch 4 agents
```

Each agent:
- Gets assigned different tasks (no duplicates)
- Reserves files (no collisions)
- Messages other agents (async coordination)
- Reports status to dashboard (real-time)

### Task Management

Organize all your work across all your projects:

```bash
bd ready                        # Show tasks ready to work
bd create "Add auth" --priority 1
bd dep add auth-ui auth-api     # UI depends on API
```

**The to-do system that scales:**
- Every project has a `.beads/` directory with its task database
- Dashboard aggregates all of them into one unified backlog
- Dependencies prevent agents from starting blocked work
- Priorities ensure critical tasks get picked first
- Tasks sync via git - commit your backlog with your code

### Slash Commands

| Command | What It Does |
|---------|--------------|
| `/jat:start` | Pick a task, reserve files, begin work |
| `/jat:complete` | Verify, commit, close task, end session |
| `/jat:bead` | Convert PRD or conversation to structured tasks |
| `/jat:verify` | Run tests, lint, security checks |
| `/jat:doctor` | Diagnose and repair JAT setup |

### 28+ Bash Tools

No MCP servers. Just bash scripts that work everywhere:

```bash
# Agent coordination
am-inbox Agent1 --unread        # Check messages
am-reserve "src/**" --ttl 3600  # Lock files
am-send "Done with API" --to Agent2

# Database
db-query "SELECT * FROM users LIMIT 5"
db-schema users

# Browser automation
browser-screenshot.js
browser-eval.js 'document.title'
```

---

## The Swarm Model

**One agent = one session = one task.** But you can run as many agents as you want.

```bash
# From dashboard: click "Spawn Agent" on any project
# Or from terminal:
jat my-project 4 --auto         # Launch 4 agents that auto-pick tasks
```

Each agent:
1. Picks the highest priority ready task
2. Works on it
3. Completes and closes the session
4. Dashboard spawns the next agent

**Why this scales to 20+ agents:**
- **File reservations** prevent edit conflicts
- **Dependencies** control task ordering
- **Agent Mail** enables async communication
- **Dashboard** shows all agents across all projects in one view

You're not juggling terminal windows. You're watching a dashboard.

---

## Example: Feature Development

You have a feature broken into tasks:

```
auth-api (P0)     ← Foundation, no dependencies
auth-db (P0)      ← Foundation, no dependencies
auth-ui (P1)      ← Depends on auth-api
auth-tests (P1)   ← Depends on auth-api, auth-db
```

Launch 4 agents:

```bash
jat myapp 4 --auto
```

What happens:
1. **Agent 1** picks `auth-api`, reserves `src/routes/api/**`
2. **Agent 2** picks `auth-db`, reserves `migrations/**`
3. **Agent 3** tries `auth-ui` → blocked (waiting on auth-api)
4. **Agent 3** picks something else or waits
5. **Agent 1** completes → `auth-ui` unblocks → Agent 3 starts it

**Zero coordination overhead.** Dependencies resolve automatically.

---

## CLI Reference

```bash
# Dashboard
jat-dashboard                   # Launch standalone

# Full environment
jat <project>                   # VS Code + Claude + dashboard + dev server
jat <project> 4                 # Launch 4 Claude sessions
jat <project> --auto            # Agents auto-pick tasks

# Project management
jat init                        # Auto-discover ~/code/* projects
jat add <path>                  # Add project
jat list                        # Show projects
jat config                      # Show configuration

# Task management
bd ready                        # Tasks ready to work
bd create "Title" --priority 1  # Create task
bd show <id>                    # View task
bd close <id>                   # Close task
bd dep add <task> <blocker>     # Add dependency
```

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

**Installs:**
- Dashboard (SvelteKit)
- Agent Mail (11 bash tools)
- Beads CLI
- 28+ generic tools
- 5 slash commands
- Global statusline

**Requirements:** Linux/macOS, bash, curl, sqlite3, jq, git, tmux

---

## Project Configuration

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
    "editor": "code"
  }
}
```

---

## Documentation

| Doc | What |
|-----|------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Full walkthrough |
| [COMMANDS.md](./COMMANDS.md) | All slash commands |
| [TOOLS.md](./TOOLS.md) | All 28+ tools |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues |

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

**Why tmux?** It's already installed everywhere, gives us named sessions, and agents don't need to know about the dashboard - they just see a terminal.

**The tmux integration is key:**
- Every agent runs in a tmux session named `jat-{AgentName}`
- Dashboard captures terminal output and signals from tmux
- When you click a button in the dashboard, it sends keystrokes via `tmux send-keys`
- The agent has no idea the dashboard exists - it just sees terminal input

---

## FAQ

**Which AI assistants work with this?**
Any CLI agent with bash access: Claude Code, Aider, Cline, Codex, Continue.dev, etc.

**What if two agents edit the same file?**
File reservations prevent it. Second agent gets `FILE_RESERVATION_CONFLICT` and picks different work.

**Can I use just the tools?**
Yes. All 28+ tools work standalone without the dashboard or coordination layer.

**Do I need to run a server?**
Only the dashboard (SvelteKit dev server). Everything else is bash + SQLite.

---

## Credits

- **Agent Mail:** [@Dicklesworthstone](https://github.com/Dicklesworthstone)
- **Beads:** [@steveyegge](https://github.com/steveyegge)
- **Inspiration:** [Mario Zechner's "What if you don't need MCP?"](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

---

## Related

- [Beads](https://github.com/steveyegge/beads) - Task management CLI
- [Jomarchy](https://github.com/joewinke/jomarchy) - Linux configuration system
- [Sidecar Kit](https://github.com/joewinke/sidecar-kit) - Build your own agent dashboard (the pattern JAT is built on)

---

## License

MIT

---

**Go from 1-2 agents to 20+. Zero conflicts. One dashboard.**

[Install](#installation) | [Docs](./GETTING_STARTED.md) | [Issues](https://github.com/joewinke/jat/issues)
