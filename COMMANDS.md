# Agent Command Quick Reference

**9 commands for multi-agent orchestration**

## Getting Help

### `/agent:help` - Command Reference

**Usage:**
```bash
/agent:help                     # Show all commands
/agent:help start               # Show detailed help for specific command
```

**What it shows:**
- All 9 agent commands with examples
- Quick tips and common patterns
- Links to full documentation

**When to use:**
- Forgot command syntax
- Learning available commands
- Need quick reference

---

## Core Workflow (4 commands)

### `/agent:start` - Get to Work

**All parameter variations:**
```bash
/agent:start                    # Auto-create new agent (fast!)
/agent:start resume             # Choose from logged-out agents
/agent:start GreatWind          # Resume specific agent by name
/agent:start quick              # Start highest priority task immediately
/agent:start task-abc           # Start specific task (with checks)
/agent:start task-abc quick     # Start specific task (skip checks)
```

**What it does:**
1. Smart registration (auto-create or resume)
2. Session persistence (updates statusline)
3. Task selection (from parameter, context, or priority)
4. Conflict detection (file locks, git, dependencies)
5. Actually starts work (reserves files, sends mail, updates Beads)

---

### `/agent:next` - Drive Mode (Auto-Continue)

**Usage:**
```bash
/agent:next                     # Full verify + commit + auto-start next
/agent:next quick               # Quick commit + auto-start next (skip verify)
```

**What it does:**
- ✅ Verify task (tests, lint, security) - unless quick mode
- ✅ Commit changes
- ✅ Acknowledge all unread Agent Mail
- ✅ Announce completion
- ✅ Mark task complete in Beads
- ✅ Release file locks
- ✅ **Auto-start highest priority task** (continuous flow)

**When to use:**
- Flow state / drive mode
- Sprint work
- High velocity

---

### `/agent:complete` - Finish Properly (Manual Selection)

**Usage:**
```bash
/agent:complete                 # Full verify + show menu + recommended next
```

**What it does:**
- ✅ Verify task (tests, lint, security, browser)
- ✅ Commit changes
- ✅ Acknowledge all unread Agent Mail
- ✅ Announce completion
- ✅ Mark task complete in Beads
- ✅ Release file locks
- ✅ **Show available tasks menu**
- ✅ **Display recommended next task** (you choose)

**Output includes:**
```
✅ Task Completed: jat-abc "Add user settings"
👤 Agent: GreatWind

📋 Recommended Next Task:
   → jat-xyz "Update documentation" (Priority: P1)

   Type: /agent:start jat-xyz
```

**When to use:**
- Want to choose next task manually
- Context switch needed
- Review point
- End of work (before closing terminal)

---

### `/agent:pause` - Quick Pivot (Context Switch)

**Usage:**
```bash
/agent:pause                    # Quick exit + show menu
```

**What it does:**
- ✅ Quick commit/stash (always fast, no verification)
- ✅ Acknowledge all unread Agent Mail
- ✅ Send pause notification
- ✅ Mark task as incomplete (keeps in_progress)
- ✅ Release file locks
- ✅ **Show available tasks menu** (to pivot)

**When to use:**
- Emergency exit (laptop dying)
- Pivot to different work
- Blocked / can't continue
- Context switch

---

## Support Commands (5 commands)

### `/agent:status` - Check Current Work

**Usage:**
```bash
/agent:status                   # Shows current task, locks, messages
```

