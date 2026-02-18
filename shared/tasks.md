## Integrating with SQUAD Tasks (dependency-aware task planning)

SQUAD provides a lightweight, dependency-aware task database and a CLI (`st`) for selecting "ready work," setting priorities, and tracking status. It works alongside the Agent Registry for identity and file reservations.

### Multi-Project Architecture

**Per-project databases with unified IDE:**
- Each project has its own `.squad/` directory (e.g., `~/code/chimaro/.squad`, `~/code/jomarchy/.squad`)
- Task IDs are prefixed with project name (e.g., `chimaro-abc`, `jomarchy-36j`)
- `st` commands work in your current project directory automatically
- **Unified view**: The SQUAD IDE aggregates all projects from `~/code/*`

**Benefits:**
- Clean separation: Each project's tasks live in its own directory
- Single IDE: View and filter tasks across all projects
- Context-aware: `st` commands always operate on current project
- Visual distinction: Color-coded ID badges show project at a glance

**Working with multiple projects:**
```bash
# Work in chimaro project
cd ~/code/chimaro
st ready                           # Shows only chimaro tasks
st create "Fix OAuth authentication timeout" \
  --type bug \
  --labels security,auth,urgent \
  --priority 1 \
  --description "Users experience timeout when logging in via OAuth. Need to investigate token refresh logic and increase timeout threshold." \
  --assignee "AgentName"
# Creates chimaro-xxx

# Work in jomarchy project
cd ~/code/jomarchy
st ready                           # Shows only jomarchy tasks
st create "Build browser-wait.js - Smart waiting capability" \
  --type task \
  --labels browser,tools,cdp \
  --priority 1 \
  --description "Implement browser-wait.js tool to eliminate race conditions. Supports waiting for: text content, selectors, URL changes, and custom eval conditions. Uses CDP polling with configurable timeouts."
# Creates jomarchy-yyy

# View all projects together
# Open SQUAD IDE in browser to see aggregated view with filtering
```

### Git Integration and .gitignore Best Practices

**Important: Do NOT add `.squad/` to your root `.gitignore`.**

The `.squad/` directory contains:
- **SQLite database** (source of truth) - Ignored via `.squad/.gitignore`
- **Config and metadata files** - These may be committed

The `.squad/.gitignore` file (created by `st init`) handles this automatically by ignoring the SQLite files.

**Standard .gitignore patterns for SQUAD projects:**

Add these patterns to your project's root `.gitignore`:

```gitignore
# Claude Code session-specific files (per-developer, don't commit)
.claude/sessions/agent-*.txt
.claude/sessions/agent-*-activity.jsonl
.claude/sessions/context-*.json  # Epic context (reviewThreshold)
.claude/agent-*.txt  # Legacy location
.mcp.json
```

**What gets committed vs ignored:**

| Path | Committed? | Purpose |
|------|------------|---------|
| `.squad/.gitignore` | ✅ Yes | Ignore rules for SQLite files |
| `.squad/tasks.db*` | ❌ No | SQLite task database (local) |
| `.claude/sessions/agent-*.txt` | ❌ No | Per-session agent identity |
| `.claude/sessions/agent-*-activity.jsonl` | ❌ No | Session activity logs |
| `.claude/sessions/context-*.json` | ❌ No | Epic context (reviewThreshold) |
| `.mcp.json` | ❌ No | Local MCP server configuration |

**Why this matters:**
- No merge conflicts on binary SQLite files
- Session-specific files stay local (different agents per terminal)

### SQUAD Task Commands

**Quick reference for agents to avoid common command errors.**

**Core Commands:**
```bash
# Task creation and management
st create "Title" --type task --priority 1 --description "..."
st list --status open                   # List tasks
st ready --json                         # Get ready tasks
st show task-abc                        # Task details
st update task-abc --status in_progress --assignee AgentName
st close task-abc --reason "Completed"
```

**Dependency Management:**
```bash
# ✅ CORRECT ways to add dependencies
st create "Task" --deps task-xyz        # During creation
st dep add task-abc task-xyz            # After creation (abc depends on xyz)

# View dependencies
st dep tree task-abc                    # What task-abc depends on
st dep tree task-abc --reverse          # What depends on task-abc
st dep cycles                           # Find circular dependencies

# Remove dependency
st dep remove task-abc task-xyz
```

