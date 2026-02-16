# Jomarchy Agent Tools

Lightweight bash tools for agent orchestration, database operations, monitoring, development, and browser automation.

@~/code/jat/AGENTS.md
@~/code/jat/shared/agent-registry.md
@~/code/jat/shared/bash-patterns.md
@~/code/jat/shared/tasks.md
@~/code/jat/shared/tools.md
@~/code/jat/shared/agent-app-interface.md
@~/code/jat/shared/automation.md
@~/code/jat/shared/architecture.md
@~/code/jat/shared/agent-programs.md
@~/code/jat/shared/scheduler.md

<!-- NOTE: AGENTS.md is the canonical agent workflow instructions (replaces
     shared/overview.md for this repo). Other projects still import
     shared/overview.md via their own CLAUDE.md.
     Detailed workflow steps are in command files (/jat:start.md,
     /jat:complete.md) which load on-demand when agents invoke those commands. -->


## Project Structure

```
jat/
├── tools/               # All executable tools
│   ├── core/            # Database, monitoring, task review tools
│   ├── mail/            # Agent Registry (identity, file locks, messaging)
│   ├── browser/         # Browser automation (11 tools)
│   ├── media/           # Image generation tools (gemini-*, avatar-*)
│   ├── signal/          # JAT signal tools (jat-signal, jat-signal-validate)
│   ├── ingest/          # Feed ingest daemon (RSS, Slack, Telegram)
│   ├── scheduler/       # Task scheduling daemon (cron + one-shot)
│   └── scripts/         # Installation and setup scripts
├── skills/              # Pi agent skills (SKILL.md format)
│   ├── jat-start/       # Begin working on a task
│   ├── jat-complete/    # Complete current task
│   └── jat-verify/      # Browser verification
├── commands/jat/        # JAT workflow commands (9 commands)
├── ide/                 # JAT IDE (SvelteKit app)
├── shared/              # Shared documentation (imported by projects)
└── install.sh           # Installation script
```

## Prerequisites

**Required** (installer will check for these):
- `tmux` - Terminal multiplexer (sessions, IDE tracking)
- `sqlite3` - Database for Agent Registry
- `jq` - JSON processing

**Optional but recommended:**
- `npm` / `node` - For browser-tools and IDE
- `gum` - Interactive prompts during install

```bash
# Arch/Manjaro
sudo pacman -S tmux sqlite jq

# Debian/Ubuntu
sudo apt install tmux sqlite3 jq

# Fedora
sudo dnf install tmux sqlite jq

# macOS
brew install tmux sqlite jq
```

## Quick Start

```bash
# Install tools (symlinks to ~/.local/bin/)
./install.sh

# Verify installation
am-whoami
jt --version
browser-start.js --help
```

## Keeping JAT Updated

JAT includes a self-update mechanism similar to VS Code - it checks for updates and prompts you before installing.

### Update Behavior

When you launch the IDE with `jat` (no arguments), it checks for updates (at most once per 24 hours). If updates are available, you'll be prompted:

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

Checking for updates...

JAT update available (3 new commit(s)). Update now? [y/N] y
Updating JAT...
✓ Updated successfully
```

- **Prompt-based** - You're always asked before updates install
- **IDE only** - Other commands like `jat list` don't check
- **Throttled** - Checks at most once per 24 hours

### Manual Update Commands

```bash
# Pull latest updates
jat update

# Check for updates without installing
jat update --check

# Show installation path and version
jat update --status

# Disable update checks on IDE launch
jat update --disable

# Re-enable update checks
jat update --enable
```

### How Updates Work

1. JAT detects its installation location (in order of priority):
   - `$JAT_INSTALL_DIR` environment variable
   - `~/.local/share/jat` (XDG standard, recommended for users)
   - `~/code/jat` (for developers)
2. `jat update` runs `git pull origin master` to fetch latest changes
3. If you have local changes, they're stashed and restored after the update
4. Symlinks in `~/.local/bin/` are automatically refreshed

### Configuration

Add to `~/.config/jat/projects.json` to disable update checks:

```json
{
  "defaults": {
    "auto_update": false
  }
}
```

## Verifying Installation

After installation, verify each component is working correctly:

### Core Prerequisites
```bash
# Check required tools are available
tmux -V          # Expected: tmux 3.x
sqlite3 --version   # Expected: 3.x.x
jq --version     # Expected: jq-1.x

