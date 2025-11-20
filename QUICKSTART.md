# Jomarchy Agent Tools - Quick Start Guide

**Get from zero to multi-agent coordination in 10 minutes!**

This guide walks you through your first experience with Agent Mail and Beads, from installation to running your first coordinated multi-agent workflow.

---

## Prerequisites

- **Operating System**: Linux or macOS
- **Shell**: bash (version 4.0+)
- **Tools**: `git`, `sqlite3`, `node` (v18+), `npm`
- **AI Coding Assistant**: Any tool with bash access (Claude Code, Cline, Cursor, etc.)

### Check Prerequisites

```bash
# Check bash version
bash --version  # Should be 4.0+

# Check sqlite3
sqlite3 --version

# Check Node.js
node --version  # Should be v18+
npm --version

# Check git
git --version
```

If any are missing, install them first:
- **Ubuntu/Debian**: `sudo apt-get install bash sqlite3 nodejs npm git`
- **macOS**: `brew install bash sqlite node git`

---

## Step 1: Install Jomarchy Agent Tools

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/joewinke/jat/main/install.sh | bash
```

This installs:
- **Agent Mail** (11 bash tools for multi-agent coordination)
- **Beads CLI** (dependency-aware task management)
- **28 generic bash tools** (browser automation, database queries, etc.)
- **10 coordination commands** (slash commands for AI assistants)

### Manual Install (Alternative)

```bash
# Clone the repository
git clone https://github.com/joewinke/jat.git ~/code/jat
cd ~/code/jat

# Run install script
bash install.sh

# Verify installation
which am-register  # Should show ~/bin/am-register (or ~/.local/bin/am-register)
which bd          # Should show ~/code/beads/bd
```

### Verify Installation

```bash
# Test Agent Mail
am-register --help

# Test Beads
bd --help

# Run full test suite (optional)
bash test/run-all-tests.sh
```

**Expected output**: All tools accessible, tests passing.

---

## Step 2: Register Your First Agent

Agent Mail needs to know about each AI agent working in your project. This creates an identity in the coordination system.

### From Your AI Coding Assistant

**Inside your AI assistant (Claude Code, Cline, etc.), run:**

```bash
am-register --name YourAgent --program claude-code --model sonnet-4.5 --task "Learning Agent Mail"
```

**Parameters:**
- `--name`: Your agent's unique name (e.g., `Alice`, `BackendExpert`, `PaleStar`)
- `--program`: Which AI tool you're using (`claude-code`, `cline`, `cursor`, etc.)
- `--model`: Which model (`sonnet-4.5`, `gpt-4`, etc.)
- `--task`: (Optional) What this agent is working on

### Verify Registration

```bash
# Check your identity
am-whoami --agent YourAgent

# List all registered agents
am-agents
```

---

## Step 3: Your First Agent Mail Message

Now let's send a message to yourself (good for learning the flow).

```bash
# Send a message
am-send "Hello from Agent Mail!" \
  "This is my first message in the coordination system." \
  --from YourAgent \
  --to YourAgent \
  --thread learning

# Check your inbox
am-inbox YourAgent

# Acknowledge the message
am-ack 1 --agent YourAgent
```

**What just happened?**
- You sent a message to yourself
- The message is stored in `~/.agent-mail.db`
- It's organized by thread (`learning`)
- You acknowledged it (marked as read)

---

## Step 4: Reserve Files (Prevent Conflicts)

Agent Mail's killer feature: **file reservations**. This prevents multiple agents from editing the same files simultaneously.

```bash
# Reserve files for exclusive editing
am-reserve "src/**" --agent YourAgent --ttl 3600 --exclusive --reason "learning-001"

# Check active reservations
am-reservations

# Try to reserve again (will fail - you already have it!)
am-reserve "src/**" --agent YourAgent --ttl 3600 --exclusive --reason "learning-002"

# Release when done
am-release "src/**" --agent YourAgent
```

**Key concepts:**
- `--ttl 3600`: Time-to-live in seconds (1 hour)
- `--exclusive`: Only you can edit these files
- `--reason`: Why you're reserving (good for auditing)
- **Automatic conflict detection**: If another agent has the files, you'll get an error

---

## Step 5: Create Your First Beads Task

Beads is a dependency-aware task management system. Let's create a simple task.

```bash
# Create a task
bd create "Learn Agent Mail basics" \
  --type task \
  --priority 1 \
  --labels learning,tutorial \
  --description "Complete the QUICKSTART tutorial"

# List all tasks
bd list

# Show ready tasks (no blockers)
bd ready

