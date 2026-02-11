# JAT Quick Start Guide

> **Get from zero to orchestrating AI agents in 5 minutes**

## The 10X Boost in 5 Steps

Andrej Karpathy said it best: you could be 10X more powerful with AI agents if you could just string together what's available. JAT is that string.

---

## Step 1: Install Prerequisites (2 min)

```bash
# Linux (Arch/Manjaro)
sudo pacman -S tmux sqlite jq nodejs npm

# Linux (Debian/Ubuntu)
sudo apt install tmux sqlite3 jq nodejs npm

# macOS
brew install tmux sqlite jq node
```

**Why these?**
- `tmux` - Agent sessions run here (IDE tracks them)
- `sqlite3` - Agent Registry database (coordination)
- `jq` - JSON processing (tool outputs)
- `node/npm` - IDE and browser automation

---

## Step 2: Install JAT (1 min)

```bash
# One-line installer (works on Linux and macOS)
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/master/install.sh | bash
```

**This symlinks all tools to `~/.local/bin/`:**
- `jt-*` - JAT Tasks CLI
- `am-*` - Agent Registry (13 commands)
- `browser-*` - Browser automation (11 commands)
- `db-*` - Database tools (4 commands)
- `jat-*` - JAT signals and launchers

**Reload your shell:**
```bash
source ~/.bashrc  # or ~/.zshrc on macOS
```

**Verify:**
```bash
am-whoami    # Should show "Not registered" (expected)
jt --version # Should show version number
```

---

## Step 3: Initialize a Project (30 sec)

```bash
cd ~/code/myproject
jt init
```

**Answer the prompts** (or press Enter for defaults):
- Project name: `myproject`
- Default priority: `2` (Medium)
- Task prefix: `mp` (e.g., mp-001, mp-002)

**This creates `.jat/` directory** - git-backed task tracking.

---

## Step 4: Start the IDE (30 sec)

```bash
jat
```

**This:**
1. Checks dependencies (npm install if needed)
2. Starts SvelteKit dev server (port 3333 by default)
3. Opens browser to http://localhost:3333

**You should see:**
- Empty Work page (no active sessions yet)
- Navigation: Tasks, Work, Files, Servers, Agents, Config

---

## Step 5: Launch Your First Agent (1 min)

### Option A: Via IDE (Recommended for First Time)

1. Go to **Tasks** page
2. Click **"Create Task"** button
3. Fill in:
   - Title: "Add authentication"
   - Type: `task`
   - Priority: `P2` (Medium)
4. Click **"Create"**
5. Go to **Work** page
6. Click **"Start Next"** dropdown → Select your new task
7. Watch agent spawn in tmux session

### Option B: Via CLI (Faster for Repeat Use)

```bash
# Single agent
jat-myproject

# Multiple agents in auto-attack mode
jat myproject 4 --auto
```

**What happens:**
1. Tmux session created: `jat-{AgentName}`
2. Claude Code starts in session
3. Agent runs `/jat:start` (picks highest priority task)
4. IDE shows live terminal output
5. Session state updates in real-time

---

## You're Now Orchestrating AI Agents! 🎉

**What you have:**
- ✅ Visual IDE showing all agent sessions
- ✅ Task management (create, assign, track)
- ✅ Live terminal output per agent
- ✅ Code editor (`/files` page)
- ✅ Server controls (`/servers` page)
- ✅ Token usage tracking

---

## Configure Auto-Proceed Rules (Optional but Recommended)

Go to **Config → Review Rules**:

**The Review Rules Matrix:**

```
              P0        P1        P2        P3        P4
bug         review    review    review    auto      auto
feature     review    review    auto      auto      auto
task        review    auto      auto      auto      auto
chore       auto      auto      auto      auto      auto
```

**What this means:**
- **P3-P4 bugs**: Agent auto-completes → spawns next task
- **P0-P2 bugs**: Agent asks for review before completing
- Click cells to toggle between auto/review

**Why configure this?**
- Lets agents work overnight on low-priority items
- You review high-priority completions
- Balances autonomy with control

---

## Configure Automation Rules (Optional)

Go to **Config → Automation → Presets**:

**Install these presets:**
- ✅ **API Overloaded Recovery** (auto-retry with backoff)
- ✅ **Rate Limit Recovery** (wait 60s, retry)
- ✅ **Network Error Recovery** (detect ECONNREFUSED, retry)
- ✅ **Auto-Continue Prompts** (send Enter on "Continue?" prompts)

**Why these help:**
- Agents recover from transient errors automatically
- You don't babysit stuck sessions
- 3am rate limit? Handled.

---

## Your First Epic Swarm (Multi-Agent Workflow)

### Create an Epic

1. **Tasks page** → Create Task
2. Type: `epic`
3. Title: "Add user authentication system"
4. Description:
   ```
   - [ ] Design auth flow
   - [ ] Add login endpoint
   - [ ] Add registration endpoint
   - [ ] Add password reset
   - [ ] Write tests
   - [ ] Update documentation
   ```
5. Click **Create**

### Launch the Swarm

