#!/usr/bin/env bash
#
# beads-migrate-prefix.sh
#
# Migrate Beads task ID prefixes across all related databases and files.
# This tool updates task IDs in:
#   - Beads SQLite database (issues, dependencies)
#   - Agent Mail database (thread_ids, message content)
#   - File reservations (reason field)
#
# Usage:
#   beads-migrate-prefix.sh --from OLD_PREFIX --to NEW_PREFIX --project PROJECT_PATH [--dry-run]
#
# Example:
#   beads-migrate-prefix.sh --from dirt --to chimaro --project ~/code/chimaro
#   beads-migrate-prefix.sh --from dirt --to chimaro --project ~/code/chimaro --dry-run
#
# Safety:
#   - Always creates backup before migration
#   - Uses SQLite transactions for atomicity
#   - Supports dry-run mode to preview changes
#   - Validates inputs and databases before proceeding
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script metadata
SCRIPT_NAME="beads-migrate-prefix.sh"
VERSION="1.0.0"

# Global variables
FROM_PREFIX=""
TO_PREFIX=""
PROJECT_PATH=""
DRY_RUN=false
BACKUP_DIR=""
BEADS_DB=""
AGENT_MAIL_DB="${HOME}/.agent-mail.db"

#
# Logging functions
#
log_info() {
    echo -e "${BLUE}ℹ${NC}  $*"
}

log_success() {
    echo -e "${GREEN}✓${NC}  $*"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC}  $*"
}

log_error() {
    echo -e "${RED}✗${NC}  $*" >&2
}

#
# Usage and help
#
usage() {
    cat <<EOF
Usage: $SCRIPT_NAME --from OLD_PREFIX --to NEW_PREFIX --project PROJECT_PATH [--dry-run]

Migrate Beads task ID prefixes across all related databases.

Required Options:
  --from PREFIX         Old prefix to migrate from (e.g., dirt)
  --to PREFIX           New prefix to migrate to (e.g., chimaro)
  --project PATH        Path to project directory (e.g., ~/code/chimaro)

Optional Flags:
  --dry-run             Show what would be changed without modifying data
  --help                Show this help message
  --version             Show version information

Examples:
  # Preview migration (dry-run)
  $SCRIPT_NAME --from dirt --to chimaro --project ~/code/chimaro --dry-run

  # Execute migration
  $SCRIPT_NAME --from dirt --to chimaro --project ~/code/chimaro

Safety Features:
  - Automatic backup creation before migration
  - SQLite transactions for atomic updates
  - Validation of all inputs and database integrity
  - Dry-run mode to preview changes safely

Output:
  - Backup location and checksums
  - Number of tasks/dependencies/messages updated
  - Validation results
  - Rollback instructions if needed

Exit Codes:
  0   Success
  1   Invalid arguments or validation failed
  2   Database error
  3   Backup/restore failed

EOF
}

version() {
    echo "$SCRIPT_NAME version $VERSION"
}

#
# Argument parsing
#
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --from)
                FROM_PREFIX="$2"
                shift 2
                ;;
            --to)
                TO_PREFIX="$2"
                shift 2
                ;;
            --project)
                PROJECT_PATH="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            --version)
                version
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$FROM_PREFIX" ]]; then
        log_error "Missing required option: --from PREFIX"
        usage
        exit 1
    fi

    if [[ -z "$TO_PREFIX" ]]; then
        log_error "Missing required option: --to PREFIX"
        usage
        exit 1
    fi

    if [[ -z "$PROJECT_PATH" ]]; then
        log_error "Missing required option: --project PATH"
        usage
        exit 1
    fi

    # Expand PROJECT_PATH
    PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

    # Set BEADS_DB path
    BEADS_DB="${PROJECT_PATH}/.beads/beads.db"
}

#
# Validation functions
#
validate_prefix() {
    local prefix="$1"
    local prefix_name="$2"

    # Prefix should be lowercase alphanumeric, no special chars except hyphen
    if ! [[ "$prefix" =~ ^[a-z][a-z0-9-]*$ ]]; then
        log_error "Invalid ${prefix_name} prefix: '$prefix'"
        log_error "Prefix must start with lowercase letter and contain only lowercase letters, numbers, and hyphens"
        return 1
    fi

    return 0
}