**What it shows:**
- Current task progress
- Active file reservations
- Unread Agent Mail messages
- Team sync (who's working on what)

---

### `/agent:verify` - Quality Checks

**Usage:**
```bash
/agent:verify                   # Verify current task
/agent:verify task-abc          # Verify specific task
```

**What it checks:**
- Tests (runs test suite)
- Lint (code quality)
- Security (common vulnerabilities)
- Browser (if applicable)

**Note:** Must pass before `/agent:complete`

---

### `/agent:plan` - Convert Planning to Tasks

**Usage:**
```bash
/agent:plan                     # Analyze conversation/PRD, create tasks
```

**What it does:**
- Analyzes conversation history OR written PRD
- Breaks work into atomic, testable tasks
- Creates Beads tasks with proper dependency chains
- Sets priorities (P0 = foundation, P1 = features, P2 = polish)
- Generates task descriptions with acceptance criteria

---

### `/agent:doctor` - Diagnose and Repair jat Setup

**Usage:**
```bash
/agent:doctor                   # Check installation health, fix issues
```

**What it checks:**
- ✅ jat repo exists at `~/code/jat`
- ✅ All 7 shared doc files present (`~/code/jat/shared/*.md`)
- ✅ CLAUDE.md has correct imports
- ✅ Statusline installed (`~/.claude/statusline.sh`)
- ✅ Agent commands installed (`~/.claude/commands/agent/*.md`)
- ✅ Tools symlinked to `~/bin`
- ✅ Beads initialized in project (`.beads/` directory)

**What it repairs:**
- 🔧 Missing imports in CLAUDE.md (adds all 7)
- 🔧 Malformed imports (fixes paths, typos)
- 🔧 Duplicate imports (removes extras)
- 🔧 Missing statusline (copies from jat)
- 🔧 Missing Beads (runs `bd init`)

**When to use:**
- After cloning a new project
- When jat features aren't working
- After updating jat
- Periodic health check

**Output:**
```
## jat Doctor Report

### Status: HEALTHY

### Checks:
✓ jat repo exists
✓ 7 shared docs present
✓ CLAUDE.md has all imports
✓ Statusline installed
✓ Agent commands installed (9)
✓ Tools available
✓ Beads initialized
```

---

## Common Workflows

### Drive Mode (Continuous Flow)
```bash
/agent:start                    # Create agent
/agent:start task-abc           # Start first task
/agent:next                     # Complete + auto-start next
/agent:next                     # Complete + auto-start next
/agent:next                     # Complete + auto-start next
# ... continuous loop, never stops ...
```

### Manual Mode (Careful Selection)
```bash
/agent:start                    # Create agent
/agent:start task-abc           # Start task
/agent:complete                 # Complete + show menu
# Review recommendations...
/agent:start task-xyz           # Pick manually
/agent:complete                 # Complete + show menu
# ... controlled workflow ...
```

### Quick Pivot (Context Switch)
```bash
/agent:start task-ui-123        # Working on UI
# Got stuck, need to switch...
/agent:pause                    # Quick exit + show menu
/agent:start task-bug-456       # Switch to different work
```

### Multi-Agent Coordination
```bash
# Terminal 1: Frontend (drive mode)
/agent:start
/agent:start task-ui-123
/agent:next                     # Auto-continues

# Terminal 2: Backend (manual)
/agent:start resume             # Choose logged-out agent
/agent:start task-api-456
/agent:complete                 # Manual control

# Terminal 3: QA (quick pivot)
/agent:start
/agent:start task-test-789
/agent:pause                    # Switch to urgent bug
/agent:start task-hotfix-001
```

---

## Quick Tips

**Speed:**
- Use `/agent:start quick` for immediate task start (no checks)
- Use `/agent:next quick` for rapid iteration (no verification)

**Control:**
- Use `/agent:complete` when you want to choose next task
- Use `/agent:pause` for emergency exits or context switches

**Quality:**
- Always run `/agent:verify` before `/agent:complete` for critical work
- Let `/agent:next` handle verification automatically (default mode)

**Coordination:**
- All commands acknowledge Agent Mail (stay synchronized)
- All commands announce completion (team visibility)
- File reservations prevent conflicts automatically

---

## See Also

- **Full Documentation:** `README.md`
- **Shared Docs:** `~/code/jat/shared/*.md` (imported by all projects)
- **Project-Specific Docs:** `CLAUDE.md`
- **Command Implementations:** `commands/agent/*.md`
- **Dashboard:** Run `bd-dashboard` to see tasks visually
- **Beads:** See `README.md` section on Beads command reference
