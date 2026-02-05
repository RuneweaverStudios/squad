## Global Statusline

**The statusline automatically displays your agent identity and status for each Claude Code session.**

**Location:** `~/.claude/statusline.sh` (global, works across all projects)
**Source:** `~/code/jat/.claude/statusline.sh` (canonical, edit here)

### How It Works

Each Claude Code session has a unique `session_id`. The statusline uses this to track agent identity independently per session:

```
Session 1: FreeMarsh  | [P1] task-abc - Building dashboard [🔒2 📬1 ⏱45m]
Session 2: PaleStar   | idle [📬3]
Session 3: StrongShore | [P0] task-xyz - Critical bug fix [🔒1]
```

### Registration

When you run `/jat:start`, it automatically:
1. Registers your agent in Agent Mail
2. Writes agent name to `.claude/sessions/agent-{session_id}.txt`
3. Statusline reads from that file and displays your identity

**No manual setup needed** - just run a command and the statusline updates!

### What the Statusline Shows

**Format:** `AgentName | [Priority] Task ID - Task Title [Indicators]`

**Indicators:**
- 🔒N - Active file reservations
- 📬N - Unread messages in inbox
- ⏱Xm/Xh - Time until lock expires
- N% - Task progress (if tracked)

**Examples:**
```
FreeMarsh | [P1] jat-m95 - Update /start... [🔒2 📬1 ⏱45m]
FreeMarsh | idle [📬3]
jat | no agent registered
```

### Multi-Agent Sessions

**Run as many agents as you want simultaneously!** Each session maintains its own identity:

```bash
# Terminal 1
/jat:start  # Choose FreeMarsh
# Statusline shows: FreeMarsh | ...

# Terminal 2
/jat:start  # Choose PaleStar
# Statusline shows: PaleStar | ...

# Terminal 3
/jat:start  # Choose StrongShore
# Statusline shows: StrongShore | ...
```

All three sessions work independently with their own agent identities.

### Files

**Global (shared across all projects):**
- `~/.claude/statusline.sh` - The statusline script (installed by jat)

**Per-session (created automatically):**
- `.claude/sessions/agent-{session_id}.txt` - Your agent name for this session
- `/tmp/claude-session-${PPID}.txt` - PPID-based session ID (process-isolated)

**Don't commit** `agent-*.txt` files to git (they're per-developer session).

### Status Calculation Algorithm

**How the statusline determines what to display:**

```
┌─ STATUS CALCULATION DECISION TREE ─────────────────────────────────────┐
│                                                                        │
│  1. Check if agent is registered                                      │
│     └─ NO → Show "jat | no agent registered"                          │
│     └─ YES → Continue to step 2                                       │
│                                                                        │
│  2. Check JAT Tasks for in_progress tasks assigned to agent           │
│     └─ FOUND → Use task from JAT Tasks (Priority 1 source)            │
│     └─ NOT FOUND → Continue to step 3                                 │
│                                                                        │
│  3. Check file reservations for task ID in reason field               │
│     └─ FOUND → Extract task ID, lookup in JAT Tasks (Priority 2)      │
│     └─ NOT FOUND → Continue to step 4                                 │
│                                                                        │
│  4. No active task found                                              │
│     └─ Show "AgentName | idle"                                        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Priority Order:**
1. **Agent Registration** - `.claude/sessions/agent-{session_id}.txt` exists?
2. **Task in_progress** - `jt list --json | filter(assignee == agent && status == "in_progress")`
3. **File Reservations** - `am-reservations --agent X | extract task ID from reason`
4. **Idle State** - Agent registered but no work

**Git Display Colors:**

| Element | Color | ANSI Code |
|---------|-------|-----------|
| Folder name | Blue | `\033[0;34m` |
| @ separator | Dim Gray | `\033[0;90m` |
| Branch name | Green | `\033[0;32m` |
| Dirty indicator (*) | Red | `\033[0;31m` |

Example: `jat@master*` → blue `jat`, dim `@`, green `master`, red `*`

**Indicator Colors:**

```
🔒 File Locks:     Cyan (1-2) | Yellow (3-5) | Red (>5)
📬 Unread Messages: Cyan (1-5) | Yellow (6-15) | Red (>15)
⏱ Time Remaining:  Green (>30m) | Yellow (10-30m) | Red (<10m)
📊 Task Progress:   Red (<25%) | Yellow (25-75%) | Green (>75%)
```

**Troubleshooting:**

| Issue | Cause | Fix |
|-------|-------|-----|
| Shows "idle" but I'm working | Task not marked `in_progress` | Run `jt update task-id --status in_progress` |
| Shows wrong task | Old reservation from previous task | Release stale reservation with `am-release` |
| Shows "no agent registered" | Session file missing | Run `/jat:start` to register |

### Why PPID-Based Session Tracking?

Each Claude Code session runs in a unique process with its own Parent Process ID (PPID). We use this for isolation:

```bash
# Terminal 1: PPID = 12345
/tmp/claude-session-12345.txt → "session-abc"

# Terminal 2: PPID = 67890
/tmp/claude-session-67890.txt → "session-xyz"

# No conflicts! Each process has its own file.
```
