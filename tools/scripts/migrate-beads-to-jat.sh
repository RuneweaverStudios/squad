#!/bin/bash
# migrate-beads-to-jat.sh - Migrate .beads/ databases to .jat/ format
#
# For each project with .beads/beads.db:
#   1. Create .jat/ dir + init schema (tasks, dependencies, labels, comments)
#   2. Copy task data via SQLite ATTACH + INSERT (12 columns from issues)
#   3. Copy dependencies, labels, comments tables
#   4. Move JAT-specific files: completions.json, task-images.json, signals/, logs/, summaries/
#   5. Create .jat/.gitignore (ignore tasks.db*)
#   6. Preserve .beads/ for manual cleanup
#
# Usage:
#   migrate-beads-to-jat.sh [project_path]   # Migrate specific project
#   migrate-beads-to-jat.sh                  # Migrate all ~/code/* projects
#   migrate-beads-to-jat.sh --dry-run        # Show what would be migrated
#   migrate-beads-to-jat.sh --check          # Check which projects need migration

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

DRY_RUN=false
CHECK_ONLY=false
SPECIFIC_PROJECT=""
MIGRATED=0
SKIPPED=0
FAILED=0

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        --check)
            CHECK_ONLY=true
            ;;
        --help|-h)
            echo "Usage: migrate-beads-to-jat.sh [OPTIONS] [project_path]"
            echo ""
            echo "Migrate .beads/ databases to .jat/ format."
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be migrated without making changes"
            echo "  --check      Check which projects need migration"
            echo "  --help       Show this help message"
            echo ""
            echo "If no project_path is given, scans ~/code/* for .beads/ directories."
            exit 0
            ;;
        *)
            if [[ -d "$arg" ]]; then
                SPECIFIC_PROJECT="$arg"
            else
                echo -e "${RED}Error: Not a directory: $arg${NC}"
                exit 1
            fi
            ;;
    esac
done

# Get the schema SQL path (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="$SCRIPT_DIR/../../lib/tasks-schema.sql"

if [[ ! -f "$SCHEMA_PATH" ]]; then
    echo -e "${RED}Error: Schema file not found at $SCHEMA_PATH${NC}"
    echo "Make sure lib/tasks-schema.sql exists."
    exit 1
fi