# Check optional tools
npm --version    # Expected: 10.x (optional but recommended)
node --version   # Expected: v20+ (optional but recommended)
```

### Agent Registry (14 tools)
```bash
# Identity and registration
am-whoami                    # Shows: "Not registered" or agent name
am-agents                    # Lists all registered agents
am-register --help           # Shows registration options

# Test database exists
ls ~/.agent-mail.db          # Should exist after install

# Full registration test (creates test agent, then removes)
am-register --name TestAgent --program test --model test && \
  am-agents | grep TestAgent && \
  am-delete-agent TestAgent
# Expected: "Registered agent TestAgent", then shows in list, then removed
```

### Task CLI
```bash
# Version and help
jt --version                 # Expected: jt 0.x.x
jt --help                    # Shows available commands

# Test commands (safe to run - only reads)
jt ready --json              # Lists ready tasks (may be empty)
jt list --status open        # Lists open tasks

# If no project initialized yet:
cd ~/code/my-project && jt init  # Initialize a project
```

Current task types in JAT workflows: `bug`, `feature`, `task`, `epic`, `chore`, `chat` (`chat` is used for conversational external-channel threads, typically with `/jat:chat`).

### Browser Tools (12 tools)
```bash
# Check tool availability
browser-start.js --help      # Shows CDP connection options
browser-nav.js --help        # Shows navigation options
browser-eval.js --help       # Shows JS eval options

# Test browser automation (requires Chrome/Chromium)
# Start browser with remote debugging:
#   google-chrome --remote-debugging-port=9222
# Then:
browser-start.js             # Expected: "Connected to Chrome..."
browser-nav.js https://example.com  # Navigates browser
browser-screenshot.js --output /tmp/test.png  # Captures screenshot
```

### Database Tools (4 tools)
```bash
# Schema inspection
db-schema                    # Shows Agent Registry database schema

# Safe query test
db-query "SELECT COUNT(*) as agent_count FROM agents"
# Expected: [{"agent_count": N}]
```

### Signal Tools (2 tools)
```bash
# Help and validation
jat-signal --help            # Shows signal types and options
jat-signal-validate --help   # Shows validation options

# Test signal emission (dry run style)
jat-signal starting '{"agentName":"Test","sessionId":"test-123","project":"test","model":"test","gitBranch":"main","gitStatus":"clean","tools":[],"uncommittedFiles":[]}'
# Expected: Writes to /tmp/jat-signal-*.json
```

### Statusline and Hooks
```bash
# Check hooks are installed
ls ~/.claude/hooks/          # Should show hook scripts
ls ~/.claude/settings.json   # Should exist

# Check statusline script
ls ~/.claude/statusline.sh   # Should exist
~/.claude/statusline.sh      # Test run (may show errors if not in tmux)
```

### IDE
```bash
# Check IDE can start
cd ~/code/jat/ide
npm run build                # Should compile without errors

# Start dev server (Ctrl+C to stop)
npm run dev                  # Expected: http://127.0.0.1:5174
```

### All Tools Summary Check
```bash
# Quick verification of all symlinks
ls ~/.local/bin/am-* | wc -l   # Expected: 13 (Agent Registry)
ls ~/.local/bin/jt* | wc -l    # Expected: 5 (Task CLI + review tools)
ls ~/.local/bin/browser-* | wc -l  # Expected: 11 (Browser tools)
ls ~/.local/bin/db-* | wc -l   # Expected: 4 (Database tools)
ls ~/.local/bin/jat-* | wc -l  # Expected: 5 (JAT tools)

