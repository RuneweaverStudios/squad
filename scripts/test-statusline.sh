#!/bin/bash
#
# Automated test suite for .claude/statusline.sh
#
# Tests the critical status calculation logic to prevent regressions.
# Covers scenarios:
#   1. Agent with in_progress task + no reservations
#   2. Agent with reservations + no in_progress task
#   3. Agent with BOTH in_progress task AND reservations
#   4. Agent with neither (idle)
#   5. Edge cases: closed tasks, expired reservations
#
# Usage:
#   ./scripts/test-statusline.sh
#   ./scripts/test-statusline.sh --verbose
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Verbose mode
VERBOSE=false
if [[ "${1:-}" == "--verbose" ]]; then
    VERBOSE=true
fi

# Test database paths
TEST_DB="/tmp/test-agent-mail-${RANDOM}.db"
TEST_BEADS_DIR="/tmp/test-beads-${RANDOM}"

# Cleanup function
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_BEADS_DIR"
}
trap cleanup EXIT

# Initialize test environment
setup_test_env() {
    # Create test Agent Mail database with correct schema
    sqlite3 "$TEST_DB" <<EOF
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    human_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    program TEXT NOT NULL,
    model TEXT NOT NULL,
    task_description TEXT DEFAULT '',
    inception_ts TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_ts TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS file_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    path_pattern TEXT NOT NULL,
    exclusive INTEGER DEFAULT 1,
    reason TEXT DEFAULT '',
    created_ts TEXT NOT NULL DEFAULT (datetime('now')),
    expires_ts TEXT NOT NULL,
    released_ts TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    thread_id TEXT,
    created_ts TEXT DEFAULT (datetime('now')),
    acknowledged INTEGER DEFAULT 0,
    ack_ts TEXT
);

-- Insert test project
INSERT INTO projects (slug, human_key) VALUES ('test-project', '$TEST_BEADS_DIR');
EOF

    # Create test Beads database directory
    mkdir -p "$TEST_BEADS_DIR"
    cd "$TEST_BEADS_DIR"

    # Initialize Beads database properly
    bd init >/dev/null 2>&1 || true

    cd - >/dev/null
}

# Helper: Register test agent
register_test_agent() {
    local agent_name="$1"
    sqlite3 "$TEST_DB" <<EOF
INSERT INTO agents (project_id, name, program, model, task_description, last_active_ts)
VALUES (1, '$agent_name', 'claude-code', 'sonnet-4.5', 'Test agent', datetime('now'));
EOF
}

# Helper: Create file reservation
create_reservation() {
    local agent_name="$1"
    local pattern="$2"
    local reason="$3"
    local expires_offset="${4:-3600}" # seconds from now

    local expires_ts
    expires_ts=$(date -u -d "+${expires_offset} seconds" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -v "+${expires_offset}S" '+%Y-%m-%d %H:%M:%S')

    # Get agent_id
    local agent_id
    agent_id=$(sqlite3 "$TEST_DB" "SELECT id FROM agents WHERE name='$agent_name'" | head -1)

    sqlite3 "$TEST_DB" <<EOF
INSERT INTO file_reservations (project_id, agent_id, path_pattern, exclusive, reason, expires_ts)
VALUES (1, $agent_id, '$pattern', 1, '$reason', '$expires_ts');
EOF
}

# Helper: Create Beads task
create_beads_task() {
    local task_id="$1"
    local title="$2"
    local status="$3"
    local assignee="${4:-}"
    local priority="${5:-1}"

    # Database is always beads.db
    local db_file="$TEST_BEADS_DIR/.beads/beads.db"

    if [[ ! -f "$db_file" ]]; then
        echo "Error: Beads database not found at $db_file" >&2
        return 1
    fi

    # Insert directly into SQLite database
    # Note: If status is 'closed', closed_at must be set (CHECK constraint)
    local closed_at_clause=""
    if [[ "$status" == "closed" ]]; then
        closed_at_clause=", closed_at = CURRENT_TIMESTAMP"
    fi

    sqlite3 "$db_file" <<EOF
INSERT INTO issues (id, title, description, status, assignee, priority, issue_type, created_at, updated_at$([ "$status" == "closed" ] && echo ", closed_at"))
VALUES ('$task_id', '$title', 'Test task', '$status', '$assignee', $priority, 'task', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP$([ "$status" == "closed" ] && echo ", CURRENT_TIMESTAMP"));
EOF
}

