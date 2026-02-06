#!/bin/bash
#
# Migration: Copy issues from .beads/beads.db to .jat/tasks.db
#
# The old "beads" system stored tasks in .beads/beads.db (issues table).
# The new "jat" system uses .jat/tasks.db (tasks table).
# This script migrates all issues, labels, dependencies, and comments.
#
# Usage:
#   migrate-beads-to-jat.sh                    # Migrate all projects under ~/code/
#   migrate-beads-to-jat.sh ~/code/chimaro     # Migrate a specific project
#   migrate-beads-to-jat.sh --dry-run          # Show what would be migrated
#   migrate-beads-to-jat.sh --dry-run ~/code/chimaro
#

set -e

DRY_RUN=false
TARGET_PROJECT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run|-n) DRY_RUN=true; shift ;;
        --help|-h)
            echo "Usage: migrate-beads-to-jat.sh [--dry-run] [project-path]"
            echo ""
            echo "Migrates issues from .beads/beads.db to .jat/tasks.db"
            echo ""
            echo "Options:"
            echo "  --dry-run, -n   Show what would be migrated without making changes"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "If no project-path is given, migrates all projects under ~/code/"
            exit 0
            ;;
        *) TARGET_PROJECT="$1"; shift ;;
    esac
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Beads → JAT Tasks Migration                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if $DRY_RUN; then
    echo "  [DRY RUN MODE - no changes will be made]"
    echo ""
fi

# Build list of projects to migrate
declare -a PROJECTS=()

if [[ -n "$TARGET_PROJECT" ]]; then
    # Single project
    TARGET_PROJECT="${TARGET_PROJECT%/}"  # Remove trailing slash
    if [[ ! -d "$TARGET_PROJECT/.beads" ]]; then
        echo "Error: No .beads/ directory found in $TARGET_PROJECT"
        exit 1
    fi
    if [[ ! -f "$TARGET_PROJECT/.beads/beads.db" ]]; then
        echo "Error: No beads.db found in $TARGET_PROJECT/.beads/"
        exit 1
    fi
    PROJECTS+=("$TARGET_PROJECT")
