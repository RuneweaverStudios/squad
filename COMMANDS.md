# Agent Command Quick Reference

**7 commands for multi-agent orchestration**

## Getting Help

### `/squad:help` - Command Reference

**Usage:**
```bash
/squad:help                     # Show all commands
/squad:help start               # Show detailed help for specific command
```

**What it shows:**
- All 7 agent commands with examples
- Quick tips and common patterns
- Links to full documentation

**When to use:**
- Forgot command syntax
- Learning available commands
- Need quick reference

---

## Core Workflow (3 commands)

### `/squad:start` - Get to Work

**All parameter variations:**
```bash
/squad:start                    # Auto-create new agent (fast!)
/squad:start resume             # Choose from logged-out agents
/squad:start GreatWind          # Resume specific agent by name
/squad:start quick              # Start highest priority task immediately
/squad:start task-abc           # Start specific task (with checks)
/squad:start task-abc quick     # Start specific task (skip checks)
```

**What it does:**
1. Smart registration (auto-create or resume)
2. Session persistence (updates statusline)
3. Task selection (from parameter, context, or priority)
4. Conflict detection (file locks, git, dependencies)
5. Actually starts work (reserves files, sends mail, updates task status)

---

### `/squad:complete` - Finish Task Properly

**Usage:**
```bash
/squad:complete                 # Full verify + commit + close task
```

**What it does:**
- ✅ Verify task (tests, lint, security, browser)
- ✅ Commit changes
- ✅ Write memory entry for future agents
- ✅ Mark task complete in SQUAD Tasks
- ✅ Release file locks
- ✅ **Session ends** (one agent = one task)

**Output includes:**
```
✅ Task Completed: squad-abc "Add user settings"
👤 Agent: GreatWind

💡 What's next:
   • Close this terminal (session complete)
   • Spawn a new agent from IDE for next task
```

**When to use:**
- Task is complete
- Ready for review
- End of work (session will end)

---

### `/squad:pause` - Quick Pivot (Context Switch)

**Usage:**
```bash
/squad:pause                    # Quick exit + show menu
```

**What it does:**
- ✅ Quick commit/stash (always fast, no verification)
- ✅ Mark task as incomplete (keeps in_progress)
- ✅ Release file locks
- ✅ **Show available tasks menu** (to pivot)

**When to use:**
- Emergency exit (laptop dying)
- Pivot to different work
- Blocked / can't continue
- Context switch

---

## Support Commands (4 commands)

### `/squad:status` - Check Current Work

**Usage:**
```bash
/squad:status                   # Shows current task, locks, messages
```

**What it shows:**
- Current task progress
- Active file reservations
- Team sync (who's working on what)

---

### `/squad:verify` - Quality Checks

**Usage:**
```bash
/squad:verify                   # Verify current task
/squad:verify task-abc          # Verify specific task
```

**What it checks:**
- Tests (runs test suite)
- Lint (code quality)
- Security (common vulnerabilities)
- Browser (if applicable)

**Note:** Must pass before `/squad:complete`

---

### `/squad:plan` - Convert Planning to Tasks

**Usage:**
```bash
/squad:plan                     # Analyze conversation/PRD, create tasks
```

**What it does:**
- Analyzes conversation history OR written PRD
- Breaks work into atomic, testable tasks
- Creates SQUAD tasks with proper dependency chains
- Sets priorities (P0 = foundation, P1 = features, P2 = polish)
- Generates task descriptions with acceptance criteria

---

### `/squad:doctor` - Diagnose and Repair squad Setup

**Usage:**
```bash
/squad:doctor                   # Check installation health, fix issues
```

**What it checks:**
- ✅ squad repo exists at `~/code/squad`
- ✅ All 7 shared doc files present (`~/code/squad/shared/*.md`)
- ✅ CLAUDE.md has correct imports
- ✅ Statusline installed (`~/.claude/statusline.sh`)
- ✅ Agent commands installed (`~/.claude/commands/squad/*.md`)
- ✅ Tools symlinked to `~/.local/bin`
- ✅ SQUAD Tasks initialized in project (`.squad/` directory)

**What it repairs:**
- 🔧 Missing imports in CLAUDE.md (adds all 7)
- 🔧 Malformed imports (fixes paths, typos)
- 🔧 Duplicate imports (removes extras)
- 🔧 Missing statusline (copies from squad)
- 🔧 Missing SQUAD Tasks (runs `st init`)

**When to use:**
- After cloning a new project
- When squad features aren't working
- After updating squad
- Periodic health check

**Output:**
```
## squad Doctor Report

### Status: HEALTHY

### Checks:
✓ squad repo exists
✓ 7 shared docs present
✓ CLAUDE.md has all imports
✓ Statusline installed
✓ Agent commands installed (9)
✓ Tools available
✓ SQUAD Tasks initialized
```

---

## Common Workflows

### Standard Workflow (One Agent = One Task)
```bash
/squad:start task-abc           # Create agent, start task
# ... work on task ...
/squad:complete                 # Complete task, session ends
# Close terminal, spawn new agent for next task
```

### Quick Start (Skip Checks)
```bash
/squad:start task-abc quick     # Skip conflict checks
# ... work on task ...
/squad:complete                 # Complete task
```

### Pivot Mid-Task
```bash
/squad:start task-ui-123        # Working on UI
# Got stuck, need to switch...
/squad:pause                    # Quick save + release locks
# Close terminal, spawn new agent for different task
```

### Multi-Agent Swarm
```bash
# Terminal 1: Agent FrontPeak (frontend task)
/squad:start task-ui-123
# ... work ...
/squad:complete                 # Done, session ends

# Terminal 2: Agent BackStream (backend task)
/squad:start task-api-456
# ... work ...
/squad:complete                 # Done, session ends

# Terminal 3: Agent TestRiver (testing task)
/squad:start task-test-789
# ... work ...
/squad:complete                 # Done, session ends
```

---

## Quick Tips

**Speed:**
- Use `/squad:start quick` for immediate task start (skip conflict checks)
- Use `/squad:start task-abc quick` to start specific task immediately

**Model:**
- One agent = one session = one task
- Spawn new agents for new tasks
- Clean context = better quality work

**Quality:**
- Always run `/squad:verify` before `/squad:complete` for critical work
- `/squad:complete` runs verification automatically

**Coordination:**
- All commands use Agent Registry for identity and file locks
- File reservations prevent conflicts automatically
- Memory system transfers context between sessions

---

## See Also

- **Full Documentation:** `README.md`
- **Shared Docs:** `~/code/squad/shared/*.md` (imported by all projects)
- **Project-Specific Docs:** `CLAUDE.md`
- **Command Implementations:** `commands/squad/*.md`
- **IDE:** Run `squad` to see tasks visually
- **SQUAD Tasks:** See `README.md` section on SQUAD Tasks command reference