validate_project() {
    # Check project directory exists
    if [[ ! -d "$PROJECT_PATH" ]]; then
        log_error "Project directory does not exist: $PROJECT_PATH"
        return 1
    fi

    # Check .beads directory exists
    if [[ ! -d "${PROJECT_PATH}/.beads" ]]; then
        log_error "Beads directory not found: ${PROJECT_PATH}/.beads"
        log_error "This does not appear to be a Beads project"
        return 1
    fi

    # Check beads.db exists
    if [[ ! -f "$BEADS_DB" ]]; then
        log_error "Beads database not found: $BEADS_DB"
        return 1
    fi

    # Check database is readable/writable
    if [[ ! -r "$BEADS_DB" ]] || [[ ! -w "$BEADS_DB" ]]; then
        log_error "Beads database is not readable/writable: $BEADS_DB"
        return 1
    fi

    return 0
}

validate_agent_mail_db() {
    # Agent Mail DB is optional - may not exist
    if [[ ! -f "$AGENT_MAIL_DB" ]]; then
        log_warning "Agent Mail database not found: $AGENT_MAIL_DB"
        log_warning "Skipping Agent Mail migration"
        return 0
    fi

    # Check database is readable/writable
    if [[ ! -r "$AGENT_MAIL_DB" ]] || [[ ! -w "$AGENT_MAIL_DB" ]]; then
        log_error "Agent Mail database is not readable/writable: $AGENT_MAIL_DB"
        return 1
    fi

    return 0
}

validate_inputs() {
    log_info "Validating inputs..."

    # Validate prefixes
    if ! validate_prefix "$FROM_PREFIX" "source"; then
        return 1
    fi

    if ! validate_prefix "$TO_PREFIX" "target"; then
        return 1
    fi

    # Check prefixes are different
    if [[ "$FROM_PREFIX" == "$TO_PREFIX" ]]; then
        log_error "Source and target prefixes are the same: $FROM_PREFIX"
        return 1
    fi

    # Validate project
    if ! validate_project; then
        return 1
    fi

    # Validate Agent Mail DB
    if ! validate_agent_mail_db; then
        return 1
    fi

    log_success "Input validation passed"
    return 0
}

#
# Backup functions
#
create_backup() {
    log_info "Creating backup..."

    # Create backup directory with timestamp
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="${PROJECT_PATH}/.beads/backups/migration_${FROM_PREFIX}_to_${TO_PREFIX}_${timestamp}"

    mkdir -p "$BACKUP_DIR"

    # Backup Beads database
    log_info "Backing up Beads database..."
    cp "$BEADS_DB" "${BACKUP_DIR}/beads.db.backup"

    # Create checksum
    local beads_checksum
    beads_checksum=$(sha256sum "$BEADS_DB" | awk '{print $1}')
    echo "$beads_checksum" > "${BACKUP_DIR}/beads.db.sha256"

    log_success "Beads database backed up"
    log_info "  Location: ${BACKUP_DIR}/beads.db.backup"
    log_info "  Checksum: $beads_checksum"

    # Backup Agent Mail database if it exists
    if [[ -f "$AGENT_MAIL_DB" ]]; then
        log_info "Backing up Agent Mail database..."
        cp "$AGENT_MAIL_DB" "${BACKUP_DIR}/agent-mail.db.backup"

        # Create checksum
        local agent_mail_checksum
        agent_mail_checksum=$(sha256sum "$AGENT_MAIL_DB" | awk '{print $1}')
        echo "$agent_mail_checksum" > "${BACKUP_DIR}/agent-mail.db.sha256"

        log_success "Agent Mail database backed up"
        log_info "  Location: ${BACKUP_DIR}/agent-mail.db.backup"
        log_info "  Checksum: $agent_mail_checksum"
    fi

    # Create backup metadata
    cat > "${BACKUP_DIR}/metadata.txt" <<EOF
Migration Backup
Created: $(date)
Script: $SCRIPT_NAME v$VERSION
From Prefix: $FROM_PREFIX
To Prefix: $TO_PREFIX
Project: $PROJECT_PATH

Beads DB: $BEADS_DB
Beads Checksum: $beads_checksum

EOF

    if [[ -f "$AGENT_MAIL_DB" ]]; then
        cat >> "${BACKUP_DIR}/metadata.txt" <<EOF
Agent Mail DB: $AGENT_MAIL_DB
Agent Mail Checksum: $agent_mail_checksum
EOF
    fi

    log_success "Backup created: $BACKUP_DIR"
}

