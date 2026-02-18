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
TEST_PROJECT_DIR="/tmp/test-squad-${RANDOM}"

# Cleanup function
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_PROJECT_DIR"
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

-- Insert test project
INSERT INTO projects (slug, human_key) VALUES ('test-project', '$TEST_PROJECT_DIR');
EOF

    # Create test project directory
    mkdir -p "$TEST_PROJECT_DIR"
    cd "$TEST_PROJECT_DIR"

    # Initialize tasks database
    st init --quiet >/dev/null 2>&1 || true

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

# Helper: Create task in SQUAD database
create_task() {
    local task_id="$1"
    local title="$2"
    local status="$3"
    local assignee="${4:-}"
    local priority="${5:-1}"

    # Database is always tasks.db
    local db_file="$TEST_PROJECT_DIR/.squad/tasks.db"

    if [[ ! -f "$db_file" ]]; then
        echo "Error: Tasks database not found at $db_file" >&2
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
  "cwd": "$TEST_PROJECT_DIR",
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

        # st wrapper
        cat > /tmp/test-bin/st <<JTEOF
#!/bin/bash
cd "$TEST_PROJECT_DIR"
$(which st) "\$@"
JTEOF
        chmod +x /tmp/test-bin/st

        # am-agents wrapper
        cat > /tmp/test-bin/am-agents <<AMEOF
#!/bin/bash
AGENT_MAIL_DB="$TEST_DB" $(which am-agents) "\$@"
AMEOF
        chmod +x /tmp/test-bin/am-agents

        # Create agent session file
        mkdir -p "$TEST_PROJECT_DIR/.claude"
        echo "$agent_name" > "$TEST_PROJECT_DIR/.claude/agent-${session_id}.txt"

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
create_task "squad-abc" "Test Task 1" "in_progress" "TestAgent1" 1

output=$(run_statusline_test "TestAgent1")

assert_contains "$output" "squad-abc" "Shows task ID from SQUAD"
assert_contains "$output" "Test Task 1" "Shows task title from SQUAD"

echo ""

# ----------------------------------------------------------------------------
# TEST 2: Agent with no task (idle)
# ----------------------------------------------------------------------------
echo "Test 2: Agent with no task (idle)"
echo "------------------------------------------------------"

register_test_agent "TestAgent2"

output=$(run_statusline_test "TestAgent2")

assert_contains "$output" "idle" "Shows idle status when no work"
assert_not_contains "$output" "squad-" "Does not show any task ID"

echo ""

# ----------------------------------------------------------------------------
# TEST 3: Edge case - Closed task in SQUAD
# ----------------------------------------------------------------------------
echo "Test 3: Edge case - Closed task should not appear"
echo "------------------------------------------------------"

register_test_agent "TestAgent3"
create_task "squad-cls" "Closed Task" "closed" "TestAgent3" 1

output=$(run_statusline_test "TestAgent3")

assert_not_contains "$output" "squad-cls" "Does not show closed tasks"
assert_contains "$output" "idle" "Shows idle when only closed tasks exist"

echo ""

# ----------------------------------------------------------------------------
# TEST 4: Priority badge display
# ----------------------------------------------------------------------------
echo "Test 4: Priority badge display"
echo "------------------------------------------------------"

register_test_agent "TestAgent4"
create_task "squad-p0t" "P0 Task" "in_progress" "TestAgent4" 0

output=$(run_statusline_test "TestAgent4")

assert_contains "$output" "P0" "Shows P0 priority badge"
assert_contains "$output" "squad-p0t" "Shows task ID"

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