else
    # All projects under ~/code/
    for dir in ~/code/*/; do
        dir="${dir%/}"
        if [[ -f "$dir/.beads/beads.db" ]]; then
            # Check if beads.db has any issues
            count=$(sqlite3 "$dir/.beads/beads.db" "SELECT COUNT(*) FROM issues" 2>/dev/null || echo "0")
            if [[ "$count" -gt 0 ]]; then
                PROJECTS+=("$dir")
            fi
        fi
    done
fi

if [[ ${#PROJECTS[@]} -eq 0 ]]; then
    echo "No projects found with beads data to migrate."
    exit 0
fi

echo "Projects to migrate:"
total_issues=0
total_open=0
for proj in "${PROJECTS[@]}"; do
    name=$(basename "$proj")
    beads_db="$proj/.beads/beads.db"
    jat_db="$proj/.jat/tasks.db"

    count=$(sqlite3 "$beads_db" "SELECT COUNT(*) FROM issues" 2>/dev/null)
    open=$(sqlite3 "$beads_db" "SELECT COUNT(*) FROM issues WHERE status NOT IN ('closed','tombstone')" 2>/dev/null)
    jat_count=0
    if [[ -f "$jat_db" ]]; then
        jat_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM tasks" 2>/dev/null || echo "0")
    fi

    total_issues=$((total_issues + count))
    total_open=$((total_open + open))

    status_note=""
    if [[ "$jat_count" -gt 0 ]]; then
        status_note=" (jat already has $jat_count tasks)"
    fi

    echo "  $name: $count issues ($open open)$status_note"
done
echo ""
echo "Total: $total_issues issues ($total_open open) across ${#PROJECTS[@]} projects"
echo ""

if $DRY_RUN; then
    echo "[DRY RUN] No changes made."
    exit 0
fi

# Confirm
read -p "Proceed with migration? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""

# Migrate each project
migrated_count=0
skipped_count=0
error_count=0

for proj in "${PROJECTS[@]}"; do
    name=$(basename "$proj")
    beads_db="$proj/.beads/beads.db"
    jat_db="$proj/.jat/tasks.db"

    echo "━━━ Migrating: $name ━━━"

    # Ensure .jat/ exists and is initialized
    if [[ ! -f "$jat_db" ]]; then
        echo "  Initializing .jat/ ..."
        (cd "$proj" && jt init --quiet >/dev/null 2>&1)
    fi

    # Check if jat already has tasks (skip if already migrated)
    jat_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM tasks" 2>/dev/null || echo "0")
    if [[ "$jat_count" -gt 0 ]]; then
        echo "  Skipping: .jat/tasks.db already has $jat_count tasks"
        echo "  (Use a fresh .jat/tasks.db or manually merge)"
        skipped_count=$((skipped_count + 1))
        echo ""
        continue
    fi

    # Create backup of jat db (even though it's empty, be safe)
    cp "$jat_db" "${jat_db}.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

    # Migrate using SQLite ATTACH
    # This copies data from beads.db into tasks.db, mapping the schema
    sqlite3 "$jat_db" <<EOSQL
PRAGMA foreign_keys=OFF;

ATTACH DATABASE '${beads_db}' AS beads;

-- Migrate issues → tasks
-- Map columns: beads has many extra columns, jat has fewer
-- Skip tombstoned issues (soft-deleted)
INSERT OR IGNORE INTO tasks (id, title, description, notes, status, priority, issue_type, assignee, created_at, updated_at, closed_at, close_reason)
SELECT
    id,
    title,
    COALESCE(description, ''),
    COALESCE(notes, ''),
    CASE
        WHEN status = 'tombstone' THEN 'closed'
        ELSE status
    END,
    priority,
    issue_type,
    assignee,
    created_at,
    updated_at,
    closed_at,
    COALESCE(close_reason, '')
FROM beads.issues
WHERE deleted_at IS NULL;

-- Migrate labels
INSERT OR IGNORE INTO labels (issue_id, label)
SELECT l.issue_id, l.label
FROM beads.labels l
INNER JOIN tasks t ON t.id = l.issue_id;

-- Migrate dependencies
-- Only migrate deps where both tasks exist in the new DB
INSERT OR IGNORE INTO dependencies (issue_id, depends_on_id, type)
SELECT d.issue_id, d.depends_on_id, d.type
FROM beads.dependencies d
INNER JOIN tasks t1 ON t1.id = d.issue_id
INNER JOIN tasks t2 ON t2.id = d.depends_on_id;

-- Migrate comments (if they exist in beads)
INSERT OR IGNORE INTO comments (issue_id, author, text, created_at)
SELECT c.issue_id, c.author, c.text, c.created_at
FROM beads.comments c
INNER JOIN tasks t ON t.id = c.issue_id;

DETACH DATABASE beads;

PRAGMA foreign_keys=ON;
EOSQL

    if [[ $? -eq 0 ]]; then
        new_count=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM tasks")
        new_labels=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM labels")
        new_deps=$(sqlite3 "$jat_db" "SELECT COUNT(*) FROM dependencies")
        echo "  Migrated: $new_count tasks, $new_labels labels, $new_deps dependencies"
        migrated_count=$((migrated_count + 1))
    else
        echo "  ERROR: Migration failed for $name"
        error_count=$((error_count + 1))
    fi

    echo ""
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Migration Complete                                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Migrated: $migrated_count projects"
echo "  Skipped:  $skipped_count projects (already had tasks)"
echo "  Errors:   $error_count projects"
echo ""
echo "Tip: Refresh the JAT IDE to see the migrated tasks."
echo "     Old .beads/ directories are preserved (not deleted)."