# Close the task when done
bd close bd-<ID> --reason "Tutorial completed!"
```

**Beads creates local `.beads/` directories** in each project. Your tasks are stored there.

---

## Step 6: Multi-Agent Coordination Example

Now let's simulate two agents working together. We'll run this from the terminal to see the full flow.

### Scenario: Alice builds an API, Bob builds the frontend

```bash
# Register two agents
am-register --name Alice --program claude-code --model sonnet-4.5 --task "Backend API"
am-register --name Bob --program cursor --model gpt-4 --task "Frontend UI"

# Alice reserves backend files
am-reserve "api/**" --agent Alice --ttl 7200 --exclusive --reason "task-123"

# Alice announces her work
am-send "[task-123] Building user API" \
  "Starting POST /api/users endpoint. ETA: 1 hour." \
  --from Alice --to Bob --thread task-123 --importance high

# Bob checks his inbox
am-inbox Bob

# Bob acknowledges Alice's message
am-ack 1 --agent Bob

# Bob reserves frontend files (no conflict!)
am-reserve "src/components/**" --agent Bob --ttl 7200 --exclusive --reason "task-123"

# Alice finishes and notifies Bob
am-send "[task-123] API complete" \
  "Endpoint ready: POST /api/users accepts {name, email}" \
  --from Alice --to Bob --thread task-123 --importance high

# Alice releases her files
am-release "api/**" --agent Alice

# Bob completes integration
am-send "[task-123] Frontend complete" \
  "UI integrated with API. All working!" \
  --from Bob --to Alice --thread task-123

# Bob releases his files
am-release "src/components/**" --agent Bob

# Search the conversation
am-search "task-123" --thread task-123
```

**What you learned:**
- Agents reserve different file patterns (no conflicts!)
- Messages organize by thread (task-123)
- Importance levels (high for blockers)
- Clean handoff pattern (reserve → work → release → notify)

---

## Step 7: Beads + Agent Mail Integration

The power move: use Beads task IDs as Agent Mail thread IDs.

```bash
# Create a Beads task
bd create "Build authentication system" \
  --type feature \
  --priority 1 \
  --labels auth,security \
  --description "OAuth + JWT authentication"
# → Returns task ID: bd-456

# Reserve files with task ID in reason
am-reserve "src/auth/**" --agent YourAgent --ttl 7200 --reason "bd-456"

# Send progress update
am-send "[bd-456] Starting auth implementation" \
  "Building OAuth flow first, then JWT tokens" \
  --from YourAgent --thread bd-456

# Update Beads task
bd add bd-456 "Completed OAuth flow, starting JWT implementation"

# Complete and close
am-send "[bd-456] Complete" "All tests passing!" --from YourAgent --thread bd-456
am-release "src/auth/**" --agent YourAgent
bd close bd-456 --reason "Authentication system complete"
```

**The pattern:**
- Beads task ID (`bd-456`) = Agent Mail thread ID
- File reservation reason = Beads task ID
- Easy to trace work across both systems

---

## Common Workflows

### Starting Work on a Task

```bash
# 1. Check ready tasks
bd ready

# 2. Pick one and reserve files
am-reserve "relevant/files/**" --agent YourAgent --ttl 3600 --reason "bd-XXX"

# 3. Announce start
am-send "[bd-XXX] Starting" "Working on..." --from YourAgent --thread bd-XXX

# 4. Do the work...

# 5. Complete
am-send "[bd-XXX] Complete" "Summary..." --from YourAgent --thread bd-XXX
am-release "relevant/files/**" --agent YourAgent
bd close bd-XXX --reason "Done!"
```

### Handing Off to Another Agent

```bash
# 1. Send handoff message
am-send "[bd-XXX] 🤝 HANDOFF" \
  "Done: [list]. Blocked on: [blocker]. Can you take over?" \
  --from AgentA --to AgentB --thread bd-XXX --importance high --ack

# 2. Release files
am-release "files/**" --agent AgentA

# 3. Other agent acknowledges and reserves
am-ack <msg-id> --agent AgentB
am-reserve "files/**" --agent AgentB --ttl 3600 --reason "bd-XXX"

# 4. Continue work
am-send "[bd-XXX] Handoff accepted" "Taking over..." --from AgentB --to AgentA
```

### Checking for Conflicts

```bash
# Before starting work, check reservations
am-reservations

# If conflict detected, coordinate
am-send "[coordination] File conflict" \
  "You have src/auth/**. Can we coordinate?" \
  --from AgentB --to AgentA --thread coordination
```

---

## Troubleshooting

### "Error: from_agent not registered"

**Problem**: You didn't register your agent first.

**Solution**:
```bash
am-register --name YourAgent --program claude-code --model sonnet-4.5
```

### "Error: FILE_RESERVATION_CONFLICT"

**Problem**: Another agent has exclusive lock on those files.

**Solution**:
```bash
# Check who has the lock
am-reservations