# Check for broken symlinks
find ~/.local/bin -type l -name "am-*" -exec test ! -e {} \; -print
find ~/.local/bin -type l -name "jt*" -exec test ! -e {} \; -print
find ~/.local/bin -type l -name "browser-*" -exec test ! -e {} \; -print
# Expected: No output (no broken symlinks)
```

### Troubleshooting Verification Failures

| Issue | Cause | Fix |
|-------|-------|-----|
| `command not found` | ~/.local/bin not in PATH | Add to ~/.bashrc: `export PATH="$HOME/.local/bin:$PATH"` |
| `am-whoami` fails | Database not initialized | Run: `bash ~/code/jat/tools/scripts/install-agent-mail.sh` |
| `jt: command not found` | Task CLI not installed | Run: `./install.sh` to create symlinks |
| `browser-*.js` fails | npm dependencies missing | Run: `cd ~/code/jat/tools/browser && npm install` |
| IDE won't start | Dependencies missing | Run: `cd ~/code/jat/ide && npm install` |
| Broken symlinks | Old installation | Run: `./install.sh` to refresh symlinks |

### Post-Installation: Add a Project

**You must add at least one project before using the IDE or agents.**

A valid project is:
- A **git repository** in `~/code/`
- Has a **`.jat/` directory** (created by `jt init`)

```bash
# Option 1: Initialize an existing project (recommended)
cd ~/code/my-project
jt init
# Creates .jat/ directory with task database

# Option 2: From the IDE
jat        # Start the IDE
# Go to Tasks page → click "Add Project"
```

After adding a project, you can start working:

```bash
# Start working (registers agent + picks task)
/jat:start

# Auto-attack mode (pick highest priority task immediately)
/jat:start auto
```

## IDE AI Features

The IDE uses AI for task suggestions, usage metrics, and avatar generation. These features work automatically if you have **any** of the following:

1. **Claude Code CLI installed** (recommended) - The IDE falls back to your Claude subscription via `claude -p`. No API key needed.
2. **Anthropic API key** - Configure via Settings → API Keys tab, or add to `~/code/jat/ide/.env`.

**How the fallback works:**
The LLM service tries the API key first, then falls back to the Claude CLI subprocess. If you have a Claude Pro/Max subscription and `claude` is installed, AI features work out of the box with zero configuration.

**Features powered by LLM:**
- **Task Suggestions** - AI auto-suggests priority, type, labels when creating tasks
- **Usage Metrics** - Real-time token usage and rate limit tracking
- **Avatar Generation** - AI-generated agent avatars

**Agent Authentication:**
Most supported coding agents use subscription-based auth (no API keys required):

| Agent | Auth Method | Setup Command |
|-------|-------------|---------------|
| Claude Code | Claude Pro/Max subscription | `claude auth` |
| Codex CLI | ChatGPT Plus/Pro subscription | `codex login` |
| OpenCode | OAuth (Anthropic/OpenAI/Copilot) | `opencode auth login` |
| Pi | OAuth (Claude/ChatGPT/Copilot/Gemini) | `/login` inside Pi |
| Gemini CLI | Google Account (free tier included) | First run triggers OAuth |
| Aider | API keys only | Set provider key in env |

See `~/.config/jat/agents.json` for full agent configuration and Settings → Agents in the IDE.

## Credentials & Secrets Management

JAT provides a secure credential storage system for API keys and per-project secrets.

### Storage Location

All credentials stored in `~/.config/jat/credentials.json` with `0600` permissions (user read/write only).

### API Keys (Global)

Configure API keys via **Settings → API Keys** tab:

| Provider | Used For | Env Var |
|----------|----------|---------|
| Anthropic | Task suggestions, AI features | `ANTHROPIC_API_KEY` |
| Google | Gemini image generation | `GEMINI_API_KEY` |
| OpenAI | Future Codex integration | `OPENAI_API_KEY` |

### Custom API Keys

Add your own API keys for custom services:

1. Go to **Settings → API Keys → Custom Keys**
2. Click "Add Custom Key"
3. Provide: Name, API key value, environment variable name, optional description

**Access in scripts/hooks:**
```bash
# Get a secret value
jat-secret stripe              # Outputs: sk_live_xxx...