# Helper: Run statusline with test data
run_statusline_test() {
    local agent_name="$1"
    local session_id="test-session-${RANDOM}"
    local transcript_path="/tmp/test-transcript-${session_id}.jsonl"

    # Create minimal transcript
    echo '{"type":"user","message":{"role":"user","content":"test"}}' > "$transcript_path"

    # Create JSON input for statusline
    local json_input
    json_input=$(cat <<EOF
{
  "cwd": "$TEST_BEADS_DIR",
  "session_id": "$session_id",
  "transcript_path": "$transcript_path"
}
EOF
)

    # Override commands to use test database
    local statusline_output
    statusline_output=$(
        export AGENT_MAIL_DB="$TEST_DB"
        export PATH="/tmp/test-bin:$PATH"

        # Create test command wrappers
        mkdir -p /tmp/test-bin

        # bd wrapper
        cat > /tmp/test-bin/bd <<BDEOF
#!/bin/bash
cd "$TEST_BEADS_DIR"
$(which bd) "\$@"
BDEOF
        chmod +x /tmp/test-bin/bd

        # am-reservations wrapper
        cat > /tmp/test-bin/am-reservations <<AMEOF
#!/bin/bash
AGENT_MAIL_DB="$TEST_DB" $(which am-reservations) --project "$TEST_BEADS_DIR" "\$@"
AMEOF
        chmod +x /tmp/test-bin/am-reservations

        # am-inbox wrapper
        cat > /tmp/test-bin/am-inbox <<INEOF
#!/bin/bash
AGENT_MAIL_DB="$TEST_DB" $(which am-inbox) "\$@"
INEOF
        chmod +x /tmp/test-bin/am-inbox

        # Create agent session file
        mkdir -p "$TEST_BEADS_DIR/.claude"
        echo "$agent_name" > "$TEST_BEADS_DIR/.claude/agent-${session_id}.txt"

        # Run statusline
        echo "$json_input" | .claude/statusline.sh
    )

    # Cleanup
    rm -f "$transcript_path"
    rm -rf /tmp/test-bin

    echo "$statusline_output"
}

# Test assertion helper
assert_contains() {
    local output="$1"
    local expected="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$output" | grep -q "$expected"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓${RESET} $test_name"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "  Expected: $expected"
            echo "  Output: $output"
        fi
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗${RESET} $test_name"
        echo "  Expected to contain: $expected"
        echo "  Actual output: $output"
        return 1
    fi
}

assert_not_contains() {
    local output="$1"
    local unexpected="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if ! echo "$output" | grep -q "$unexpected"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓${RESET} $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗${RESET} $test_name"
        echo "  Expected NOT to contain: $unexpected"
        echo "  Actual output: $output"
        return 1
    fi
}

# ============================================================================
# TEST SUITE
# ============================================================================

echo "=================================================="
echo "Statusline Test Suite"
echo "=================================================="
echo ""

setup_test_env

# ----------------------------------------------------------------------------
# TEST 1: Agent with in_progress task, no reservations
# ----------------------------------------------------------------------------
echo "Test 1: Agent with in_progress task (no reservations)"
echo "------------------------------------------------------"

register_test_agent "TestAgent1"
create_beads_task "jat-abc" "Test Task 1" "in_progress" "TestAgent1" 1

output=$(run_statusline_test "TestAgent1")

assert_contains "$output" "jat-abc" "Shows task ID from Beads"
assert_contains "$output" "Test Task 1" "Shows task title from Beads"

echo ""

# ----------------------------------------------------------------------------
# TEST 2: Agent with reservations, no in_progress task
# ----------------------------------------------------------------------------
echo "Test 2: Agent with reservations (no in_progress task)"
echo "------------------------------------------------------"

register_test_agent "TestAgent2"
create_beads_task "jat-xyz" "Test Task 2" "open" "" 1
create_reservation "TestAgent2" "src/**/*.ts" "jat-xyz" 3600

