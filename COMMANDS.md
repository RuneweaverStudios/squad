# Agent Command Quick Reference

**7 commands for multi-agent orchestration**

## Getting Help

### `/jat:help` - Command Reference

**Usage:**
```bash
/jat:help                     # Show all commands
/jat:help start               # Show detailed help for specific command
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

### `/jat:start` - Get to Work

**All parameter variations:**
```bash
/jat:start                    # Auto-create new agent (fast!)
/jat:start resume             # Choose from logged-out agents
/jat:start GreatWind          # Resume specific agent by name
/jat:start quick              # Start highest priority task immediately
/jat:start task-abc           # Start specific task (with checks)
/jat:start task-abc quick     # Start specific task (skip checks)
```

**What it does:**
1. Smart registration (auto-create or resume)
2. Session persistence (updates statusline)
3. Task selection (from parameter, context, or priority)
4. Conflict detection (file locks, git, dependencies)
5. Actually starts work (reserves files, sends mail, updates task status)

---

### `/jat:complete` - Finish Task Properly

**Usage:**
```bash
/jat:complete                 # Full verify + commit + close task
```

**What it does:**
- ✅ Verify task (tests, lint, security, browser)
- ✅ Commit changes
- ✅ Write memory entry for future agents
- ✅ Mark task complete in JAT Tasks
- ✅ Release file locks
- ✅ **Session ends** (one agent = one task)

**Output includes:**
```
✅ Task Completed: jat-abc "Add user settings"
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

### `/jat:pause` - Quick Pivot (Context Switch)

**Usage:**
```bash
/jat:pause                    # Quick exit + show menu
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

### `/jat:status` - Check Current Work

**Usage:**
```bash
/jat:status                   # Shows current task, locks, messages
```

**What it shows:**
- Current task progress
- Active file reservations
- Team sync (who's working on what)

---

### `/jat:verify` - Quality Checks

**Usage:**
```bash
/jat:verify                   # Verify current task
/jat:verify task-abc          # Verify specific task
```

**What it checks:**
- Tests (runs test suite)
- Lint (code quality)
- Security (common vulnerabilities)
- Browser (if applicable)

**Note:** Must pass before `/jat:complete`

---

### `/jat:plan` - Convert Planning to Tasks

**Usage:**
```bash
/jat:plan                     # Analyze conversation/PRD, create tasks
```

**What it does:**
- Analyzes conversation history OR written PRD
- Breaks work into atomic, testable tasks
- Creates JAT tasks with proper dependency chains
- Sets priorities (P0 = foundation, P1 = features, P2 = polish)
- Generates task descriptions with acceptance criteria

---

### `/jat:doctor` - Diagnose and Repair jat Setup

**Usage:**
```bash
/jat:doctor                   # Check installation health, fix issues
```

**What it checks:**
- ✅ jat repo exists at `~/code/jat`
- ✅ All 7 shared doc files present (`~/code/jat/shared/*.md`)
- ✅ CLAUDE.md has correct imports
- ✅ Statusline installed (`~/.claude/statusline.sh`)
- ✅ Agent commands installed (`~/.claude/commands/jat/*.md`)
- ✅ Tools symlinked to `~/.local/bin`
- ✅ JAT Tasks initialized in project (`.jat/` directory)

**What it repairs:**
- 🔧 Missing imports in CLAUDE.md (adds all 7)
- 🔧 Malformed imports (fixes paths, typos)
- 🔧 Duplicate imports (removes extras)
- 🔧 Missing statusline (copies from jat)
- 🔧 Missing JAT Tasks (runs `jt init`)

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
✓ JAT Tasks initialized
```

---

## Common Workflows

### Standard Workflow (One Agent = One Task)
```bash
/jat:start task-abc           # Create agent, start task
# ... work on task ...
/jat:complete                 # Complete task, session ends
# Close terminal, spawn new agent for next task
```

### Quick Start (Skip Checks)
```bash
/jat:start task-abc quick     # Skip conflict checks
# ... work on task ...
/jat:complete                 # Complete task
```

### Pivot Mid-Task
```bash
/jat:start task-ui-123        # Working on UI
# Got stuck, need to switch...
/jat:pause                    # Quick save + release locks
# Close terminal, spawn new agent for different task
```

### Multi-Agent Swarm
```bash
# Terminal 1: Agent FrontPeak (frontend task)
/jat:start task-ui-123
# ... work ...
/jat:complete                 # Done, session ends

# Terminal 2: Agent BackStream (backend task)
/jat:start task-api-456
# ... work ...
/jat:complete                 # Done, session ends

# Terminal 3: Agent TestRiver (testing task)
/jat:start task-test-789
# ... work ...
/jat:complete                 # Done, session ends
```

---

## Quick Tips

**Speed:**
- Use `/jat:start quick` for immediate task start (skip conflict checks)
- Use `/jat:start task-abc quick` to start specific task immediately

**Model:**
- One agent = one session = one task
- Spawn new agents for new tasks
- Clean context = better quality work

**Quality:**
- Always run `/jat:verify` before `/jat:complete` for critical work
- `/jat:complete` runs verification automatically

**Coordination:**
- All commands acknowledge Agent Mail (stay synchronized)
- All commands announce completion (team visibility)
- File reservations prevent conflicts automatically

---

## See Also

- **Full Documentation:** `README.md`
- **Shared Docs:** `~/code/jat/shared/*.md` (imported by all projects)
- **Project-Specific Docs:** `CLAUDE.md`
- **Command Implementations:** `commands/jat/*.md`
- **IDE:** Run `jat` to see tasks visually
- **JAT Tasks:** See `README.md` section on JAT Tasks command reference
