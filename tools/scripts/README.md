# Agent Tools Scripts

Helper scripts for agent orchestration workflows.

## get-agent-task.sh

**Purpose:** Get current task ID for an agent by checking both SQUAD Tasks and Agent Mail.

**Problem Solved:** Provides consistent agent status calculation between statusline and IDE.

### Algorithm

The script checks the SQUAD Tasks database for `in_progress` tasks assigned to the agent.

This matches the IDE logic in `ide/src/lib/stores/agents.svelte.ts`:

```typescript
const hasInProgressTask = agent.in_progress_tasks > 0;

if (hasInProgressTask) {
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
squad-a1z

# Agent with no work
$ ./scripts/get-agent-task.sh PaleStar
$ echo $?
1
```

### Integration

**Statusline** (`.claude/statusline.sh`):
```bash
task_id=$(./scripts/get-agent-task.sh "$agent_name")
```

**IDE** (`ide/src/lib/stores/agents.svelte.ts`):
Already implements this logic correctly (serves as reference implementation).

### Dependencies

- `st` command (SQUAD Tasks CLI)
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

1. ✅ Agent with in_progress task
   - Verifies SQUAD Tasks in_progress tasks appear in statusline
   - Checks task ID and title display

2. ✅ Agent with no task (idle state)
   - Confirms "idle" status appears
   - Verifies no task ID is shown

3. ✅ Edge case: Closed tasks should not appear
   - Tests that only open/in_progress tasks are shown
   - Confirms closed tasks don't leak into statusline

4. ✅ Priority badge display (P0/P1/P2)
   - Validates priority badge colors and formatting

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
- Creates isolated temporary databases for Agent Mail and SQUAD Tasks
- Initializes real SQUAD Tasks database with `st init`
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
- `st` - SQUAD Tasks CLI (must be installed)

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
```

### Known Limitations

- Tests only status calculation logic (not full statusline features)
- Requires actual `st` command to be installed
- Date handling assumes GNU date (may need adjustment for macOS)

### Troubleshooting

**Tests fail with "Error: SQUAD Tasks database not found"**
- Check that `st init` succeeds
- Verify `.squad/tasks.db` is created in test directory

**Tests fail with "no such table: projects"**
- Schema mismatch - update test database creation
- Compare with actual Agent Mail schema: `sqlite3 ~/.agent-mail.db ".schema"`