**Common Mistakes:**
```bash
# ❌ WRONG                              # ✅ CORRECT
st add task-abc --depends xyz           st dep add task-abc xyz
st update task-abc --depends xyz        st dep add task-abc xyz
st tree task-abc                        st dep tree task-abc
st update task-abc --status in-progress st update task-abc --status in_progress
```

**Status Values:**
Use **underscores** not hyphens:
- `open` - Available to start
- `in_progress` - Currently being worked on (NOT `in-progress`)
- `blocked` - Waiting on something
- `closed` - Completed

**Common types:** `bug`, `feature`, `task`, `epic`, `chore`, `chat` (conversational/external-channel threads, typically with `/squad:chat`)
**Common labels:** Project-specific (e.g., `security`, `ui`, `backend`, `frontend`, `urgent`)

### Epics: When to Use Hierarchical Tasks

SQUAD Tasks supports parent-child task hierarchies. Child tasks get automatic `.1`, `.2`, `.3` suffixes.

**🚨 CRITICAL: DO NOT USE `--parent` FLAG FOR EPICS**

The `--parent` flag creates dependencies in the **WRONG direction** (children blocked by parent). This is a known issue that will cause agents to try to work on the epic first instead of the children.

```bash
# ❌ WRONG - creates child→parent dependency (children blocked!)
st create "Implement OAuth flow" --parent squad-abc

# ✅ CORRECT - create task first, then add epic→child dependency
st create "Implement OAuth flow" --type task
st dep add squad-abc squad-def   # epic depends on child
```

**⚠️ IMPORTANT: Epic Dependency Direction**

Epics are **blocked by their children**, not the other way around:
- **Children are READY** - Agents can work on them immediately
- **Epic is BLOCKED** - Waiting for all children to complete
- **When all children complete** - Epic becomes READY for verification/UAT

```
CORRECT:                              WRONG:
squad-abc (Epic) - BLOCKED              squad-abc (Epic) - READY ⚠️
  └─ Depends on:                        └─ Blocks:
       → squad-abc.1 [READY]                   ← squad-abc.1 [BLOCKED] ⚠️
       → squad-abc.2 [READY]                   ← squad-abc.2 [BLOCKED] ⚠️
       → squad-abc.3 [READY]                   ← squad-abc.3 [BLOCKED] ⚠️
```

**When to use an Epic:**
- **Cohesive feature** - Tasks that together deliver one user-facing capability
- **Shared context** - Tasks that need the same background/rationale
- **Tracking completion** - Want to see "3/5 done" progress on a feature
- **Parallel work** - Multiple agents could work on subtasks simultaneously

**When standalone tasks are fine:**
- **Unrelated work** - Bug fix + new feature + refactor (no shared theme)
- **Single task** - One piece of work, even if it takes a while
- **Quick fixes** - Small items that don't need grouping

**Rule of thumb:**
```
1 task       → standalone
2-3 related  → could go either way (lean toward epic if they share context)
4+ related   → definitely epic
```

**Creating an Epic with Subtasks (CORRECT Pattern):**
```bash
# 1. Create the epic first (will be blocked by children)
st create "Epic: User authentication system" \
  --type epic \
  --priority 1 \
  --description "Verification task - runs after all subtasks complete"
# Creates: squad-abc (shows as BLOCKED once children exist)

# 2. Create child tasks as separate tasks
st create "Set up Supabase auth config" --type task --priority 0
# Creates: squad-def

st create "Implement Google OAuth flow" --type task --priority 1
# Creates: squad-ghi

st create "Build login UI components" --type task --priority 1
# Creates: squad-jkl

# 3. Set dependencies: Epic depends on children (NOT children depend on epic!)
# USE THE HELPER SCRIPT to avoid direction mistakes:
st-epic-child squad-abc squad-def   # Epic depends on child 1
st-epic-child squad-abc squad-ghi   # Epic depends on child 2
st-epic-child squad-abc squad-jkl   # Epic depends on child 3
# Or raw command (easy to get backwards!): st dep add [epic] [child]

# 4. Set dependencies between children (optional - for sequencing)
st dep add squad-ghi squad-def   # OAuth depends on auth config
st dep add squad-jkl squad-ghi   # UI depends on OAuth

# 5. Verify setup
st show squad-abc
# Should show "Depends on: → squad-def, → squad-ghi, → squad-jkl"
```