# Coordinate with that agent
am-send "Need files" "Can you release src/**?" --from You --to OtherAgent

# Or work on different files
am-reserve "different/path/**" --agent YourAgent
```

### "Error: Database locked"

**Problem**: SQLite database is locked (rare).

**Solution**:
```bash
# Wait a moment and retry
# Or check for stuck processes
ps aux | grep sqlite3
```

### Installation Issues

**Problem**: `am-register: command not found`

**Solution**:
```bash
# Check installation path
echo $PATH | grep -E "(~/bin|~/.local/bin)"

# Add to PATH if missing (add to ~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# Reload shell
source ~/.bashrc
```

### Agent Mail database location

**Default**: `~/.agent-mail.db`

**Custom location** (for testing):
```bash
export AGENT_MAIL_DB="/path/to/custom.db"
```

**Note**: Custom database paths may require manual schema initialization. For testing, example scripts in `examples/workflows/` automatically initialize test databases. For production, use the default location (`~/.agent-mail.db`).

---

## Next Steps

### Learn More

1. **Read the examples**: `examples/workflows/` directory has 4 real-world coordination patterns
2. **Read best practices**: `examples/best-practices.md` for patterns and anti-patterns
3. **Explore tools**: Every `am-*` and `bd` command has `--help`
4. **Run tests**: `bash test/run-all-tests.sh` to see everything in action

### Advanced Topics

- **Multi-project coordination**: Agent Mail works across different repositories
- **Beads dependencies**: Use `--deps bd-XXX` when creating tasks
- **Full-text search**: `am-search "keyword"` searches all message history
- **Browser automation**: 7 browser tools (`browser-*.js`) for web scraping/testing
- **Database queries**: `db-query` for direct SQLite access from Node.js

### Example Commands for Exploration

```bash
# See all example workflow scripts
ls examples/workflows/

# Run the basic collaboration example
bash examples/workflows/01-basic-collaboration.sh

# Read best practices
cat examples/best-practices.md

# Explore all Agent Mail commands
ls ~/bin/am-* | xargs -n1 basename
```

---

## Real-World Usage

### For Solo Developers

- Use Agent Mail for audit trail (all decisions documented)
- Use Beads for task queue (never forget what to do next)
- File reservations prevent you from editing files you shouldn't touch yet

### For Agent Swarms

- Multiple AI agents coordinate automatically via Agent Mail
- No merge conflicts (file reservations prevent simultaneous edits)
- Clear communication (message threading, search history)
- Dependency management (Beads ensures correct task order)

### For Teams

- Human + AI agents in the same system
- Clear audit trail for compliance
- Prevents race conditions on shared files
- Distributed work across projects

---

## Getting Help

- **Tool help**: Every command has `--help` (e.g., `am-send --help`)
- **Examples**: See `examples/workflows/` for real coordination patterns
- **Issues**: Open a GitHub issue for bugs or questions
- **Documentation**: See main `README.md` for complete reference

---

## Summary

You've learned:
- ✅ How to install Jomarchy Agent Tools
- ✅ How to register agents in Agent Mail
- ✅ How to send messages and coordinate
- ✅ How to reserve files to prevent conflicts
- ✅ How to create and manage Beads tasks
- ✅ How to integrate Beads + Agent Mail
- ✅ Common coordination patterns

**Next**: Try the example workflows in `examples/workflows/` to see multi-agent coordination in action!

---

## Quick Reference

### Agent Mail Commands

| Command | Purpose |
|---------|---------|
| `am-register` | Register agent identity |
| `am-whoami` | Check your identity |
| `am-agents` | List all agents |
| `am-send` | Send message |
| `am-inbox` | Check inbox |
| `am-ack` | Acknowledge message |
| `am-reply` | Reply to message |
| `am-search` | Search messages |
| `am-reserve` | Reserve files |
| `am-release` | Release files |
| `am-reservations` | List active reservations |

### Beads Commands

| Command | Purpose |
|---------|---------|
| `bd create` | Create new task |
| `bd list` | List all tasks |
| `bd ready` | Show ready tasks (no blockers) |
| `bd show` | Show task details |
| `bd add` | Add comment to task |
| `bd close` | Close task |
| `bd --help` | Full command reference |

### File Locations

- **Agent Mail DB**: `~/.agent-mail.db`
- **Beads DBs**: `~/code/PROJECT/.beads/beads.db` (per project)
- **Tools**: `~/bin/` or `~/.local/bin/`
- **Slash Commands**: `~/.claude/commands/`

---

**Happy coordinating! 🚀**