# Get the env var name
jat-secret --env stripe        # Outputs: STRIPE_API_KEY

# List all keys
jat-secret --list

# Load all keys as environment variables
eval $(jat-secret --export)

# Use in scripts
MY_KEY=$(jat-secret my-service)
```

### Per-Project Secrets

Configure project-specific credentials via **Settings → Project Secrets** tab:

| Secret Type | Description | Env Var |
|-------------|-------------|---------|
| `supabase_url` | Supabase project URL | `SUPABASE_URL` |
| `supabase_anon_key` | Public anonymous key | `SUPABASE_ANON_KEY` |
| `supabase_service_role_key` | Server-side key | `SUPABASE_SERVICE_ROLE_KEY` |
| `supabase_db_password` | Database password for SQL | `SUPABASE_DB_PASSWORD` |
| `database_url` | PostgreSQL connection string | `DATABASE_URL` |

**Fallback chain:** The system checks credentials in this order:
1. `~/.config/jat/credentials.json` (Settings UI)
2. Environment variables
3. `.env` files in project directory

### Data Structure

```json
{
  "apiKeys": {
    "anthropic": { "key": "sk-ant-...", "addedAt": "..." },
    "google": { "key": "AIza...", "addedAt": "..." }
  },
  "customApiKeys": {
    "stripe": {
      "value": "sk_live_...",
      "envVar": "STRIPE_API_KEY",
      "description": "Payment processing",
      "addedAt": "..."
    }
  },
  "projectSecrets": {
    "my-project": {
      "supabase_db_password": { "value": "...", "addedAt": "..." }
    }
  }
}
```

## Tmux Requirement (Critical)

**All Claude Code sessions MUST run inside tmux for IDE tracking.**

The IDE tracks agents via tmux sessions named `jat-{AgentName}`. Sessions not running in tmux will show as "offline" or "disconnected" in the IDE.

### Correct Launch Methods

```bash
# Via jat CLI (recommended for multi-agent)
jat chimaro 4 --claude      # 4 agents, Claude only (no npm/browser)
jat chimaro 4 --auto        # 4 agents, auto-attack mode

# Via bash launcher functions (recommended for single agent)
jat-chimaro                 # Single agent for chimaro project
jat-jat                     # Single agent for jat project

# Generate launcher functions (if not installed)
~/code/jat/tools/scripts/setup-bash-functions.sh
source ~/.bashrc
```

### Session Naming Flow

1. Launch creates `jat-pending-{id}` tmux session
2. `/jat:start` registers agent and renames session to `jat-{AgentName}`
3. IDE sees `jat-{AgentName}` and tracks the agent

### What NOT To Do

```bash
# WRONG - runs Claude directly without tmux
cd ~/code/chimaro && claude "/jat:start"

