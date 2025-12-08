# Jomarchy Agent Tools

Lightweight bash tools for agent orchestration, database operations, monitoring, development, and browser automation.

@~/code/jat/shared/overview.md
@~/code/jat/shared/agent-mail.md
@~/code/jat/shared/bash-patterns.md
@~/code/jat/shared/beads.md
@~/code/jat/shared/tools.md
@~/code/jat/shared/workflow-commands.md
@~/code/jat/shared/statusline.md
@~/code/jat/shared/signals.md
@~/code/jat/shared/agent-app-interface.md

## Project Structure

```
jat/
├── mail/                # Agent Mail coordination system (11 tools)
├── commands/jat/        # JAT workflow commands (9 commands)
├── browser-tools/       # Browser automation tools (11 tools)
├── tools/               # Database & monitoring tools (6 tools)
├── dashboard/           # Beads Task Dashboard (SvelteKit app)
├── scripts/             # Installation and setup scripts
├── shared/              # Shared documentation (imported by projects)
└── install.sh           # Installation script
```

## Quick Start

```bash
# Install tools (symlinks to ~/bin/)
./install.sh

# Verify installation
am-whoami
db-schema
browser-start.js --help

# Start working (registers agent + picks task)
/jat:start

# Auto-attack mode (pick highest priority task immediately)
/jat:start auto
```

## Tmux Requirement (Critical)

**All Claude Code sessions MUST run inside tmux for dashboard tracking.**

The dashboard tracks agents via tmux sessions named `jat-{AgentName}`. Sessions not running in tmux will show as "offline" or "disconnected" in the dashboard.

### Correct Launch Methods

```bash
# Via jat CLI (recommended for multi-agent)
jat chimaro 4 --claude      # 4 agents, Claude only (no npm/browser)
jat chimaro 4 --auto        # 4 agents, auto-attack mode

# Via bash launcher functions (recommended for single agent)
jat-chimaro                 # Single agent for chimaro project
jat-jat                     # Single agent for jat project

# Generate launcher functions (if not installed)
~/code/jat/scripts/setup-bash-functions.sh
source ~/.bashrc
```

### Session Naming Flow

1. Launch creates `jat-pending-{id}` tmux session
2. `/jat:start` registers agent and renames session to `jat-{AgentName}`
3. Dashboard sees `jat-{AgentName}` and tracks the agent

### What NOT To Do

```bash
# WRONG - runs Claude directly without tmux
cd ~/code/chimaro && claude "/jat:start"

# This will show a statusline error:
# "NOT IN TMUX SESSION - Dashboard cannot track this session"
```

## Launch Multi-Agent Backlog Attack

```bash
# Launch 4 agents that each auto-start the highest priority task
jat chimaro 4 --auto

# This will:
# 1. Start npm dev server + browser + dashboard
# 2. Launch 4 Claude sessions in tmux (15s stagger between each)
# 3. Each session runs /jat:start auto → picks & starts top task

# Claude-only (no npm server, browser, or dashboard)
jat chimaro 4 --claude --auto
```

## Dashboard Development

**The Beads Task Dashboard is a SvelteKit 5 application in the `dashboard/` directory.**

### Important: Dashboard-Specific Documentation

When working on the dashboard, refer to:
```
dashboard/CLAUDE.md
```

This contains critical information about:
- **Tailwind CSS v4 syntax** (completely different from v3!)
- DaisyUI theme configuration
- Theme switching implementation
- Svelte 5 runes syntax
- Common pitfalls and troubleshooting

### Quick Dashboard Commands

**Launcher Script (Recommended):**
```bash
bd-dashboard        # Checks dependencies, starts server, opens browser
jat-dashboard       # Alias for bd-dashboard
```

**Manual Commands:**
```bash
cd dashboard
npm install
npm run dev         # Usually http://127.0.0.1:5174

# Clean build cache if themes aren't loading
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

### Critical Dashboard Issue: Tailwind v4

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

See `dashboard/CLAUDE.md` for full details.

## Voice-to-Text (Optional)

The dashboard supports voice input using local whisper.cpp - 100% private, no data leaves your machine.

### Installation

```bash
# During initial install, select "Yes" when prompted for Voice-to-Text

# Or install later:
bash ~/code/jat/scripts/install-whisper.sh
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

## Common Issues

### Dashboard themes not working
1. Check `dashboard/src/app.css` uses Tailwind v4 syntax
2. See `dashboard/CLAUDE.md` for detailed troubleshooting

### Agent Mail "not registered"
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

### Fresh dashboard build needed
```bash
cd dashboard
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

### Statusline not updating
```bash
# Write to your session file (PPID-based) - uses sessions/ subdirectory
session_id=$(cat /tmp/claude-session-${PPID}.txt | tr -d '\n') && mkdir -p .claude/sessions && echo "YourAgentName" > ".claude/sessions/agent-${session_id}.txt"
```

### Agent shows "offline" or "disconnected" in dashboard
```bash
# Cause: Claude session not running inside tmux
# Fix: Exit and restart with a launcher function
exit
jat-chimaro    # or jat-jat, jat-myproject, etc.

# If launcher functions not installed:
~/code/jat/scripts/setup-bash-functions.sh
source ~/.bashrc
```

### Voice input not working
```bash
# Check if whisper is installed
ls ~/.local/share/jat/whisper/build/bin/whisper-cli

# If not found, install it
bash ~/code/jat/scripts/install-whisper.sh

# If whisper-cli exists but fails, rebuild (ffmpeg updated)
cd ~/.local/share/jat/whisper/build
cmake .. -DWHISPER_FFMPEG=ON && make -j$(nproc) whisper-cli

# Test transcription API
curl http://localhost:5174/api/transcribe
# Should return: {"status":"ok","whisper_cli":"...","model_exists":true}
```

## References

- **Shared docs**: `./shared/*.md` (imported above)
- **Dashboard docs**: `dashboard/CLAUDE.md`
- **JAT commands**: `./commands/jat/*.md`
- **Tool source**: Each tool directory contains implementation
- **Installation**: `install.sh` for symlink setup