**Result:**
- Children (`squad-def`, `squad-ghi`, `squad-jkl`) are READY for agents to pick up
- Epic (`squad-abc`) is BLOCKED until all children complete
- When all children complete → Epic becomes READY for verification

**⚠️ WARNING: Fixing Incorrect Dependencies from --parent Flag**

If you accidentally used `--parent` and need to fix the dependencies:

```bash
# 1. For each child, remove wrong dep and add correct one:
st dep remove squad-abc.1 squad-abc    # Remove child → parent (wrong)
st dep add squad-abc squad-abc.1       # Add parent → child (correct)

# 2. Repeat for all children...

# 3. Verify fix
st show squad-abc
# Should show "Depends on: → squad-abc.1, → squad-abc.2" (epic depends on children)
# NOT "Blocks: ← squad-abc.1, ← squad-abc.2" (epic blocks children - WRONG)
```

**Epic Completion Workflow:**

When all children complete, the epic becomes a **verification task**:
1. Agent picks up the now-unblocked epic
2. Verifies all children are actually complete
3. Runs integration/UAT tests
4. Checks for loose ends (human actions, follow-up tasks)
5. Closes the epic with `/squad:complete`

See `/squad:complete.md` for detailed epic completion templates.

**Reopening Closed Epics:**

The IDE supports **auto-reopening closed epics** when you need to add more work to a completed feature:

**How it works:**
1. IDE shows both open AND closed epics in the "Add to Epic" dropdown
2. Closed epics appear with visual indicators (closed badge, reduced opacity)
3. When you select a closed epic to add a task, the epic is automatically reopened
4. A toast notification confirms: "Task linked to epic (epic was reopened)"

**When to use:**
- **Follow-up bugs** - New bug found in a "completed" feature? Add to the original epic
- **Polish tasks** - Need to add final touches? Reopen the feature epic
- **Scope creep** - Requirements changed after closing? Add tasks to existing epic

**Visual indicators in dropdown:**
```
Open epics:     [P1] squad-abc: User Auth System
Closed epics:   [P1] squad-xyz: Payment Flow (closed)
```

**What happens on reopen:**
- Epic status changes from `closed` to `open`
- Epic is blocked again (depends on the new task)
- Epic only becomes ready again when ALL tasks complete
- No manual intervention needed - just select and link

**API behavior:**
```bash
# IDE API automatically handles reopen
POST /api/tasks/{taskId}/epic
Body: { "epicId": "squad-xyz" }
Response: { "success": true, "epicReopened": true, ... }
```

**CLI equivalent:**
```bash
# Manual steps if not using IDE
st update squad-xyz --status open       # Reopen the epic
st dep add squad-xyz squad-newtask        # Add new task as dependency
```

**Nesting Levels (max 3):**
```
squad-abc           (epic)
├── squad-abc.1     (task or sub-epic)
│   ├── squad-abc.1.1  (task)
│   └── squad-abc.1.2  (task)
├── squad-abc.2     (task)
└── squad-abc.3     (task)
```

**Best Practices:**
- Keep nesting shallow (1 level is usually enough)
- Epic type for parent, task type for children
- Set P0 on foundation tasks, P1 on features
- Epic should describe verification criteria, not implementation work
- Dependencies between siblings enable parallel work

Recommended conventions
- **Single source of truth**: Use **SQUAD Tasks** for task status/priority/dependencies.
- **File declarations**: When starting a task, declare files via `--files` on `st update`. Files are auto-cleared on `st close`.
- **Memory**: Context transfers between sessions via `.squad/memory/` entries, not messaging.

Typical flow (agents)
1) **Pick ready work** (SQUAD Tasks)
   - `st ready --json` → choose one item (highest priority, no blockers)
2) **Start task and declare files**
   - `st update squad-123 --status in_progress --assignee AgentName --files "src/**/*.ts"`
3) **Work on task**
   - Commit regularly
4) **Complete**
   - `st close squad-123 --reason "Completed"` (files auto-cleared)
   - Memory entry written automatically by `/squad:complete`

Mapping cheat-sheet
- **Commit messages**: include task ID for traceability
- **Memory files**: `{date}-{taskId}-{slug}.md` in `.squad/memory/`