1. Click the Epic's title → Opens detail drawer
2. Click **"Launch Epic Swarm"** button
3. Configure:
   - **Execution mode**: Parallel
   - **Max concurrent**: 4
   - **Review threshold**: P0-P1 (only review critical items)
   - **Auto-spawn blocked**: Yes (wait for dependencies)
4. Click **"Launch"**

### Watch the Magic

- IDE converts each `[ ]` item into a subtask
- 4 agents spawn simultaneously
- Each picks a subtask (ordered by priority)
- As tasks complete, agents auto-proceed to next task
- Progress bar shows completion

**When to intervene:**
- Agent shows **"NEEDS INPUT"** badge → click to answer
- Agent shows **"REVIEW"** badge → check work before completing
- Error in terminal → automation rules try recovery first

---

## Common First-Time Issues

### "Agent shows offline in IDE"

**Cause:** Not running in tmux

**Fix:**
```bash
# Don't run:
claude "/jat:start"  # ❌ No tmux, IDE can't track

# Do run:
jat-myproject        # ✅ Launcher creates tmux session
```

### "IDE says 'No projects found'"

**Cause:** Haven't run `jt init` in your project

**Fix:**
```bash
cd ~/code/myproject
jt init
# Refresh IDE
```

### "Voice input mic button doesn't work"

**Cause:** Whisper not installed

**Fix:**
```bash
bash ~/code/jat/tools/scripts/install-whisper.sh
```

### "Browser automation tools not found"

**Cause:** npm dependencies not installed

**Fix:**
```bash
cd ~/code/jat/tools/browser
npm install
```

### "Agents cost too much"

**Check usage:**
- IDE → Agent card → Shows tokens + cost today/week
- Adjust review rules to require more human review
- Set max concurrent lower (fewer agents = less cost)

**Typical costs:**
- 100K tokens/day ≈ $0.30/day
- 1M tokens/day ≈ $3/day
- 10M tokens/day ≈ $30/day

---

## Next Steps

### Level 1: Single Agent (you just did this ✅)
- Launch one agent on one task
- Watch it work in IDE
- Review and complete

### Level 2: Auto-Proceed
- Configure review rules matrix
- Let agents auto-complete low-priority tasks
- Wake up to finished backlog

### Level 3: Epic Swarm
- Create epic with 10+ subtasks
- Launch 4-8 agents in parallel
- Track progress in real-time

### Level 4: Custom Automation
- Write custom automation rules (regex patterns)
- Template variables with capture groups
- Project-specific error handling

### Level 5: Multi-Project
- Initialize multiple projects (`~/code/project1`, `~/code/project2`)
- IDE shows all projects
- Swarm attack across projects

---

## Key Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Alt+N` | Create new task | Global |
| `Alt+E` | Open Epic Swarm modal | Global |
| `Alt+S` | Start next task | Global |
| `Alt+A` | Attach to session | Hovered session (Work page) |
| `Alt+K` | Kill session | Hovered session |
| `Alt+1` to `Alt+9` | Jump to session | Work page |
| `Cmd+K` | Command palette | Global |

---

## Essential Commands

### IDE
```bash
jat                             # Launch IDE
```

### Project Management
```bash
jat init                        # Auto-discover ~/code/* projects
jat add <path>                  # Add project manually
jat list                        # Show all projects
```

### Task Management
```bash
jt ready                        # Tasks ready to work
jt create "Title" --priority 1  # Create task (P1 = High)
jt show <id>                    # View task details
jt close <id>                   # Close completed task
jt dep add <task> <blocker>     # Add dependency
```

### Agent Coordination
```bash
am-whoami                       # Check your agent identity
am-agents                       # List all registered agents
am-inbox <agent> --unread       # Check messages
am-send "Message" --to <agent>  # Send message
```

### Slash Commands (in Claude sessions)
```
/jat:start          Pick task, reserve files, begin work
/jat:complete       Verify, commit, close task, end session
/jat:tasktree           Convert PRD to structured tasks
/jat:verify         Run tests, lint, security checks
/jat:doctor         Diagnose and repair JAT setup
```

---

## Support & Next Steps

### Documentation
- [README.md](README.md) - Overview and philosophy
- [GETTING_STARTED.md](GETTING_STARTED.md) - Complete tutorial
- [CLAUDE.md](CLAUDE.md) - Complete developer reference
- [shared/signals.md](shared/signals.md) - Signal system
- [shared/automation.md](shared/automation.md) - Automation rules
- [shared/tools.md](shared/tools.md) - All 40+ tools

### Having Issues?
- Check [GitHub Issues](https://github.com/joewinke/jat/issues)
- Read troubleshooting in [CLAUDE.md](CLAUDE.md)
- Join community discussions

---

## The Bottom Line

Karpathy said programmers could be **10X more powerful** if they could just string together what's available.

**You just strung it together.**

- ✅ Agents orchestrated
- ✅ IDE running
- ✅ Tasks tracked
- ✅ Automation configured

**You're ready to claim the 10X boost. Happy orchestrating! 🚀**

[Full Docs](GETTING_STARTED.md) | [README](README.md) | [Issues](https://github.com/joewinke/jat/issues)
