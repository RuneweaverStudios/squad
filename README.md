```
╔───────────────────────────────────────────╗
│                                           │
│           __       ___   .___________.    │
│          |  |     /   \  |           |    │
│          |  |    /  ^  \ `---|  |----`    │
│    .--.  |  |   /  /_\  \    |  |         │
│    |  `--'  |  /  _____  \   |  |         │
│     \______/  /__/     \__\  |__|         │
│                                           │
│         ◇ Supervise the Swarm ◇           │
│                                           │
╚───────────────────────────────────────────╝
```

# JAT — The World's First Agentic IDE

**Agents ship, suggest, repeat. You supervise.**

JAT is the complete, self-contained environment for agentic development. Task management, agent orchestration, code editor, git integration, terminal access—all unified in a single dashboard. No plugins to install, no services to configure, no pieces to assemble. Just describe what you want and supervise the swarm.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Agents](https://img.shields.io/badge/Agents-20+-green)
![Tools](https://img.shields.io/badge/Tools-50+-blue)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/AFJf93p7Bx)

<!-- TODO: Add screenshot -->
![JAT Dashboard](./assets/dashboard-screenshot.png)
*The JAT dashboard: agent sessions, task management, and code editor unified*

---

## The Paradigm Shift

```
Traditional IDE:     You write code, tools assist
Copilot IDE:         You write code, AI suggests completions
Agentic IDE:         Agents write code, you supervise and approve
```

JAT is purpose-built for the third paradigm. Manage 20+ agents simultaneously while you review, guide, and approve.

---

## Quick Start

```bash
# Install (one command)
curl -sSL https://raw.githubusercontent.com/joewinke/jat/master/tools/scripts/bootstrap.sh | bash

# Restart shell
source ~/.bashrc

# Launch
jat
```

Open http://localhost:3333 → Add a project → Create a task → Spawn an agent → Supervise

**Alternative (developers):**
```bash
git clone https://github.com/joewinke/jat.git ~/code/jat
cd ~/code/jat && ./install.sh
```

---

## Complete IDE Features

### Keyboard Shortcuts

| Shortcut | Feature |
|----------|---------|
| `Cmd+K` | **Global Search** — files, tasks, agents |
| `Cmd+Shift+T` | **Terminal** — integrated with agent sessions |
| `Ctrl+S` | **Save** — save current file |
| `Alt+N` | **New Task** — create from anywhere |
| `Alt+E` | **Epic Swarm** — launch parallel agents |

### Code Editor (`/files`)

Full Monaco editor (VS Code's engine):

```
┌─────────────────────────────────────────────────────────────┐
│  📁 Files  │  🔀 Git                                        │
├─────────────────────────────────────────────────────────────┤
│  ▼ src/    │  ┌─────┬─────┬─────┐                          │
│    lib/    │  │ a.ts│ b.ts│ c.ts│  ← Drag-drop tabs        │
│    routes/ │  └─────┴─────┴─────┘                          │
│  ▼ tests/  │  ┌──────────────────────────────────────────┐ │
│            │  │  Monaco Editor                           │ │
│            │  │  • 25+ languages                         │ │
│            │  │  • Syntax highlighting                   │ │
│            │  │  • Multi-cursor editing                  │ │
│            │  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- Lazy-loading file tree with right-click context menu
- Multi-file tabs with persistent order
- Keyboard navigation (F2 rename, Delete remove)
- File type icons

### Git Source Control (`/files` → Git tab)

Full git integration:

```
┌─────────────────────────────────────────────────────────────┐
│  ⎇ main  ↑2 ↓0                                   [⟳ Fetch] │
├─────────────────────────────────────────────────────────────┤
│  ▼ STAGED CHANGES (3)                              [− All] │
│    M  src/lib/api.ts                                       │
│    A  src/lib/auth.ts                                      │
├─────────────────────────────────────────────────────────────┤
│  [ Commit message...                         ] [✓ Commit]  │
├─────────────────────────────────────────────────────────────┤
│  ▼ CHANGES (2)                                     [+ All] │
│    M  src/routes/+page.svelte                    [+] [↻]   │
├─────────────────────────────────────────────────────────────┤
│  [↑ Push]  [↓ Pull]                                        │
├─────────────────────────────────────────────────────────────┤
│  ▼ TIMELINE                                                │
│    ● abc123  2h ago   Add authentication                   │
│    ○ def456  1d ago   Fix login bug                        │
└─────────────────────────────────────────────────────────────┘
```