# Discover projects to migrate
discover_projects() {
    local projects=()

    if [[ -n "$SPECIFIC_PROJECT" ]]; then
        projects=("$SPECIFIC_PROJECT")
    else
        # Scan ~/code/ for directories with .beads/
        local code_dir="$HOME/code"
        if [[ -d "$code_dir" ]]; then
            for dir in "$code_dir"/*/; do
                [[ -d "$dir" ]] && projects+=("${dir%/}")
            done
        fi
    fi

    echo "${projects[@]}"
}

# Check if a project needs migration
needs_migration() {
    local project_path="$1"
    local beads_db="$project_path/.beads/beads.db"
    local jat_db="$project_path/.jat/tasks.db"

    # Must have .beads/beads.db
    [[ ! -f "$beads_db" ]] && return 1

    # Must NOT already have .jat/tasks.db
    [[ -f "$jat_db" ]] && return 1

    return 0
}

# Count tasks in beads db (excluding tombstones)
count_beads_tasks() {
    local beads_db="$1"
    sqlite3 "$beads_db" "SELECT COUNT(*) FROM issues WHERE status != 'tombstone' AND (deleted_at IS NULL OR deleted_at = '')" 2>/dev/null || echo "0"
}

# Migrate a single project
migrate_project() {
    local project_path="$1"
    local project_name
    project_name=$(basename "$project_path")
    local beads_db="$project_path/.beads/beads.db"
    local jat_dir="$project_path/.jat"
    local jat_db="$jat_dir/tasks.db"

    echo -e "\n${BOLD}Migrating: $project_name${NC} ($project_path)"

    # 1. Create .jat/ directory
    if $DRY_RUN; then
        echo -e "  ${BLUE}[dry-run]${NC} Would create $jat_dir/"
    else
        mkdir -p "$jat_dir"
    fi

    # 2. Create .gitignore
    if $DRY_RUN; then
        echo -e "  ${BLUE}[dry-run]${NC} Would create $jat_dir/.gitignore"
    else
        cat > "$jat_dir/.gitignore" << 'GITIGNORE'
tasks.db
tasks.db-wal
tasks.db-shm
GITIGNORE
    fi

    # 3. Init schema and copy data
    if $DRY_RUN; then
        local count
        count=$(count_beads_tasks "$beads_db")
        echo -e "  ${BLUE}[dry-run]${NC} Would create tasks.db with schema"
        echo -e "  ${BLUE}[dry-run]${NC} Would copy $count tasks from beads.db"
    else
        # Create database and apply schema
        sqlite3 "$jat_db" < "$SCHEMA_PATH"

        # Copy data using ATTACH
        # Map: issues(12 cols) → tasks(12 cols), skip tombstones and soft-deleted
        sqlite3 "$jat_db" <<SQL
ATTACH DATABASE '$beads_db' AS beads;

-- Copy tasks (issues → tasks)
-- Map the 12 columns that exist in both schemas
-- Skip tombstoned and soft-deleted records
INSERT OR IGNORE INTO tasks (id, title, description, notes, status, priority, issue_type, assignee, created_at, updated_at, closed_at, close_reason)
SELECT
    id,
    title,
    COALESCE(description, ''),
    COALESCE(notes, ''),
    CASE
        WHEN status = 'tombstone' THEN 'closed'
        WHEN status = 'deferred' THEN 'open'
        WHEN status = 'blocked' THEN 'open'
        ELSE status
    END,
    COALESCE(priority, 2),
    COALESCE(issue_type, 'task'),
    assignee,
    COALESCE(created_at, datetime('now')),
    COALESCE(updated_at, datetime('now')),
    closed_at,
    COALESCE(close_reason, '')
FROM beads.issues
WHERE status != 'tombstone'
  AND (deleted_at IS NULL OR deleted_at = '');

-- Copy dependencies
-- Beads has extra columns (created_at, created_by, metadata, thread_id)
-- JAT only needs issue_id, depends_on_id, type
INSERT OR IGNORE INTO dependencies (issue_id, depends_on_id, type)
SELECT d.issue_id, d.depends_on_id, d.type
FROM beads.dependencies d
WHERE d.issue_id IN (SELECT id FROM tasks)
  AND d.depends_on_id IN (SELECT id FROM tasks);

-- Copy labels
INSERT OR IGNORE INTO labels (issue_id, label)
SELECT l.issue_id, l.label
FROM beads.labels l
WHERE l.issue_id IN (SELECT id FROM tasks);

-- Copy comments
INSERT INTO comments (issue_id, author, text, created_at)
SELECT c.issue_id, c.author, c.text, c.created_at
FROM beads.comments c
WHERE c.issue_id IN (SELECT id FROM tasks);

DETACH DATABASE beads;
SQL

        # Count migrated
        local task_count dep_count label_count comment_count
        task_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM tasks")
        dep_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM dependencies")
        label_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM labels")
        comment_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM comments")
        echo -e "  ${GREEN}✓${NC} Copied: $task_count tasks, $dep_count deps, $label_count labels, $comment_count comments"
    fi

    # 4. Move JAT-specific files from .beads/ to .jat/
    local jat_files=("completions.json" "task-images.json" "review-rules.json")
    for file in "${jat_files[@]}"; do
        if [[ -f "$project_path/.beads/$file" ]]; then
            if $DRY_RUN; then
                echo -e "  ${BLUE}[dry-run]${NC} Would move .beads/$file → .jat/$file"
            else
                cp "$project_path/.beads/$file" "$jat_dir/$file"
                echo -e "  ${GREEN}✓${NC} Copied .beads/$file → .jat/$file"
            fi
        fi
    done

    # Move directories: signals/, logs/, summaries/
    local jat_dirs=("signals" "logs" "summaries")
    for dir in "${jat_dirs[@]}"; do
        if [[ -d "$project_path/.beads/$dir" ]]; then
            if $DRY_RUN; then
                local file_count
                file_count=$(find "$project_path/.beads/$dir" -type f 2>/dev/null | wc -l)
                echo -e "  ${BLUE}[dry-run]${NC} Would copy .beads/$dir/ → .jat/$dir/ ($file_count files)"
            else
                if [[ ! -d "$jat_dir/$dir" ]]; then
                    cp -r "$project_path/.beads/$dir" "$jat_dir/$dir"
                    echo -e "  ${GREEN}✓${NC} Copied .beads/$dir/ → .jat/$dir/"
                else
                    echo -e "  ${YELLOW}⚠${NC} .jat/$dir/ already exists, skipping"
                fi
            fi
        fi
    done

    # 5. Create last-touched sentinel
    if ! $DRY_RUN; then
        date +%s > "$jat_dir/last-touched"
    fi

    echo -e "  ${GREEN}✓${NC} Migration complete for $project_name"
    echo -e "  ${YELLOW}Note:${NC} .beads/ preserved. Remove manually when verified: rm -rf $project_path/.beads/"
}

# Main
echo -e "${BOLD}JAT Migration: .beads/ → .jat/${NC}"
echo ""

# Read projects
projects=($(discover_projects))

if [[ ${#projects[@]} -eq 0 ]]; then
    echo "No projects found to scan."
    exit 0
fi

# Process each project
for project_path in "${projects[@]}"; do
    project_name=$(basename "$project_path")

    if ! needs_migration "$project_path"; then
        if [[ -f "$project_path/.jat/tasks.db" ]] && [[ -f "$project_path/.beads/beads.db" ]]; then
            if $CHECK_ONLY; then
                echo -e "  ${GREEN}✓${NC} $project_name - already migrated (.jat/ exists)"
            fi
        elif [[ ! -f "$project_path/.beads/beads.db" ]]; then
            if $CHECK_ONLY; then
                echo -e "  ${YELLOW}—${NC} $project_name - no .beads/beads.db"
            fi
        fi
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    if $CHECK_ONLY; then
        local_count=$(count_beads_tasks "$project_path/.beads/beads.db")
        echo -e "  ${BLUE}→${NC} $project_name - needs migration ($local_count tasks)"
        continue
    fi

    if migrate_project "$project_path"; then
        MIGRATED=$((MIGRATED + 1))
    else
        FAILED=$((FAILED + 1))
        echo -e "  ${RED}✗${NC} Failed to migrate $project_name"
    fi
done

# Summary
echo ""
echo -e "${BOLD}Migration Summary:${NC}"
if $CHECK_ONLY; then
    echo "  Run without --check to perform migration"
elif $DRY_RUN; then
    echo "  Run without --dry-run to perform migration"
else
    echo -e "  ${GREEN}✓${NC} Migrated: $MIGRATED"
    if [[ $SKIPPED -gt 0 ]]; then echo -e "  ${YELLOW}—${NC} Skipped: $SKIPPED"; fi
    if [[ $FAILED -gt 0 ]]; then echo -e "  ${RED}✗${NC} Failed: $FAILED"; fi
fi