# This will show a statusline error:
# "NOT IN TMUX SESSION - IDE cannot track this session"
```

## Attach vs Resume Session Features

The IDE provides two different ways to interact with agent sessions from the UI:

### Attach Session (Online Agents)

**Use when:** Agent is currently running (tmux session exists)

**API:** `POST /api/sessions/[name]/attach`

**What it does:**
1. Creates a new window in your parent tmux session (e.g., `jat-ide`)
2. Attaches to the existing agent's tmux session
3. Falls back to spawning a new terminal if no parent session found

**When to use:**
- You want to watch an agent work in real-time
- You need to interact with a running agent
- The agent is stuck and you need to manually intervene

**IDE UI:** "Attach Terminal" action in the session dropdown

```bash
# Equivalent manual command
tmux attach-session -t jat-AgentName
```

### Resume Session (Offline Agents)

**Use when:** Agent has completed or stopped (tmux session no longer exists)

**API:** `POST /api/sessions/[name]/resume`

**What it does:**
1. Looks up the Claude Code session ID from signal files or `.claude/sessions/agent-*.txt`
2. Kills any stale tmux session with the same name
3. Creates a new tmux session with `claude -r {session_id}` to resume the conversation
4. Spawns a terminal attached to the new session

**When to use:**
- Agent completed but you want to continue the conversation
- Agent crashed and you want to pick up where it left off
- You need to ask follow-up questions about completed work

**Session ID lookup order:**
1. `/tmp/jat-signal-tmux-{session}.json` - Signal files (cleared on reboot)
2. `/tmp/jat-timeline-{session}.jsonl` - Timeline events (cleared on reboot)
3. `.claude/sessions/agent-{sessionId}.txt` - Persistent mapping (survives reboot)

**IDE UI:** "Resume Session" action (only shown for offline agents)

```bash
# Equivalent manual command
claude -r abc123-def456-session-id
```

### Key Differences

| Feature | Attach | Resume |
|---------|--------|--------|
| **Agent Status** | Online (tmux exists) | Offline (tmux gone) |
| **Creates Session** | No (attaches to existing) | Yes (new tmux + claude -r) |
| **Preserves Context** | N/A (shares existing) | Yes (resumes conversation) |
| **Session ID Needed** | No | Yes (looked up automatically) |
| **Survives Reboot** | N/A | Yes (uses persistent files) |

### Configuration

Both features use these settings from `~/.config/jat/projects.json`:

```json
{
  "defaults": {
    "terminal": "alacritty",           // Terminal emulator to spawn
    "claude_flags": "--dangerously-skip-permissions",
    "parent_session": "jat-ide"  // For attach: where to create windows
  }
}
```

**Supported terminals:** alacritty, kitty, gnome-terminal, konsole, xterm (fallback)

## Launch Multi-Agent Backlog Attack

```bash
# Launch 4 agents that each auto-start the highest priority task
jat chimaro 4 --auto

# This will:
# 1. Start npm dev server + browser + IDE
# 2. Launch 4 Claude sessions in tmux (15s stagger between each)
# 3. Each session runs /jat:start auto → picks & starts top task

# Claude-only (no npm server, browser, or IDE)
jat chimaro 4 --claude --auto
```

## IDE Development

**The JAT IDE is a SvelteKit 5 application in the `ide/` directory.**

### Important: IDE-Specific Documentation

When working on the IDE, refer to:
```
ide/CLAUDE.md
```

This contains critical information about:
- **Tailwind CSS v4 syntax** (completely different from v3!)
- DaisyUI theme configuration
- Theme switching implementation
- Svelte 5 runes syntax
- Common pitfalls and troubleshooting

### Quick IDE Commands

**Launcher Script (Recommended):**
```bash
jat       # Checks dependencies, starts server, opens browser
```

**Manual Commands:**
```bash
cd ide
npm install
npm run dev         # Usually http://127.0.0.1:5174

# Clean build cache if themes aren't loading
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

### Critical IDE Issue: Tailwind v4

**This does NOT work (v3 syntax):**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**You MUST use this (v4 syntax):**
```css
@import "tailwindcss";

@plugin "daisyui" {
  themes: light, dark, nord --default, ...;
}
```

See `ide/CLAUDE.md` for full details.

## Voice-to-Text (Optional)

The IDE supports voice input using local whisper.cpp - 100% private, no data leaves your machine.

### Installation

```bash
# During initial install, select "Yes" when prompted for Voice-to-Text

# Or install later:
bash ~/code/jat/tools/scripts/install-whisper.sh
```

### Requirements

- **Disk space**: ~2GB (whisper.cpp + model)
- **Build tools**: cmake, g++, make
- **Audio**: ffmpeg + development libraries

### What Gets Installed

- `~/.local/share/jat/whisper/` - whisper.cpp source and build
- `~/.local/share/jat/whisper/build/bin/whisper-cli` - transcription binary
- `~/.local/share/jat/whisper/models/ggml-large-v3-turbo-q5_1.bin` - 624MB model

### Where Voice Input Appears

- **TaskCreationDrawer**: Mic buttons next to title and description fields
- **WorkCard**: Mic button next to session text input

### How It Works

1. Click mic button → browser records audio (MediaRecorder API)
2. Audio sent to `/api/transcribe` (local endpoint)
3. ffmpeg converts WebM → WAV (16kHz mono)
4. whisper-cli transcribes audio locally
5. Text appears in input field

