#!/usr/bin/env bash
# Shared library for Agent Mail bash tools
# Pure bash + SQLite implementation

# Configuration
export AGENT_MAIL_DB="${AGENT_MAIL_DB:-$HOME/.agent-mail.db}"
export PROJECT_KEY="${PROJECT_KEY:-$(pwd)}"

# Initialize database with schema
am_init_db() {
    local db="$1"
    if [[ ! -f "$db" ]]; then
        sqlite3 "$db" < "$(dirname "${BASH_SOURCE[0]}")/schema.sql"
    fi
}

# Get or create project by path
# Returns: project_id
am_get_project() {
    local db="$1"
    local human_key="$2"

    am_init_db "$db"

    # Generate slug from path
    local slug
    slug=$(echo "$human_key" | sed 's|^.*/||' | sed 's|[^a-zA-Z0-9_-]|-|g' | tr '[:upper:]' '[:lower:]')

    # Get or create project
    local project_id
    project_id=$(sqlite3 "$db" "SELECT id FROM projects WHERE human_key = '$human_key';")

    if [[ -z "$project_id" ]]; then
        project_id=$(sqlite3 "$db" <<SQL
INSERT INTO projects (slug, human_key) VALUES ('$slug', '$human_key');
SELECT last_insert_rowid();
SQL
        )
    fi

    echo "$project_id"
}

# Get agent by name in project
# Returns: JSON with agent details
am_get_agent() {
    local db="$1"
    local project_id="$2"
    local name="$3"

    sqlite3 -json "$db" <<SQL
SELECT
    id,
    name,
    program,
    model,
    task_description,
    inception_ts,
    last_active_ts
FROM agents
WHERE project_id = $project_id
  AND name = '$name';
SQL
}

# Update agent last_active timestamp
am_touch_agent() {
    local db="$1"
    local agent_id="$2"

    sqlite3 "$db" "UPDATE agents SET last_active_ts = datetime('now') WHERE id = $agent_id;"
}

# Format JSON output for pretty display
am_format_json() {
    if command -v jq &>/dev/null; then
        jq '.'
    else
        cat
    fi
}

# Show error message and exit
am_error() {
    echo "✗ Error: $*" >&2
    exit 1
}

# Show success message
am_success() {
    echo "✓ $*"
}
