#!/usr/bin/env bash
#
# backup-squad.sh - SQUAD task database backup utility
#
# Creates timestamped backups of the SQUAD task database (.squad/tasks.db)
# and Agent Mail database (~/.agent-mail.db) with SHA256 checksums.
#
# Usage:
#   ./backup-squad.sh --project PATH [--label LABEL] [--verify]
#
# Example:
#   ./backup-squad.sh --project ~/code/chimaro --label "before-migration"
#

set -euo pipefail

# Script metadata
SCRIPT_NAME="backup-squad.sh"
VERSION="2.0.0"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_PATH=""
BACKUP_LABEL=""
VERIFY_MODE=false
AGENT_MAIL_DB="$HOME/.agent-mail.db"
BACKUP_DIR_RESULT=""

log_error() { echo -e "${RED}✗${NC}  $1" >&2; }
log_success() { echo -e "${GREEN}✓${NC}  $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
log_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

show_help() {
    cat <<EOF
${SCRIPT_NAME} v${VERSION} - SQUAD task database backup utility

USAGE:
    $SCRIPT_NAME --project PATH [OPTIONS]

OPTIONS:
    --project PATH      Path to project directory (required)
    --label LABEL       Optional label for backup (e.g., "before-migration")
    --verify            Verify backup integrity after creation
    --help              Show this help message
    --version           Show version information

DESCRIPTION:
    Creates timestamped backups of:
    - SQUAD task database (.squad/tasks.db)
    - Agent Mail database (~/.agent-mail.db, if exists)

BACKUP LOCATION:
    <project>/.squad/backups/backup_<timestamp>[_<label>]/

EXAMPLES:
    $SCRIPT_NAME --project ~/code/chimaro
    $SCRIPT_NAME --project ~/code/chimaro --label "before-migration"
    $SCRIPT_NAME --project ~/code/chimaro --verify

SEE ALSO:
    rollback-squad.sh - Restore from backup

EOF
}

# Argument parsing
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project) PROJECT_PATH="$2"; shift 2 ;;
        --label) BACKUP_LABEL="$2"; shift 2 ;;
        --verify) VERIFY_MODE=true; shift ;;
        --help) show_help; exit 0 ;;
        --version) echo "${SCRIPT_NAME} v${VERSION}"; exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_PATH" ]]; then
    log_error "Missing required argument: --project"
    echo "Run with --help for usage information"
    exit 1
fi

# Expand tilde
PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"

# Validate
TASKS_DB="${PROJECT_PATH}/.squad/tasks.db"
if [[ ! -f "$TASKS_DB" ]]; then
    log_error "Task database not found: $TASKS_DB"
    exit 1
fi

# Create backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR_NAME="backup_${TIMESTAMP}"
[[ -n "$BACKUP_LABEL" ]] && BACKUP_DIR_NAME="${BACKUP_DIR_NAME}_${BACKUP_LABEL}"
BACKUP_DIR="${PROJECT_PATH}/.squad/backups/${BACKUP_DIR_NAME}"
mkdir -p "$BACKUP_DIR"

log_info "Creating backup..."

# Backup task database
cp "$TASKS_DB" "${BACKUP_DIR}/tasks.db.backup"
TASKS_CHECKSUM=$(sha256sum "$TASKS_DB" | awk '{print $1}')
echo "$TASKS_CHECKSUM" > "${BACKUP_DIR}/tasks.db.sha256"
log_success "Task database backed up"
log_info "  Checksum: $TASKS_CHECKSUM"

# Backup Agent Mail database if exists
if [[ -f "$AGENT_MAIL_DB" ]]; then
    cp "$AGENT_MAIL_DB" "${BACKUP_DIR}/agent-mail.db.backup"
    AM_CHECKSUM=$(sha256sum "$AGENT_MAIL_DB" | awk '{print $1}')
    echo "$AM_CHECKSUM" > "${BACKUP_DIR}/agent-mail.db.sha256"
    log_success "Agent Mail database backed up"
else
    log_warning "Agent Mail database not found, skipping"
fi

# Metadata
cat > "${BACKUP_DIR}/metadata.txt" <<EOF
SQUAD Task Database Backup
Created: $(date)
Script: $SCRIPT_NAME v$VERSION
Project: $PROJECT_PATH
Label: ${BACKUP_LABEL:-none}
Tasks DB: $TASKS_DB
Tasks Checksum: $TASKS_CHECKSUM
EOF

BACKUP_DIR_RESULT="$BACKUP_DIR"

# Verify if requested
if [[ "$VERIFY_MODE" == true ]]; then
    log_info "Verifying backup integrity..."

    BACKUP_CHECKSUM=$(sha256sum "${BACKUP_DIR}/tasks.db.backup" | awk '{print $1}')
    if [[ "$TASKS_CHECKSUM" != "$BACKUP_CHECKSUM" ]]; then
        log_error "Checksum mismatch!"
        exit 3
    fi
    log_success "Backup integrity verified"

    ORIGINAL_COUNT=$(sqlite3 "$TASKS_DB" "SELECT COUNT(*) FROM tasks;")
    BACKUP_COUNT=$(sqlite3 "${BACKUP_DIR}/tasks.db.backup" "SELECT COUNT(*) FROM tasks;")
    if [[ "$ORIGINAL_COUNT" != "$BACKUP_COUNT" ]]; then
        log_error "Record count mismatch: original=$ORIGINAL_COUNT backup=$BACKUP_COUNT"
        exit 3
    fi
    log_success "Record count verified: $ORIGINAL_COUNT tasks"
fi

log_success "Backup created: $BACKUP_DIR"
log_info "To restore: ./rollback-squad.sh --backup \"$BACKUP_DIR\""