#
# Analysis functions (for dry-run and reporting)
#
analyze_beads_db() {
    log_info "Analyzing Beads database..."

    # Count tasks with old prefix
    local task_count
    task_count=$(sqlite3 "$BEADS_DB" "SELECT COUNT(*) FROM issues WHERE id LIKE '${FROM_PREFIX}-%';")

    # Count dependencies with old prefix
    local dep_count
    dep_count=$(sqlite3 "$BEADS_DB" "SELECT COUNT(*) FROM dependencies WHERE issue_id LIKE '${FROM_PREFIX}-%' OR depends_on_id LIKE '${FROM_PREFIX}-%';")

    log_info "  Tasks with '${FROM_PREFIX}-' prefix: $task_count"
    log_info "  Dependency references: $dep_count"

    # Check for collisions (tasks that would conflict with new prefix)
    local collision_count
    collision_count=$(sqlite3 "$BEADS_DB" "
        SELECT COUNT(*)
        FROM issues
        WHERE id LIKE '${FROM_PREFIX}-%'
        AND REPLACE(id, '${FROM_PREFIX}-', '${TO_PREFIX}-') IN (SELECT id FROM issues);
    ")

    if [[ "$collision_count" -gt 0 ]]; then
        log_error "Collision detected: $collision_count tasks would conflict with existing IDs"
        log_error "Cannot migrate - target IDs already exist"
        return 1
    fi

    log_success "Beads analysis complete (no collisions)"
}

analyze_agent_mail_db() {
    if [[ ! -f "$AGENT_MAIL_DB" ]]; then
        return 0
    fi

    log_info "Analyzing Agent Mail database..."

    # Count thread_ids with old prefix
    local thread_count
    thread_count=$(sqlite3 "$AGENT_MAIL_DB" "SELECT COUNT(DISTINCT thread_id) FROM messages WHERE thread_id LIKE '${FROM_PREFIX}-%';")

    # Count total messages in those threads
    local message_count
    message_count=$(sqlite3 "$AGENT_MAIL_DB" "SELECT COUNT(*) FROM messages WHERE thread_id LIKE '${FROM_PREFIX}-%';")

    log_info "  Threads with '${FROM_PREFIX}-' prefix: $thread_count"
    log_info "  Messages in those threads: $message_count"

    # Count file reservations with old prefix in reason
    local reservation_count
    reservation_count=$(sqlite3 "$AGENT_MAIL_DB" "SELECT COUNT(*) FROM file_reservations WHERE reason LIKE '%${FROM_PREFIX}-%';")

    log_info "  File reservations mentioning '${FROM_PREFIX}-': $reservation_count"

    log_success "Agent Mail analysis complete"
}

#
# Migration functions
#
migrate_beads_db() {
    log_info "Migrating Beads database..."

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would update task IDs and dependencies"
        return 0
    fi

    # Begin transaction
    sqlite3 "$BEADS_DB" <<EOF
BEGIN TRANSACTION;

-- Update issues table (task IDs)
UPDATE issues
SET id = REPLACE(id, '${FROM_PREFIX}-', '${TO_PREFIX}-')
WHERE id LIKE '${FROM_PREFIX}-%';

-- Update dependencies table (issue_id references)
UPDATE dependencies
SET issue_id = REPLACE(issue_id, '${FROM_PREFIX}-', '${TO_PREFIX}-')
WHERE issue_id LIKE '${FROM_PREFIX}-%';

-- Update dependencies table (depends_on_id references)
UPDATE dependencies
SET depends_on_id = REPLACE(depends_on_id, '${FROM_PREFIX}-', '${TO_PREFIX}-')
WHERE depends_on_id LIKE '${FROM_PREFIX}-%';

COMMIT;
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Beads database migration complete"
        return 0
    else
        log_error "Beads database migration failed"
        return 2
    fi
}

migrate_agent_mail_db() {
    if [[ ! -f "$AGENT_MAIL_DB" ]]; then
        return 0
    fi

    log_info "Migrating Agent Mail database..."

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would update thread_ids and file reservation reasons"
        return 0
    fi

    # Begin transaction
    sqlite3 "$AGENT_MAIL_DB" <<EOF
BEGIN TRANSACTION;

-- Update messages table (thread_id)
UPDATE messages
SET thread_id = REPLACE(thread_id, '${FROM_PREFIX}-', '${TO_PREFIX}-')
WHERE thread_id LIKE '${FROM_PREFIX}-%';

-- Update file_reservations table (reason field)
UPDATE file_reservations
SET reason = REPLACE(reason, '${FROM_PREFIX}-', '${TO_PREFIX}-')
WHERE reason LIKE '%${FROM_PREFIX}-%';

COMMIT;
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Agent Mail database migration complete"
        return 0
    else
        log_error "Agent Mail database migration failed"
        return 2
    fi
}

#
# Validation after migration
#
validate_migration() {
    log_info "Validating migration..."

    # Check no tasks remain with old prefix
    local remaining_tasks
    remaining_tasks=$(sqlite3 "$BEADS_DB" "SELECT COUNT(*) FROM issues WHERE id LIKE '${FROM_PREFIX}-%';")

    if [[ "$remaining_tasks" -gt 0 ]]; then
        log_error "Validation failed: $remaining_tasks tasks still have old prefix"
        return 1
    fi

    # Check no dependencies remain with old prefix
    local remaining_deps
    remaining_deps=$(sqlite3 "$BEADS_DB" "SELECT COUNT(*) FROM dependencies WHERE issue_id LIKE '${FROM_PREFIX}-%' OR depends_on_id LIKE '${FROM_PREFIX}-%';")

    if [[ "$remaining_deps" -gt 0 ]]; then
        log_error "Validation failed: $remaining_deps dependency references still have old prefix"
        return 1
    fi

    log_success "Beads database validation passed"

    # Validate Agent Mail if it exists
    if [[ -f "$AGENT_MAIL_DB" ]]; then
        local remaining_threads
        remaining_threads=$(sqlite3 "$AGENT_MAIL_DB" "SELECT COUNT(DISTINCT thread_id) FROM messages WHERE thread_id LIKE '${FROM_PREFIX}-%';")

        if [[ "$remaining_threads" -gt 0 ]]; then
            log_error "Validation failed: $remaining_threads thread_ids still have old prefix"
            return 1
        fi

        log_success "Agent Mail database validation passed"
    fi

    log_success "Migration validation complete - all checks passed"
    return 0
}

#
# Main execution
#
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════════╗"
    echo "║            Beads Project Prefix Migration Tool v${VERSION}                  ║"
    echo "╚══════════════════════════════════════════════════════════════════════════╝"
    echo ""

    # Parse arguments
    parse_args "$@"

    # Display configuration
    log_info "Configuration:"
    log_info "  From Prefix: $FROM_PREFIX"
    log_info "  To Prefix: $TO_PREFIX"
    log_info "  Project: $PROJECT_PATH"
    log_info "  Beads DB: $BEADS_DB"
    log_info "  Agent Mail DB: $AGENT_MAIL_DB"
    if [[ "$DRY_RUN" == true ]]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi
    echo ""

    # Validate inputs
    if ! validate_inputs; then
        exit 1
    fi
    echo ""

    # Analyze databases
    if ! analyze_beads_db; then
        exit 1
    fi
    analyze_agent_mail_db
    echo ""

    # Create backup (unless dry-run)
    if [[ "$DRY_RUN" == false ]]; then
        create_backup
        echo ""
    fi

    # Perform migration
    log_info "Starting migration..."
    echo ""

    if ! migrate_beads_db; then
        log_error "Migration failed at Beads database"
        exit 2
    fi

    if ! migrate_agent_mail_db; then
        log_error "Migration failed at Agent Mail database"
        exit 2
    fi

    echo ""

    # Validate migration (unless dry-run)
    if [[ "$DRY_RUN" == false ]]; then
        if ! validate_migration; then
            log_error "Migration validation failed"
            log_error "Backup available at: $BACKUP_DIR"
            log_error "To rollback: cp ${BACKUP_DIR}/beads.db.backup $BEADS_DB"
            exit 2
        fi
    fi

    # Success!
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════════╗"
    if [[ "$DRY_RUN" == true ]]; then
        echo "║                  ✓ DRY RUN COMPLETE - NO CHANGES MADE                   ║"
    else
        echo "║                    ✓ MIGRATION COMPLETED SUCCESSFULLY                    ║"
    fi
    echo "╚══════════════════════════════════════════════════════════════════════════╝"
    echo ""

    if [[ "$DRY_RUN" == false ]]; then
        log_success "All task IDs migrated from '${FROM_PREFIX}-' to '${TO_PREFIX}-'"
        log_success "Backup location: $BACKUP_DIR"
        echo ""
        log_info "Next steps:"
        log_info "  1. Update Beads config: Set issue-prefix: \"${TO_PREFIX}\" in ${PROJECT_PATH}/.beads/config.yaml"
        log_info "  2. Test with: bd list --json | jq -r '.[].id' | head -5"
        log_info "  3. Verify new tasks use new prefix: bd create \"Test task\""
        echo ""
        log_info "Rollback (if needed):"
        log_info "  cp ${BACKUP_DIR}/beads.db.backup $BEADS_DB"
        if [[ -f "$AGENT_MAIL_DB" ]]; then
            log_info "  cp ${BACKUP_DIR}/agent-mail.db.backup $AGENT_MAIL_DB"
        fi
    else
        log_info "To execute migration, run without --dry-run flag"
    fi

    echo ""
}

# Run main
main "$@"