## Adding New Projects

Projects are automatically discovered by the IDE in two ways:

### Method 1: Run `jt init` (Recommended for quick start)

```bash
cd ~/code/my-new-project
jt init
# Creates .jat/ directory with task database
```

The IDE automatically scans `~/code/` for directories with `.jat/` and adds them to the project list. After running `jt init`, refresh the IDE to see your project.

### Method 2: Add to JAT Config (Full configuration)

For projects that need custom ports, colors, or database URLs:

```bash
# Edit ~/.config/jat/projects.json
{
  "projects": {
    "my-project": {
      "name": "MY-PROJECT",
      "path": "~/code/my-project",
      "port": 3000,
      "description": "My project description"
    }
  }
}
```

**JAT config fields (per-project):**
- `path` - Project directory (required)
- `port` - Dev server port (optional, enables server controls)
- `server_path` - Where to run `npm run dev` (optional, defaults to path)
- `description` - Shown in IDE (optional)
- `active_color` / `inactive_color` - Badge colors (optional)
- `database_url` - For database tools (optional)

**JAT defaults (global settings):**

Add a `defaults` section to `~/.config/jat/projects.json` for global configuration:

```json
{
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "tools_path": "~/.local/bin",
    "claude_flags": "--dangerously-skip-permissions",
    "model": "opus",
    "agent_stagger": 15,
    "claude_startup_timeout": 20,
    "file_watcher_ignored_dirs": [".git", "node_modules", ".svelte-kit", "dist"]
  },
  "projects": { ... }
}
```

- `terminal` - Terminal emulator for new sessions (default: "alacritty")
- `editor` - Code editor command (default: "code")
- `tools_path` - Path to jat tools (default: "~/.local/bin")
- `claude_flags` - Claude CLI flags (default: "--dangerously-skip-permissions")
- `model` - Default Claude model: "opus", "sonnet", "haiku" (default: "opus")
- `agent_stagger` - Seconds between agent spawns in batch mode (default: 15)
- `claude_startup_timeout` - Seconds to wait for Claude TUI to start (default: 20, increase for slower systems)
- `file_watcher_ignored_dirs` - Directories to ignore when detecting file tree changes. Changes in these directories won't trigger the "changes detected" badge in the sidebar. (default: `.git`, `node_modules`, `.svelte-kit`, `.next`, `.nuxt`, `.vite`, `.cache`, `dist`, `build`, `.turbo`, `.parcel-cache`, `__pycache__`, `.pytest_cache`, `target`, `vendor`)

## macOS and zsh Compatibility

JAT supports both Linux (GNU tools) and macOS (BSD tools). The following platform differences are handled automatically:

| Tool | Linux (GNU) | macOS (BSD) | JAT Handling |
|------|-------------|-------------|--------------|
| `stat` (file mtime) | `stat -c %Y` | `stat -f %m` | Auto-detects platform |
| `date` (parse string) | `date -d "..."` | `date -j -f "..."` | Uses `parse_date_to_epoch()` |
| `sed` (in-place edit) | `sed -i "..."` | `sed -i '' "..."` | Platform check in scripts |

