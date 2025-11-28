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
.claude/agent-*.txt
.claude/agent-*-activity.jsonl
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
| `.claude/agent-*.txt` | ❌ No | Per-session agent identity |
| `.claude/agent-*-activity.jsonl` | ❌ No | Session activity logs |
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
