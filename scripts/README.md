# Agent Tools Scripts

Helper scripts for agent orchestration workflows.

## get-agent-task.sh

**Purpose:** Get current task ID for an agent by checking both Beads and Agent Mail.

**Problem Solved:** Provides consistent agent status calculation between statusline and dashboard. Previously, the statusline only checked file reservations while the dashboard checked both Beads tasks and reservations, causing inconsistent status display.

### Algorithm

The script checks TWO sources (matching dashboard logic):

1. **Beads Database** - Check for `in_progress` tasks assigned to agent
2. **Agent Mail** - Check for active file reservations by agent

Returns task_id if found from **EITHER** source.

This matches the dashboard logic in `dashboard/src/lib/stores/agents.svelte.ts`:

```typescript
const hasInProgressTask = agent.in_progress_tasks > 0;
const hasActiveLocks = agent.reservation_count > 0;

if (hasInProgressTask || hasActiveLocks) {
    return 'working';
}
```

### Usage

```bash
# Get task ID for agent
task_id=$(./scripts/get-agent-task.sh FreeMarsh)

# Check if agent is working
if ./scripts/get-agent-task.sh FreeMarsh >/dev/null; then
    echo "Agent is working"
else
    echo "Agent is idle"
fi

# Use in statusline
task_id=$(./scripts/get-agent-task.sh "$agent_name")
if [[ -n "$task_id" ]]; then
    echo "Working on: $task_id"
fi
```

### Exit Codes

- `0` - Task found (prints task_id to stdout)
- `1` - No task found (agent is idle)
- `2` - Invalid usage (missing agent name)

### Examples

```bash
# Agent with in_progress task
$ ./scripts/get-agent-task.sh GreatLake
jat-a1z

# Agent with file reservation but no task
$ ./scripts/get-agent-task.sh FreeMarsh
jat-xyz

# Agent with no work
$ ./scripts/get-agent-task.sh PaleStar
$ echo $?
1
```

### Integration

**Statusline** (`.claude/statusline.sh`):
```bash
# Old approach (only checks reservations):
task_id=$(am-reservations --agent "$agent_name" | grep "^Reason:" | ...)

# New approach (checks both Beads and reservations):
task_id=$(./scripts/get-agent-task.sh "$agent_name")
```

**Dashboard** (`dashboard/src/lib/stores/agents.svelte.ts`):
Already implements this logic correctly (serves as reference implementation).

### Task ID Patterns

The script recognizes these task ID patterns from reservation reasons:
- `jat-abc` (Jomarchy Agent Tools)
- `bd-123` (Beads tasks)
- `task-xyz` (Generic tasks)

Pattern: `(jat|bd|task)-[a-z0-9]{3}\b`

### Dependencies

- `bd` command (Beads CLI)
- `am-reservations` command (Agent Mail)
- `jq` (for JSON parsing)

All dependencies are optional - script gracefully handles missing commands.

## test-statusline.sh

**Purpose:** Comprehensive test suite for `.claude/statusline.sh` status calculation logic.

**Problem Solved:** Prevents regressions in agent status display by testing all critical scenarios with automated assertions.

### Usage

```bash
./scripts/test-statusline.sh           # Run all tests
./scripts/test-statusline.sh --verbose # Run with detailed debug output
```

### Test Coverage

1. ✅ Agent with in_progress task (no file reservations)
   - Verifies Beads in_progress tasks appear in statusline
   - Checks task ID and title display

2. ✅ Agent with file reservations (no in_progress task)
   - Verifies reservation task IDs are extracted and looked up
   - Tests fallback to reservation-based task lookup

3. ✅ Agent with BOTH in_progress task AND reservations
   - **Critical:** Tests priority - in_progress task must take precedence
   - Ensures reservation tasks don't override active work

4. ✅ Agent with neither task nor reservations (idle state)
   - Confirms "idle" status appears
   - Verifies no task ID is shown

5. ✅ Edge case: Closed tasks should not appear
   - Tests that only open/in_progress tasks are shown
   - Confirms closed tasks don't leak into statusline

6. ✅ Priority badge display (P0/P1/P2)
   - Validates priority badge colors and formatting

7. ✅ File lock count indicators
   - Tests lock count display (🔒N format)
   - Validates multiple reservations are counted correctly

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Performance

Completes in **<5 seconds** for all 14 assertions.

### CI/CD Integration

Ready for continuous integration:
```bash
# In GitHub Actions / CI pipeline
./scripts/test-statusline.sh || exit 1
```

Exits with proper status codes for automated testing.

### Implementation Details

**Test Environment:**
- Creates isolated temporary databases for Agent Mail and Beads
- Mocks complete Agent Mail schema (projects, agents, file_reservations)
- Initializes real Beads database with `bd init`
- Injects test data via direct SQLite inserts

**Test Execution:**
- Runs statusline with JSON input via stdin
- Captures ANSI-colored output
- Validates using pattern matching (grep)

**Assertion Helpers:**
- `assert_contains` - Verify expected text appears
- `assert_not_contains` - Verify unwanted text doesn't appear

### Dependencies

- `sqlite3` - Database operations
- `jq` - JSON processing
- `bd` - Beads task manager (must be installed)
- `am-reservations` - Agent Mail file reservations command
- `am-inbox` - Agent Mail inbox command

### Database Schema

Test environment mirrors production Agent Mail schema:

```sql
-- Projects with slug and human_key
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    human_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Agents with project foreign key
CREATE TABLE agents (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- File reservations with agent/project foreign keys
CREATE TABLE file_reservations (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    path_pattern TEXT NOT NULL,
    exclusive INTEGER DEFAULT 1,
    reason TEXT DEFAULT '',
    expires_ts TEXT NOT NULL,
    released_ts TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

### Known Limitations

- Tests only status calculation logic (not full statusline features)
- Mock data doesn't include all Agent Mail features (e.g., message threading, unread counts)
- Requires actual `bd` and `am-*` commands to be installed
- Date handling assumes GNU date (may need adjustment for macOS)

### Troubleshooting

**Tests fail with "Error: Beads database not found"**
- Check that `bd init` succeeds
- Verify `.beads/beads.db` is created in test directory

**Tests fail with "no such table: projects"**
- Schema mismatch - update test database creation
- Compare with actual Agent Mail schema: `sqlite3 ~/.agent-mail.db ".schema"`

**am-reservations returns empty results**
- Check project path matches database `human_key`
- Verify wrapper scripts pass `--project` flag correctly