**zsh Compatibility:**
- Scripts use `#!/bin/bash` shebang (runs in bash even if user's shell is zsh)
- Regex capture uses `regex_match()` helper that works with both `$BASH_REMATCH` and `$match`
- All bash-specific syntax is contained in scripts, not in user's shell

**Installing on macOS:**
```bash
# Prerequisites
brew install tmux sqlite jq

# Install JAT
cd ~/code/jat
./install.sh
```

**Note:** The statusline and hooks are written in bash and installed to `~/.claude/`. They run as bash scripts regardless of your shell preference.

## Demo System

JAT includes a streamlined demo system for recording videos and showcasing IDE features. The demo uses three pre-configured projects with distinct colors for visual differentiation.

### Demo Projects

| Project | Description | Color Scheme |
|---------|-------------|--------------|
| `jat-demo-blog` | Blog platform | Red/Pink |
| `jat-demo-shop` | E-commerce store | Green |
| `jat-demo-dashboard` | Analytics dashboard | Blue |

### Quick Start

```bash
# One-time setup (creates projects, clears tasks, configures colors)
jat-demo setup

# Show only demo projects in IDE (hide regular projects)
jat-demo on

# After recording, restore regular projects
jat-demo off

# Optionally remove demo projects (with confirmation)
jat-demo clean
```

### Commands

| Command | Description |
|---------|-------------|
| `jat-demo setup` | Creates demo projects in ~/code/, initializes with jt, adds to config with distinct colors |
| `jat-demo on` | Hides all non-demo projects in IDE, shows only demo projects |
| `jat-demo off` | Shows regular projects, hides demo projects |
| `jat-demo status` | Shows visibility status of all projects |
| `jat-demo clean` | Removes all demo projects (interactive confirmation) |

### What `jat-demo setup` Does

1. **Creates project directories** in `~/code/` (skips if they exist)
2. **Initializes tasks** for each project (`jt init`)
3. **Clears task lists** (empty task database)
4. **Adds to JAT config** with distinct `active_color` and `inactive_color`
5. **Kills stale tmux sessions** (any old `jat-*Agent` sessions)

### Recording Scripts

Demo recording scripts are located in `assets/`:

- **RECORDING-SCRIPT-FINAL.md** - Latest recording guide with step-by-step instructions

**Key Features Showcased:**
- Multi-project task management
- Parallel agent execution across projects
- Interactive decision-making via AskUserQuestion modals
- Project panel organization (collapse/expand)
- AI-powered task suggestions
- Complete workflow from task creation to completion

### After Recording

```bash
# Restore normal IDE view
jat-demo off

# Optional: Remove demo projects entirely
jat-demo clean
```

**Files:**
- `tools/scripts/jat-demo` - Demo management CLI
- `assets/RECORDING-SCRIPT-FINAL.md` - Recording instructions
- `assets/demo-task-*.txt` - Sample task descriptions

## Common Issues

### IDE themes not working
1. Check `ide/src/app.css` uses Tailwind v4 syntax
2. See `ide/CLAUDE.md` for detailed troubleshooting

### Agent Registry "not registered"
```bash
/jat:start                # Quick fix (auto-registers)
# Or manually:
am-register --name YourAgentName --program claude-code --model sonnet-4.5
```

### Browser tools not found
```bash
cd /home/jw/code/jat
./install.sh
```

### Fresh IDE build needed
```bash
cd ide
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

### Statusline not updating
```bash
# Write to your session file (PPID-based) - uses sessions/ subdirectory
session_id=$(cat /tmp/claude-session-${PPID}.txt | tr -d '\n') && mkdir -p .claude/sessions && echo "YourAgentName" > ".claude/sessions/agent-${session_id}.txt"
```

### Agent shows "offline" or "disconnected" in IDE
```bash
# Cause: Claude session not running inside tmux
# Fix: Exit and restart with a launcher function
exit
jat-chimaro    # or jat-jat, jat-myproject, etc.

# If launcher functions not installed:
~/code/jat/tools/scripts/setup-bash-functions.sh
source ~/.bashrc
```

### Voice input not working
```bash
# Check if whisper is installed
ls ~/.local/share/jat/whisper/build/bin/whisper-cli

# If not found, install it
bash ~/code/jat/tools/scripts/install-whisper.sh

# If whisper-cli exists but fails, rebuild (ffmpeg updated)
cd ~/.local/share/jat/whisper/build
cmake .. -DWHISPER_FFMPEG=ON && make -j$(nproc) whisper-cli

# Test transcription API
curl http://localhost:3333/api/transcribe
# Should return: {"status":"ok","whisper_cli":"...","model_exists":true}
```

## References

- **Shared docs**: `./shared/*.md` (imported above)
- **IDE docs**: `ide/CLAUDE.md`
- **JAT commands**: `./commands/jat/*.md`
- **Tool source**: Each tool directory contains implementation
- **Installation**: `install.sh` for symlink setup