# Debug: Check what am-reservations returns
if [[ "$VERBOSE" == "true" ]]; then
    echo "  Debug: TEST_BEADS_DIR=$TEST_BEADS_DIR"
    echo "  Debug: Checking projects table"
    sqlite3 "$TEST_DB" "SELECT * FROM projects;"
    echo "  Debug: Checking am-reservations output"
    AGENT_MAIL_DB="$TEST_DB" am-reservations --project "$TEST_BEADS_DIR" --agent "TestAgent2" 2>&1
    echo "  Debug: Checking database contents"
    sqlite3 "$TEST_DB" "SELECT * FROM file_reservations;"
    sqlite3 "$TEST_DB" "SELECT * FROM agents;"
fi

output=$(run_statusline_test "TestAgent2")

assert_contains "$output" "jat-xyz" "Shows task ID from reservation"
assert_contains "$output" "Test Task 2" "Shows task title from Beads lookup"

echo ""

# ----------------------------------------------------------------------------
# TEST 3: Agent with BOTH in_progress task AND reservations
# ----------------------------------------------------------------------------
echo "Test 3: Agent with in_progress task AND reservations"
echo "------------------------------------------------------"

register_test_agent "TestAgent3"
create_beads_task "jat-pqr" "Test Task 3 Priority" "in_progress" "TestAgent3" 0
create_beads_task "jat-stu" "Test Task 3 Reserve" "open" "" 1
create_reservation "TestAgent3" "src/**/*.ts" "jat-stu" 3600

output=$(run_statusline_test "TestAgent3")

# Should show in_progress task (jat-pqr), NOT reservation task (jat-stu)
assert_contains "$output" "jat-pqr" "Shows in_progress task (not reservation task)"
assert_contains "$output" "Test Task 3 Priority" "Shows in_progress task title"
assert_not_contains "$output" "jat-stu" "Does NOT show reservation task when in_progress exists"

echo ""

# ----------------------------------------------------------------------------
# TEST 4: Agent with neither (idle)
# ----------------------------------------------------------------------------
echo "Test 4: Agent with no task and no reservations (idle)"
echo "------------------------------------------------------"

register_test_agent "TestAgent4"

output=$(run_statusline_test "TestAgent4")

assert_contains "$output" "idle" "Shows idle status when no work"
assert_not_contains "$output" "jat-" "Does not show any task ID"

echo ""

# ----------------------------------------------------------------------------
# TEST 5: Edge case - Closed task in Beads
# ----------------------------------------------------------------------------
echo "Test 5: Edge case - Closed task should not appear"
echo "------------------------------------------------------"

register_test_agent "TestAgent5"
create_beads_task "jat-cls" "Closed Task" "closed" "TestAgent5" 1

output=$(run_statusline_test "TestAgent5")

assert_not_contains "$output" "jat-cls" "Does not show closed tasks"
assert_contains "$output" "idle" "Shows idle when only closed tasks exist"

echo ""

# ----------------------------------------------------------------------------
# TEST 6: Priority badge display
# ----------------------------------------------------------------------------
echo "Test 6: Priority badge display"
echo "------------------------------------------------------"

register_test_agent "TestAgent6"
create_beads_task "jat-p0t" "P0 Task" "in_progress" "TestAgent6" 0

output=$(run_statusline_test "TestAgent6")

assert_contains "$output" "P0" "Shows P0 priority badge"
assert_contains "$output" "jat-p0t" "Shows task ID"

echo ""

# ----------------------------------------------------------------------------
# TEST 7: File lock count indicator
# ----------------------------------------------------------------------------
echo "Test 7: File lock count indicator"
echo "------------------------------------------------------"

register_test_agent "TestAgent7"
create_beads_task "jat-lck" "Lock Task" "in_progress" "TestAgent7" 1
create_reservation "TestAgent7" "src/**/*.ts" "jat-lck" 3600
create_reservation "TestAgent7" "test/**/*.ts" "jat-lck" 3600

output=$(run_statusline_test "TestAgent7")

assert_contains "$output" "🔒 2" "Shows lock count indicator (2 locks)"

echo ""

# ============================================================================
# TEST RESULTS
# ============================================================================

echo ""
echo "=================================================="
echo "Test Results"
echo "=================================================="
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${RESET}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${RESET}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${RESET}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${RESET}"
    exit 1
fi
