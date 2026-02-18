## squad-scheduler: Automated Task Scheduling Daemon

The scheduler polls task databases across all SQUAD projects and automatically spawns agent sessions for due tasks. It supports both **recurring tasks** (cron-based) and **one-shot scheduled tasks**.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SCHEDULER ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  squad-scheduler daemon (Node.js)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Discover projects (~/code/*/.squad/tasks.db + projects.json)     │   │
│  │  2. Query each DB: next_run_at <= now AND status = 'open'          │   │
│  │  3. For recurring tasks (schedule_cron):                            │   │
│  │     → Create child instance task                                    │   │
│  │     → Spawn child via POST /api/work/spawn                          │   │
│  │     → Compute next run from cron expression                         │   │
│  │  4. For one-shot tasks (no cron):                                   │   │
│  │     → Spawn directly via POST /api/work/spawn                       │   │
│  │     → Clear next_run_at                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Runs in tmux session: server-scheduler                                     │
│  HTTP control API on port 3334                                              │
│  Polls every 30 seconds (configurable)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# Start scheduler via CLI
squad scheduler start

# Check status
squad scheduler status

# Stop
squad scheduler stop

# View logs (Ctrl+B D to detach)
squad scheduler logs

# Auto-start on IDE launch (set once)
# Add to ~/.config/squad/projects.json:
#   "defaults": { "scheduler_autostart": true }
```

### How Task Scheduling Works

Scheduling uses fields on the existing `tasks` table - no separate scheduling table.

**Scheduler-relevant task fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `schedule_cron` | TEXT | Cron expression for recurring tasks (e.g., `0 9 * * *`) |
| `next_run_at` | TEXT | ISO datetime of next run (set by scheduler or manually) |
| `command` | TEXT | Command to run (default: `/squad:start`) |
| `agent_program` | TEXT | Agent to use (e.g., `claude-code`) |
| `model` | TEXT | Model override (e.g., `opus`, `sonnet`, `haiku`) |

**A task is "due" when:** `next_run_at <= now AND status = 'open'`

### Recurring vs One-Shot Tasks

#### Recurring Tasks (cron-based)

Set `schedule_cron` to a cron expression. The scheduler will:

1. Create a **child instance task** inheriting parent's command/agent_program/model/labels
2. Spawn the child via the IDE spawn API
3. Compute the next `next_run_at` from the cron expression
4. Parent stays `open` and fires again at the next scheduled time

```
Parent task: "Daily Code Review" (schedule_cron: "0 9 * * *")
  │
  ├─ Child: "Daily Code Review (2/9/2026)" → spawned, agent works on it
  ├─ Child: "Daily Code Review (2/10/2026)" → next occurrence
  └─ ...repeats indefinitely
```

**Child task properties:**
- ID: `{project-prefix}-{random5chars}` (e.g., `squad-x4k7a`)
- Title: `{parent title} ({today's date})`
- Inherits: priority, issue_type, command, agent_program, model, labels
- `parent_id` set to parent task ID
- No `schedule_cron` (child is a one-time instance)

#### One-Shot Tasks

Set `next_run_at` but leave `schedule_cron` empty. The scheduler will:

1. Spawn the task directly
2. Clear `next_run_at` so it doesn't fire again

Use one-shot for tasks you want to schedule for a specific future time without recurrence.

### Cron Expression Reference

Standard 5-field cron format: `minute hour day-of-month month day-of-week`

| Expression | Schedule |
|-----------|----------|
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 * * 0` | Weekly on Sunday at midnight |
| `0 9,17 * * *` | Daily at 9 AM and 5 PM |
| `0 0 1 * *` | Monthly on the 1st at midnight |

**Timezone:** Cron expressions respect the timezone configured in `~/.config/squad/projects.json` under `defaults.timezone` (default: `UTC`).

### Configuration

**User config:** `~/.config/squad/projects.json`

```json
{
  "defaults": {
    "timezone": "America/New_York",
    "scheduler_autostart": true
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `defaults.timezone` | `UTC` | IANA timezone for cron calculations |
| `defaults.scheduler_autostart` | `false` | Auto-start scheduler when `squad` IDE launches |

### CLI Commands

```bash
squad scheduler              # Show status (default)
squad scheduler start        # Start the daemon in tmux session
squad scheduler stop         # Kill the tmux session
squad scheduler restart      # Stop + start
squad scheduler logs         # Attach to tmux session (Ctrl+B D to detach)
```

The scheduler runs in tmux session `server-scheduler`. It appears in the IDE's Servers page alongside dev servers.

### Scheduler Daemon Arguments

The daemon (`tools/scheduler/index.js`) accepts these CLI arguments:

| Argument | Default | Description |
|----------|---------|-------------|
| `--poll-interval 30` | `30` | Polling interval in seconds |
| `--port 3334` | `3334` | HTTP control API port |
| `--ide-url http://127.0.0.1:3333` | `http://127.0.0.1:3333` | IDE API base URL |
| `--verbose` | off | Enable debug logging |
| `--dry-run` | off | Log what would happen without actually spawning |

### HTTP Control API

The daemon exposes a lightweight HTTP API on port 3334 (localhost only).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Scheduler status, poll count, recent spawns |
| `POST` | `/start` | Resume polling (if paused) |
| `POST` | `/stop` | Pause polling |
| `POST` | `/poll` | Trigger an immediate poll |

**Status response:**
```json
{
  "running": true,
  "pollInterval": 30,
  "pollCount": 142,
  "lastPoll": "2026-02-09T15:30:00.000Z",
  "recentSpawns": [
    { "taskId": "squad-abc", "childId": "squad-x4k7a", "project": "squad", "time": "...", "result": "ok" }
  ],
  "projectCount": 3,
  "uptime": 7200.5
}
```

### IDE API Endpoints

The IDE provides REST endpoints for managing the scheduler from the UI.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scheduler/start` | Start scheduler (creates tmux session) |
| `POST` | `/api/scheduler/stop` | Stop scheduler (kills tmux session) |
| `GET` | `/api/scheduler/status` | Running state, uptime, scheduled task count, next run |

**Status response from IDE:**
```json
{
  "running": true,
  "uptime": 3661,
  "sessionCreated": "2026-02-09T12:00:00.000Z",
  "scheduledCount": 5,
  "nextRun": {
    "taskId": "squad-abc",
    "taskTitle": "Daily Code Review",
    "nextRunAt": "2026-02-10T09:00:00.000Z",
    "scheduleCron": "0 9 * * *"
  },
  "timestamp": "2026-02-09T15:30:00.000Z"
}
```

### IDE Servers Page

The scheduler status is displayed on the `/servers` page in the IDE:

- **Running/Stopped badge** with color indicator
- **Uptime counter** (auto-refreshing)
- **Next scheduled task** with countdown timer
- **Start/Stop buttons** for quick control

### Creating Scheduled Tasks

#### Via IDE Task Creation Drawer

The task creation UI includes scheduling fields:

1. Set **Schedule (Cron)** to a cron expression (e.g., `0 9 * * *`)
2. Optionally set **Command** (default: `/squad:start`)
3. Optionally set **Agent Program** and **Model** overrides

The scheduler picks up the task on the next poll.

#### Via CLI

```bash
# Create a recurring task
st create "Daily Code Review" \
  --type chore \
  --priority 2 \
  --description "Review all open PRs and check CI status"

# Then manually set schedule fields (st doesn't have --schedule flag yet):
# Use the IDE Task Detail drawer to set schedule_cron and next_run_at
```

#### Via Direct Database Update

```bash
# Set cron schedule on existing task
sqlite3 .squad/tasks.db "UPDATE tasks SET schedule_cron='0 9 * * *', next_run_at='$(date -u +%Y-%m-%dT%H:%M:%SZ)' WHERE id='squad-abc'"
```

### Project Discovery

The scheduler discovers projects in two ways:

1. **Filesystem scan:** Scans `~/code/` for directories containing `.squad/tasks.db`
2. **Config file:** Reads `~/.config/squad/projects.json` for projects with custom paths

Hidden projects (`"hidden": true` in config) are skipped.

### Task Lifecycle Examples

#### Recurring Task

```
1. Create task with schedule_cron="0 9 * * *"
   → Scheduler sets next_run_at to tomorrow 9 AM

2. Poll at 9:30 AM: next_run_at (09:00) <= now (09:30) ✓
   → Create child: "Daily Report (2/9/2026)" with new ID squad-x4k7a
   → Spawn child via POST /api/work/spawn
   → Update parent: next_run_at = tomorrow 9:00 AM

3. Child task squad-x4k7a runs in its own agent session
   → Agent works on it, completes via /squad:complete
   → Parent task stays open for next recurrence

4. Repeat daily...
```

#### One-Shot Scheduled Task

```
1. Create task with next_run_at="2026-02-10T14:00:00Z" (no schedule_cron)

2. Poll at 2:30 PM on Feb 10: next_run_at (14:00) <= now (14:30) ✓
   → Spawn task directly
   → Clear next_run_at (set to NULL)

3. Task runs once, never fires again
```

### Error Handling

- **Spawn failures** don't prevent the parent's `next_run_at` from being updated. The next recurrence will still fire on schedule.
- **Database errors** are caught per-project; a broken DB in one project won't affect others.
- **Port conflicts:** If port 3334 is in use, the scheduler runs without the HTTP API (polling still active).
- **Graceful shutdown:** Handles SIGINT and SIGTERM cleanly.

### Files Reference

| Path | Purpose |
|------|---------|
| `tools/scheduler/index.js` | Main scheduler daemon (238 lines) |
| `tools/scheduler/lib/db.js` | Database operations (162 lines) |
| `tools/scheduler/lib/cron.js` | Cron expression utilities (55 lines) |
| `tools/scheduler/run.sh` | Bash launcher (auto-installs deps) |
| `tools/scheduler/package.json` | Dependencies: better-sqlite3, cron-parser |
| `ide/src/routes/api/scheduler/start/+server.js` | IDE start endpoint |
| `ide/src/routes/api/scheduler/stop/+server.js` | IDE stop endpoint |
| `ide/src/routes/api/scheduler/status/+server.js` | IDE status endpoint |
| `ide/src/routes/servers/+page.svelte` | IDE servers page UI |
| `lib/tasks-schema.sql` | Task table schema (includes scheduling fields) |
| `lib/tasks.js` | `getScheduledTasks()` function |
| `cli/squad` | CLI `squad scheduler` commands |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `better-sqlite3` | ^11.0.0 | Read per-project task databases |
| `cron-parser` | ^4.9.0 | Parse and validate cron expressions |

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Scheduler not starting | Missing dependencies | `cd tools/scheduler && npm install` |
| Tasks not firing | `next_run_at` not set or in the future | Check with: `sqlite3 .squad/tasks.db "SELECT id,next_run_at,status FROM tasks WHERE schedule_cron IS NOT NULL"` |
| Wrong timezone | Default is UTC | Set `defaults.timezone` in `~/.config/squad/projects.json` |
| Spawn fails | IDE not running | Start IDE first: `squad` or `cd ide && npm run dev` |
| Port 3334 in use | Another scheduler instance | Kill old: `tmux kill-session -t server-scheduler` |
| No projects found | Missing .squad directory | Run `st init` in your project directory |
| Shows as "active task" in IDE | Tmux session detected as agent | This is a known UI issue - scheduler tmux session `server-scheduler` may appear in session lists |