- Stage/unstage individual files or all
- Commit with `Ctrl+Enter`
- Push/Pull with ahead/behind indicators
- Branch switcher with search
- Diff preview drawer (click any file)
- Commit timeline with details

### Agent Sessions (`/work`)

Live terminal output for all running agents:

- Real-time streaming output
- Smart question UI (agent questions → clickable buttons)
- State badges: Working, Needs Input, Review, Completed
- Send input directly to agents
- Token usage and cost tracking

### Task Management

Beads-powered git-backed issue tracking (on `/work` and `/kanban`):

- Create tasks with priorities (P0-P4)
- Epic workflows with subtask spawning
- Dependency visualization
- Bulk actions (select multiple, add to epic)
- Kanban board view at `/kanban`

---

## The Agentic Flywheel

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   1. PLAN WITH AI        Describe your feature, get PRD     │
│         ↓                                                    │
│   2. /JAT:BEAD           Convert PRD → structured tasks     │
│         ↓                                                    │
│   3. EPIC SWARM          Spawn agents on subtasks           │
│         ↓                                                    │
│   4. PARALLEL WORK       Watch agents code simultaneously   │
│         ↓                                                    │
│   5. SMART QUESTIONS     "OAuth or JWT?" → click button     │
│         ↓                                                    │
│   6. REVIEW IN /files    See diffs, check code              │
│         ↓                                                    │
│   7. COMMIT & PUSH       Stage, message, push               │
│         ↓                                                    │
│   8. AUTO-PROCEED        Low-priority tasks complete auto   │
│         ↓                                                    │
│   9. SUGGESTED TASKS     Agent proposes next work           │
│         ↓                                                    │
│        ╰──────────────── Auto-accept → back to 3 ───────────╯
│                                                              │
│            ∞  Perpetual motion. Ship continuously.  ∞       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Routes

| Route | Purpose |
|-------|---------|
| `/work` | Agent sessions, task management, epics, questions, state tracking |
| `/files` | Monaco editor, file tree, full git integration |
| `/kanban` | Kanban board view for tasks |
| `/servers` | Dev server controls (npm start/stop) |
| `/config` | Automation rules, templates, shortcuts |
| `/automation` | Pattern matching, error recovery, auto-proceed |

---

## What Makes JAT Different

| Feature | Description |
|---------|-------------|
| **Multi-agent management** | Run 20+ agents simultaneously across your codebase |
| **Task → Agent → Review** | One-click workflow from task to completion |
| **Smart question UI** | Agent questions become clickable buttons |
| **Epic Swarm** | Spawn parallel agents on subtasks |
| **Auto-proceed rules** | Configure auto-completion by type/priority |
| **Error recovery** | Automatic retry patterns for failures |
| **PRD → Tasks** | `/jat:bead` converts requirements to structured tasks |

Full Monaco editor and git integration included—but the magic is in agent orchestration.

---

## JAT vs Other AI Coding Tools

| Feature | JAT | Cursor | Windsurf | Cline/Aider |
|---------|-----|--------|----------|-------------|
| **Multi-agent (20+)** | ✅ | ❌ | ❌ | ❌ |
| **Visual dashboard** | ✅ | ❌ | ❌ | ❌ |
| **Task management** | ✅ Built-in | ❌ | ❌ | ❌ |
| **Epic Swarm (parallel)** | ✅ | ❌ | ❌ | ❌ |
| **Agent coordination** | ✅ Agent Mail | ❌ | ❌ | ❌ |
| **Auto-proceed rules** | ✅ | ❌ | ❌ | ❌ |
| **Code editor** | ✅ Monaco | ✅ VS Code | ✅ VS Code | ❌ |
| **Git integration** | ✅ | ✅ | ✅ | Partial |
| **100% local** | ✅ | ❌ Cloud | ❌ Cloud | ✅ |
| **Open source** | ✅ MIT | ❌ | ❌ | ✅ |

JAT isn't trying to replace your editor—it's the control tower for your agent swarm.

---

## Architecture

