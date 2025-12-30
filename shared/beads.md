## Integrating with Beads (dependency-aware task planning)

Beads provides a lightweight, dependency-aware issue database and a CLI (`bd`) for selecting "ready work," setting priorities, and tracking status. It complements Agent Mail's messaging, audit trail, and file-reservation signals. Project: [steveyegge/beads](https://github.com/steveyegge/beads)

### Multi-Project Architecture

**Per-project databases with unified dashboard:**
- Each project has its own `.beads/` directory (e.g., `~/code/chimaro/.beads`, `~/code/jomarchy/.beads`)
- Task IDs are prefixed with project name (e.g., `chimaro-abc`, `jomarchy-36j`)
- `bd` commands work in your current project directory automatically
- **Unified view**: Chimaro's development dashboard aggregates all projects from `~/code/*`
- Access at: `http://localhost:5173/account/development/beads` (when running Chimaro)

**Benefits:**
- Clean separation: Each project's tasks are committable to its own git repo
- Single dashboard: View and filter tasks across all projects
- Context-aware: `bd` commands always operate on current project
- Visual distinction: Color-coded ID badges show project at a glance

**Working with multiple projects:**
```bash
# Work in chimaro project
cd ~/code/chimaro
bd ready                           # Shows only chimaro tasks
bd create "Fix OAuth authentication timeout" \
  --type bug \
  --labels security,auth,urgent \
  --priority 1 \
  --description "Users experience timeout when logging in via OAuth. Need to investigate token refresh logic and increase timeout threshold." \
  --assignee "AgentName"
# Creates chimaro-xxx

# Work in jomarchy project
cd ~/code/jomarchy
bd ready                           # Shows only jomarchy tasks
bd create "Build browser-wait.js - Smart waiting capability" \
  --type task \
  --labels browser,tools,cdp \
  --priority 1 \
  --description "Implement browser-wait.js tool to eliminate race conditions. Supports waiting for: text content, selectors, URL changes, and custom eval conditions. Uses CDP polling with configurable timeouts."
# Creates jomarchy-yyy

# View all projects together
# Open Chimaro dashboard in browser to see aggregated view with filtering
```

### Git Integration and .gitignore Best Practices

**Important: Do NOT add `.beads/` to your root `.gitignore`.**

Beads is designed to sync task data via git. The `.beads/` directory contains:
- **JSONL files** (source of truth) - These ARE committed and synced via git
- **SQLite database** (local cache) - These are NOT committed

The `.beads/.gitignore` file (created by `bd init`) handles this automatically by ignoring the SQLite files while allowing JSONL tracking.

**Standard .gitignore patterns for JAT projects:**

Add these patterns to your project's root `.gitignore`:

```gitignore
# Claude Code session-specific files (per-developer, don't commit)
.claude/sessions/agent-*.txt
.claude/sessions/agent-*-activity.jsonl
.claude/sessions/context-*.json  # Epic context (reviewThreshold)
.claude/agent-*.txt  # Legacy location
.mcp.json

# Beads: JSONL files are committed (source of truth), SQLite is local cache
# The .beads/.gitignore handles ignoring db files while tracking jsonl
```

**What gets committed vs ignored:**

| Path | Committed? | Purpose |
|------|------------|---------|
| `.beads/issues.jsonl` | ✅ Yes | Task data - syncs across machines |
| `.beads/config.yaml` | ✅ Yes | Project Beads configuration |
| `.beads/metadata.json` | ✅ Yes | Repository and clone IDs |
| `.beads/.gitignore` | ✅ Yes | Ignore rules for SQLite files |
| `.beads/beads.db*` | ❌ No | Local SQLite cache (auto-rebuilt) |
| `.claude/sessions/agent-*.txt` | ❌ No | Per-session agent identity |
| `.claude/sessions/agent-*-activity.jsonl` | ❌ No | Session activity logs |
| `.claude/sessions/context-*.json` | ❌ No | Epic context (reviewThreshold) |
| `.mcp.json` | ❌ No | Local MCP server configuration |

**Why this matters:**
- Task assignments, priorities, and status sync across all developers
- No merge conflicts on binary SQLite files
- Each developer's local cache rebuilds automatically from JSONL
- Session-specific files stay local (different agents per terminal)

### Beads Commands

**Quick reference for agents to avoid common command errors.**

**Core Commands:**
```bash
# Task creation and management
bd create "Title" --type task --priority 1 --description "..."
bd list --status open                   # List tasks
bd ready --json                         # Get ready tasks
bd show task-abc                        # Task details
bd update task-abc --status in_progress --assignee AgentName
bd close task-abc --reason "Completed"
```

**Dependency Management:**
```bash
# ✅ CORRECT ways to add dependencies
bd create "Task" --deps task-xyz        # During creation
bd dep add task-abc task-xyz            # After creation (abc depends on xyz)

# View dependencies
bd dep tree task-abc                    # What task-abc depends on
bd dep tree task-abc --reverse          # What depends on task-abc
bd dep cycles                           # Find circular dependencies

# Remove dependency
bd dep remove task-abc task-xyz
```

**Common Mistakes:**
```bash
# ❌ WRONG                              # ✅ CORRECT
bd add task-abc --depends xyz           bd dep add task-abc xyz
bd update task-abc --depends xyz        bd dep add task-abc xyz
bd tree task-abc                        bd dep tree task-abc
bd update task-abc --status in-progress bd update task-abc --status in_progress
```

**Status Values:**
Use **underscores** not hyphens:
- `open` - Available to start
- `in_progress` - Currently being worked on (NOT `in-progress`)
- `blocked` - Waiting on something
- `closed` - Completed

**Common types:** `bug`, `feature`, `task`, `epic`, `chore`
**Common labels:** Project-specific (e.g., `security`, `ui`, `backend`, `frontend`, `urgent`)

