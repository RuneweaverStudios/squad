# Installation

SQUAD runs on Linux and macOS. The whole setup takes about five minutes if you already have the prerequisites.

## Prerequisites

You need three tools installed before running the SQUAD installer.

| Tool | Purpose | Required |
|------|---------|----------|
| `tmux` | Terminal multiplexer for session management | Yes |
| `sqlite3` | Database engine for Agent Registry | Yes |
| `jq` | JSON processing in bash tools | Yes |
| `node` / `npm` | IDE and browser automation tools | Recommended |
| `gum` | Interactive prompts during install | Optional |

### Install prerequisites by platform

**Arch / Manjaro:**
```bash
sudo pacman -S tmux sqlite jq
```

**Debian / Ubuntu:**
```bash
sudo apt install tmux sqlite3 jq
```

**Fedora:**
```bash
sudo dnf install tmux sqlite jq
```

**macOS:**
```bash
brew install tmux sqlite jq
```

Node.js is optional but recommended. Without it, you wont have access to the IDE or browser automation tools. Any recent LTS version (v20+) works.

## Install SQUAD

Clone the repository and run the installer:

```bash
git clone https://github.com/jomarchy/squad.git ~/code/squad
cd ~/code/squad
./install.sh
```

The installer creates symlinks in `~/.local/bin/` pointing to the actual tool scripts. It also sets up:

- Agent Registry database at `~/.agent-mail.db`
- Claude Code hooks in `~/.claude/hooks/`
- Statusline script at `~/.claude/statusline.sh`
- Task CLI (`st` command)

Make sure `~/.local/bin` is in your PATH. Add this to your `~/.bashrc` or `~/.zshrc` if it isnt already:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Verify the installation

Run these commands to confirm everything is working:

```bash
# Core tools
tmux -V              # Should print tmux 3.x
sqlite3 --version    # Should print 3.x.x
jq --version         # Should print jq-1.x

# Agent Registry
am-whoami            # Should print "Not registered" or an agent name
am-agents            # Lists all registered agents

# Task CLI
st --version         # Should print st x.x.x
st --help            # Shows available commands

# Check symlink counts
ls ~/.local/bin/am-* | wc -l        # Expected: 13
ls ~/.local/bin/st* | wc -l         # Expected: 5
ls ~/.local/bin/browser-* | wc -l   # Expected: 11
```

If any command returns `command not found`, the most likely cause is `~/.local/bin` missing from your PATH.

## Add your first project

SQUAD needs at least one project before the IDE or agents can do anything useful. A valid project is a git repository with a `.squad/` directory.

```bash
cd ~/code/my-project
st init
```

The `st init` command creates a `.squad/` directory with the task database.

After initialization, verify it worked:

```bash
st list --status open    # Should return an empty list (no tasks yet)
```

You can also add projects through the IDE once its running. Go to the Tasks page and click "Add Project."

## Start the IDE

```bash
squad
```

This launches the SvelteKit-based IDE, checks for updates, and opens your browser. The IDE typically runs at `http://127.0.0.1:5174`.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `command not found` | PATH not configured | Add `~/.local/bin` to your PATH |
| `am-whoami` fails | Database not initialized | Run `bash ~/code/squad/tools/scripts/install-agent-mail.sh` |
| `st: command not found` | Task CLI not installed | Run `./install.sh` to create symlinks |
| Browser tools fail | npm dependencies missing | Run `cd ~/code/squad/tools/browser && npm install` |
| IDE wont start | Dependencies missing | Run `cd ~/code/squad/ide && npm install` |
| Broken symlinks | Stale installation | Run `./install.sh` again to refresh |

## Next steps

- [Quick Start](/docs/quick-start/) - Create your first task and run an agent
- [Architecture](/docs/architecture/) - Understand the two-layer design
- [Projects](/docs/projects/) - Configure multiple projects
