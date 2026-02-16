## Integrating with JAT Tasks (dependency-aware task planning)

JAT provides a lightweight, dependency-aware task database and a CLI (`jt`) for selecting "ready work," setting priorities, and tracking status. It works alongside the Agent Registry for identity and file reservations.

### Multi-Project Architecture

**Per-project databases with unified IDE:**
- Each project has its own `.jat/` directory (e.g., `~/code/chimaro/.jat`, `~/code/jomarchy/.jat`)
- Task IDs are prefixed with project name (e.g., `chimaro-abc`, `jomarchy-36j`)
- `jt` commands work in your current project directory automatically
- **Unified view**: The JAT IDE aggregates all projects from `~/code/*`

**Benefits:**
- Clean separation: Each project's tasks live in its own directory
- Single IDE: View and filter tasks across all projects
- Context-aware: `jt` commands always operate on current project
- Visual distinction: Color-coded ID badges show project at a glance

**Working with multiple projects:**
```bash
# Work in chimaro project
cd ~/code/chimaro
jt ready                           # Shows only chimaro tasks
jt create "Fix OAuth authentication timeout" \
  --type bug \
  --labels security,auth,urgent \
  --priority 1 \
  --description "Users experience timeout when logging in via OAuth. Need to investigate token refresh logic and increase timeout threshold." \
  --assignee "AgentName"
# Creates chimaro-xxx

# Work in jomarchy project
cd ~/code/jomarchy
jt ready                           # Shows only jomarchy tasks
jt create "Build browser-wait.js - Smart waiting capability" \
  --type task \
  --labels browser,tools,cdp \
  --priority 1 \
  --description "Implement browser-wait.js tool to eliminate race conditions. Supports waiting for: text content, selectors, URL changes, and custom eval conditions. Uses CDP polling with configurable timeouts."
# Creates jomarchy-yyy

# View all projects together
# Open JAT IDE in browser to see aggregated view with filtering
```

### Git Integration and .gitignore Best Practices

**Important: Do NOT add `.jat/` to your root `.gitignore`.**

The `.jat/` directory contains:
- **SQLite database** (source of truth) - Ignored via `.jat/.gitignore`
- **Config and metadata files** - These may be committed

The `.jat/.gitignore` file (created by `jt init`) handles this automatically by ignoring the SQLite files.

**Standard .gitignore patterns for JAT projects:**

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
| `.jat/.gitignore` | ✅ Yes | Ignore rules for SQLite files |
| `.jat/tasks.db*` | ❌ No | SQLite task database (local) |
| `.claude/sessions/agent-*.txt` | ❌ No | Per-session agent identity |
| `.claude/sessions/agent-*-activity.jsonl` | ❌ No | Session activity logs |
| `.claude/sessions/context-*.json` | ❌ No | Epic context (reviewThreshold) |
| `.mcp.json` | ❌ No | Local MCP server configuration |

**Why this matters:**
- No merge conflicts on binary SQLite files
- Session-specific files stay local (different agents per terminal)

### JAT Task Commands

**Quick reference for agents to avoid common command errors.**

**Core Commands:**
```bash
# Task creation and management
jt create "Title" --type task --priority 1 --description "..."
jt list --status open                   # List tasks
jt ready --json                         # Get ready tasks
jt show task-abc                        # Task details
jt update task-abc --status in_progress --assignee AgentName
jt close task-abc --reason "Completed"
```

**Dependency Management:**
```bash
# ✅ CORRECT ways to add dependencies
jt create "Task" --deps task-xyz        # During creation
jt dep add task-abc task-xyz            # After creation (abc depends on xyz)

# View dependencies
jt dep tree task-abc                    # What task-abc depends on
jt dep tree task-abc --reverse          # What depends on task-abc
jt dep cycles                           # Find circular dependencies

# Remove dependency
jt dep remove task-abc task-xyz
```

**Common Mistakes:**
```bash
# ❌ WRONG                              # ✅ CORRECT
jt add task-abc --depends xyz           jt dep add task-abc xyz
jt update task-abc --depends xyz        jt dep add task-abc xyz
jt tree task-abc                        jt dep tree task-abc
jt update task-abc --status in-progress jt update task-abc --status in_progress
```

**Status Values:**
Use **underscores** not hyphens:
- `open` - Available to start
- `in_progress` - Currently being worked on (NOT `in-progress`)
- `blocked` - Waiting on something
- `closed` - Completed

**Common types:** `bug`, `feature`, `task`, `epic`, `chore`, `chat` (conversational/external-channel threads, typically with `/jat:chat`)
**Common labels:** Project-specific (e.g., `security`, `ui`, `backend`, `frontend`, `urgent`)

### Epics: When to Use Hierarchical Tasks

JAT Tasks supports parent-child task hierarchies. Child tasks get automatic `.1`, `.2`, `.3` suffixes.

**🚨 CRITICAL: DO NOT USE `--parent` FLAG FOR EPICS**

The `--parent` flag creates dependencies in the **WRONG direction** (children blocked by parent). This is a known issue that will cause agents to try to work on the epic first instead of the children.

```bash
# ❌ WRONG - creates child→parent dependency (children blocked!)
jt create "Implement OAuth flow" --parent jat-abc

# ✅ CORRECT - create task first, then add epic→child dependency
jt create "Implement OAuth flow" --type task
jt dep add jat-abc jat-def   # epic depends on child
```