### Epics: When to Use Hierarchical Tasks

Beads supports parent-child task hierarchies. Child tasks get automatic `.1`, `.2`, `.3` suffixes.

**🚨 CRITICAL: DO NOT USE `--parent` FLAG FOR EPICS**

The `--parent` flag creates dependencies in the **WRONG direction** (children blocked by parent). This is a known issue that will cause agents to try to work on the epic first instead of the children.

```bash
# ❌ WRONG - creates child→parent dependency (children blocked!)
bd create "Implement OAuth flow" --parent jat-abc

# ✅ CORRECT - create task first, then add epic→child dependency
bd create "Implement OAuth flow" --type task
bd dep add jat-abc jat-def   # epic depends on child
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
bd create "Epic: User authentication system" \
  --type epic \
  --priority 1 \
  --description "Verification task - runs after all subtasks complete"
# Creates: jat-abc (shows as BLOCKED once children exist)

# 2. Create child tasks as separate tasks
bd create "Set up Supabase auth config" --type task --priority 0
# Creates: jat-def

bd create "Implement Google OAuth flow" --type task --priority 1
# Creates: jat-ghi

bd create "Build login UI components" --type task --priority 1
# Creates: jat-jkl

# 3. Set dependencies: Epic depends on children (NOT children depend on epic!)
# USE THE HELPER SCRIPT to avoid direction mistakes:
bd-epic-child jat-abc jat-def   # Epic depends on child 1
bd-epic-child jat-abc jat-ghi   # Epic depends on child 2
bd-epic-child jat-abc jat-jkl   # Epic depends on child 3
# Or raw command (easy to get backwards!): bd dep add [epic] [child]

# 4. Set dependencies between children (optional - for sequencing)
bd dep add jat-ghi jat-def   # OAuth depends on auth config
bd dep add jat-jkl jat-ghi   # UI depends on OAuth

# 5. Verify setup
bd show jat-abc
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
bd dep remove jat-abc.1 jat-abc    # Remove child → parent (wrong)
bd dep add jat-abc jat-abc.1       # Add parent → child (correct)

# 2. Repeat for all children...

# 3. Verify fix
bd show jat-abc
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

The dashboard supports **auto-reopening closed epics** when you need to add more work to a completed feature:

**How it works:**
1. Dashboard shows both open AND closed epics in the "Add to Epic" dropdown
2. Closed epics appear with visual indicators (📦 icon, "closed" badge, reduced opacity)
3. When you select a closed epic to add a task, the epic is automatically reopened
4. A toast notification confirms: "Task linked to epic (epic was reopened)"

**When to use:**
- **Follow-up bugs** - New bug found in a "completed" feature? Add to the original epic
- **Polish tasks** - Need to add final touches? Reopen the feature epic
- **Scope creep** - Requirements changed after closing? Add tasks to existing epic

**Visual indicators in dropdown:**
```
Open epics:     [P1] jat-abc: User Auth System
Closed epics:   [P1] 📦 jat-xyz: Payment Flow (closed)
```

**What happens on reopen:**
- Epic status changes from `closed` to `open`
- Epic is blocked again (depends on the new task)
- Epic only becomes ready again when ALL tasks complete
- No manual intervention needed - just select and link

**API behavior:**
```bash
# Dashboard API automatically handles reopen
POST /api/tasks/{taskId}/epic
Body: { "epicId": "jat-xyz" }
Response: { "success": true, "epicReopened": true, ... }
```

**CLI equivalent:**
```bash
# Manual steps if not using dashboard
bd update jat-xyz --status open       # Reopen the epic
bd dep add jat-xyz jat-newtask        # Add new task as dependency
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
- **Single source of truth**: Use **Beads** for task status/priority/dependencies; use **Agent Mail** for conversation, decisions, and attachments (audit).
- **Shared identifiers**: Use the Beads issue id (e.g., `bd-123`) as the Mail `thread_id` and prefix message subjects with `[bd-123]`.
- **Reservations**: When starting a `bd-###` task, use `am-reserve` for the affected paths; include the issue id in the `--reason` and release on completion with `am-release`.

Typical flow (agents)
1) **Pick ready work** (Beads)
   - `bd ready --json` → choose one item (highest priority, no blockers)
2) **Reserve edit surface** (Agent Mail)
   - `am-reserve src/**/*.ts --agent AgentName --ttl 3600 --exclusive --reason "bd-123"`
3) **Announce start** (Agent Mail)
   - `am-send "[bd-123] Start: <short title>" "Starting work on..." --from AgentName --to Team --thread bd-123`
4) **Work and update**
   - Reply in-thread with progress: `am-reply message-id "Progress update..." --agent AgentName`
5) **Complete and release**
   - `bd close bd-123 --reason "Completed"` (Beads is status authority)
   - `am-release src/**/*.ts --agent AgentName`
   - Final Mail reply: `am-send "[bd-123] Completed" "Summary..." --from AgentName --to Team --thread bd-123`

Mapping cheat-sheet
- **Mail `thread_id`** ↔ `bd-###`
- **Mail subject**: `[bd-###] …`
- **File reservation `reason`**: `bd-###`
- **Commit messages (optional)**: include `bd-###` for traceability

Event mirroring (optional automation)
- On `bd update --status blocked`, send a high-importance Mail message in thread `bd-###` describing the blocker.
- On Mail "ACK overdue" for a critical decision, add a Beads label (e.g., `needs-ack`) or bump priority to surface it in `bd ready`.

Pitfalls to avoid
- Don't create or manage tasks in Mail; treat Beads as the single task queue.
- Always include `bd-###` in message `thread_id` to avoid ID drift across tools.