```
~/code/jat/
├── dashboard/          # SvelteKit app (the IDE)
│   └── src/
│       ├── routes/     # /work, /files, /kanban, /servers
│       └── lib/
│           ├── components/files/   # FileTree, GitPanel, Editor
│           ├── components/work/    # SessionCard, WorkPanel
│           └── stores/             # State management
├── tools/              # 50+ CLI tools
│   ├── core/           # Database, monitoring
│   ├── mail/           # Agent coordination (am-*)
│   ├── browser/        # Browser automation
│   └── signal/         # State sync
├── commands/           # /jat:start, /jat:complete, /jat:bead
└── shared/             # Agent documentation
```

---

## Requirements

- **Node.js** 20+
- **tmux** (agent sessions)
- **Claude Code** or similar AI assistant
- **sqlite3**, **jq** (auto-installed)

---

## Configuration

`~/.config/jat/projects.json`:

```json
{
  "projects": {
    "myapp": {
      "path": "~/code/myapp",
      "port": 3000
    }
  },
  "defaults": {
    "max_sessions": 12,
    "model": "opus"
  }
}
```

Dashboard settings at `/config`:
- Max concurrent sessions
- Default Claude model
- Spawn stagger timing
- Automation rules
- Keyboard shortcuts

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute tutorial |
| [CLAUDE.md](./CLAUDE.md) | Full technical reference |
| [dashboard/CLAUDE.md](./dashboard/CLAUDE.md) | Dashboard dev guide |
| [shared/](./shared/) | Agent documentation |

---

## FAQ

**Which AI assistants work?**
Any terminal-based AI: Claude Code, Aider, Cline, Codex, etc.

**How many agents can I run?**
Tested with 20+. Limited by your machine and API limits, not JAT.

**Can I use existing projects?**
Yes. Run `bd init` in any git repo. JAT auto-discovers `~/code/*`.

**Is there a hosted version?**
No. JAT runs 100% locally. Code never leaves your machine.

---

## Community

- **Discord** — [Join the JAT community](https://discord.gg/AFJf93p7Bx) for help, discussion, and sharing what you've built
- **Issues** — [Report bugs or request features](https://github.com/joewinke/jat/issues)
- **Discussions** — [GitHub Discussions](https://github.com/joewinke/jat/discussions) for questions and ideas

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Quick start for contributors:**
```bash
git clone https://github.com/joewinke/jat.git ~/code/jat
cd ~/code/jat/dashboard
npm install && npm run dev
```

Open a PR against `master`. All contributions are licensed under MIT.

---

## Credits

- **[@joewinke](https://github.com/joewinke)** — Creator
- **Agent Mail** — Agent Comms [Dicklesworthstone/mcp_agent_mail](https://github.com/Dicklesworthstone/mcp_agent_mail)
- **Beads** — Task management ([steveyegge/beads](https://github.com/steveyegge/beads))
- **Mario Zechner** — [What if you don't need MCP?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)
- **Andrej Karpathy** - [Some Powerful Alien Tool](https://x.com/karpathy/status/2004607146781278521?s=20)
- **DHH** - [Inspiration](https://dhh.dk/)
- **Tmux** - Terminal Multiplexer by ([Nicholas Marriott](https://github.com/tmux/tmux))
- **Monaco** — Code editor engine ([Microsoft](https://github.com/microsoft/monaco-editor))
- **SvelteKit** — Dashboard framework ([Rich Harris](https://github.com/Rich-Harris))
- **Tailwind CSS** — Utility-first CSS ([Adam Wathan](https://github.com/adamwathan))
- **DaisyUI** — Component library ([Pouya Saadeghi](https://github.com/saadeghi))
- **Git** — Version control ([Linus Torvalds](https://github.com/torvalds))
- **simple-git** — Node.js Git wrapper ([Steve King](https://github.com/steveukx))
- **D3.js** — Data visualization ([Mike Bostock](https://github.com/mbostock))
- **Vite** — Build tool ([Evan You](https://github.com/yyx990803))
- **SQLite** — Embedded database ([D. Richard Hipp](https://www.sqlite.org/crew.html))
- **TypeScript** — Type safety ([Anders Hejlsberg](https://github.com/ahejlsberg), Microsoft)
- **Claude** — Wrote a lot of the code ([Anthropic](https://anthropic.com))

---

## License

MIT

---

**JAT: Supervise the swarm. Ship continuously.**

[Install](#quick-start) | [Docs](./QUICKSTART.md) | [Discord](https://discord.gg/AFJf93p7Bx) | [Issues](https://github.com/joewinke/jat/issues)