**⚠️ IMPORTANT: Epic Dependency Direction**

Epics are **blocked by their children**, not the other way around:
- **Children are READY** - Agents can work on them immediately
- **Epic is BLOCKED** - Waiting for all children to complete
- **When all children complete** - Epic becomes READY for verification/UAT

```
CORRECT:                              WRONG:
jat-abc (Epic) - BLOCKED              jat-abc (Epic) - READY ⚠️
  └─ Depends on:                        └─ Blocks:
       → jat-abc.1 [READY]                   ← jat-abc.1 [BLOCKED] ⚠️
       → jat-abc.2 [READY]                   ← jat-abc.2 [BLOCKED] ⚠️
       → jat-abc.3 [READY]                   ← jat-abc.3 [BLOCKED] ⚠️
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
jt create "Epic: User authentication system" \
  --type epic \
  --priority 1 \
  --description "Verification task - runs after all subtasks complete"
# Creates: jat-abc (shows as BLOCKED once children exist)

# 2. Create child tasks as separate tasks
jt create "Set up Supabase auth config" --type task --priority 0
# Creates: jat-def

jt create "Implement Google OAuth flow" --type task --priority 1
# Creates: jat-ghi

jt create "Build login UI components" --type task --priority 1
# Creates: jat-jkl

# 3. Set dependencies: Epic depends on children (NOT children depend on epic!)
# USE THE HELPER SCRIPT to avoid direction mistakes:
jt-epic-child jat-abc jat-def   # Epic depends on child 1
jt-epic-child jat-abc jat-ghi   # Epic depends on child 2
jt-epic-child jat-abc jat-jkl   # Epic depends on child 3
# Or raw command (easy to get backwards!): jt dep add [epic] [child]

# 4. Set dependencies between children (optional - for sequencing)
jt dep add jat-ghi jat-def   # OAuth depends on auth config
jt dep add jat-jkl jat-ghi   # UI depends on OAuth

# 5. Verify setup
jt show jat-abc
# Should show "Depends on: → jat-def, → jat-ghi, → jat-jkl"
```

**Result:**
- Children (`jat-def`, `jat-ghi`, `jat-jkl`) are READY for agents to pick up
- Epic (`jat-abc`) is BLOCKED until all children complete
- When all children complete → Epic becomes READY for verification

**⚠️ WARNING: Fixing Incorrect Dependencies from --parent Flag**

If you accidentally used `--parent` and need to fix the dependencies:

```bash
# 1. For each child, remove wrong dep and add correct one:
jt dep remove jat-abc.1 jat-abc    # Remove child → parent (wrong)
jt dep add jat-abc jat-abc.1       # Add parent → child (correct)

# 2. Repeat for all children...

# 3. Verify fix
jt show jat-abc
# Should show "Depends on: → jat-abc.1, → jat-abc.2" (epic depends on children)
# NOT "Blocks: ← jat-abc.1, ← jat-abc.2" (epic blocks children - WRONG)
```

**Epic Completion Workflow:**

When all children complete, the epic becomes a **verification task**:
1. Agent picks up the now-unblocked epic
2. Verifies all children are actually complete
3. Runs integration/UAT tests
4. Checks for loose ends (human actions, follow-up tasks)
5. Closes the epic with `/jat:complete`

See `/jat:complete.md` for detailed epic completion templates.

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
Open epics:     [P1] jat-abc: User Auth System
Closed epics:   [P1] jat-xyz: Payment Flow (closed)
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
Body: { "epicId": "jat-xyz" }
Response: { "success": true, "epicReopened": true, ... }
```

**CLI equivalent:**
```bash
# Manual steps if not using IDE
jt update jat-xyz --status open       # Reopen the epic
jt dep add jat-xyz jat-newtask        # Add new task as dependency
```

**Nesting Levels (max 3):**
```
jat-abc           (epic)
├── jat-abc.1     (task or sub-epic)
│   ├── jat-abc.1.1  (task)
│   └── jat-abc.1.2  (task)
├── jat-abc.2     (task)
└── jat-abc.3     (task)
```

**Best Practices:**
- Keep nesting shallow (1 level is usually enough)
- Epic type for parent, task type for children
- Set P0 on foundation tasks, P1 on features
- Epic should describe verification criteria, not implementation work
- Dependencies between siblings enable parallel work

Recommended conventions
- **Single source of truth**: Use **JAT Tasks** for task status/priority/dependencies.
- **File declarations**: When starting a task, declare files via `--files` on `jt update`. Files are auto-cleared on `jt close`.
- **Memory**: Context transfers between sessions via `.jat/memory/` entries, not messaging.

Typical flow (agents)
1) **Pick ready work** (JAT Tasks)
   - `jt ready --json` → choose one item (highest priority, no blockers)
2) **Start task and declare files**
   - `jt update jat-123 --status in_progress --assignee AgentName --files "src/**/*.ts"`
3) **Work on task**
   - Commit regularly
4) **Complete**
   - `jt close jat-123 --reason "Completed"` (files auto-cleared)
   - Memory entry written automatically by `/jat:complete`

Mapping cheat-sheet
- **Commit messages**: include task ID for traceability
- **Memory files**: `{date}-{taskId}-{slug}.md` in `.jat/memory/`
