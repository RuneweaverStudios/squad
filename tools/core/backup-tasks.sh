#!/usr/bin/env bash
#
# backup-tasks.sh - Backup .jat/tasks.db
#
# Simple cp-based backup with SHA256 checksums.
#
# Usage:
#   backup-tasks.sh --project PATH [--label LABEL] [--verify]
#
# Example:
#   backup-tasks.sh --project ~/code/chimaro --label "before-migration"

set -euo pipefail

SCRIPT_NAME="backup-tasks.sh"
VERSION="1.0.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_PATH=""
BACKUP_LABEL=""
VERIFY_MODE=false
BACKUP_DIR_RESULT=""

log_error() { echo -e "${RED}✗${NC}  $1" >&2; }
log_success() { echo -e "${GREEN}✓${NC}  $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
log_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

show_help() {
    cat <<EOF
${SCRIPT_NAME} v${VERSION} - Backup .jat/tasks.db

USAGE:
    $SCRIPT_NAME --project PATH [OPTIONS]

OPTIONS:
    --project PATH      Path to project directory (required)
    --label LABEL       Optional label for backup
    --verify            Verify backup integrity after creation
    --help              Show this help message

BACKUP LOCATION:
    <project>/.jat/backups/backup_<timestamp>[_<label>]/

EXAMPLES:
    $SCRIPT_NAME --project ~/code/chimaro
    $SCRIPT_NAME --project ~/code/chimaro --label "before-migration" --verify
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project) PROJECT_PATH="$2"; shift 2 ;;
        --label) BACKUP_LABEL="$2"; shift 2 ;;
        --verify) VERIFY_MODE=true; shift ;;
        --help) show_help; exit 0 ;;
        --version) echo "$SCRIPT_NAME v$VERSION"; exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_PATH" ]]; then
    log_error "Missing required argument: --project"
    exit 1
fi

PROJECT_PATH="${PROJECT_PATH/#\~/$HOME}"
TASKS_DB="${PROJECT_PATH}/.jat/tasks.db"

# Validate
if [[ ! -d "$PROJECT_PATH" ]]; then
    log_error "Project directory does not exist: $PROJECT_PATH"; exit 1
fi
if [[ ! -f "$TASKS_DB" ]]; then
    log_error "Tasks database not found: $TASKS_DB"; exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Tasks Database Backup v${VERSION}                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Create backup directory
timestamp=$(date +%Y%m%d_%H%M%S)
backup_dir_name="backup_${timestamp}"
[[ -n "$BACKUP_LABEL" ]] && backup_dir_name="${backup_dir_name}_${BACKUP_LABEL}"
backup_dir="${PROJECT_PATH}/.jat/backups/${backup_dir_name}"
mkdir -p "$backup_dir"

# Copy database
log_info "Backing up tasks database..."
cp "$TASKS_DB" "${backup_dir}/tasks.db.backup"

# Checksum
checksum=$(sha256sum "$TASKS_DB" | awk '{print $1}')
echo "$checksum" > "${backup_dir}/tasks.db.sha256"

log_success "Tasks database backed up"
log_info "  Location: ${backup_dir}/tasks.db.backup"
log_info "  Checksum: $checksum"

# Also backup Agent Mail if it exists
AGENT_MAIL_DB="$HOME/.agent-mail.db"
if [[ -f "$AGENT_MAIL_DB" ]]; then
    log_info "Backing up Agent Mail database..."
    cp "$AGENT_MAIL_DB" "${backup_dir}/agent-mail.db.backup"
    am_checksum=$(sha256sum "$AGENT_MAIL_DB" | awk '{print $1}')
    echo "$am_checksum" > "${backup_dir}/agent-mail.db.sha256"
    log_success "Agent Mail database backed up"
fi

# Metadata
cat > "${backup_dir}/metadata.txt" <<EOF
Tasks Database Backup
Created: $(date)
Script: $SCRIPT_NAME v$VERSION
Project: $PROJECT_PATH
Label: ${BACKUP_LABEL:-none}
Tasks DB: $TASKS_DB
Checksum: $checksum
EOF

BACKUP_DIR_RESULT="$backup_dir"

# Verify if requested
if [[ "$VERIFY_MODE" == true ]]; then
    log_info "Verifying backup..."
    backup_checksum=$(sha256sum "${backup_dir}/tasks.db.backup" | awk '{print $1}')
    if [[ "$checksum" != "$backup_checksum" ]]; then
        log_error "Checksum mismatch!"; exit 3
    fi
    original_count=$(sqlite3 "$TASKS_DB" "SELECT COUNT(*) FROM tasks;" 2>/dev/null || echo "?")
    backup_count=$(sqlite3 "${backup_dir}/tasks.db.backup" "SELECT COUNT(*) FROM tasks;" 2>/dev/null || echo "?")
    if [[ "$original_count" != "$backup_count" ]]; then
        log_error "Record count mismatch! Original: $original_count, Backup: $backup_count"; exit 3
    fi
    log_success "Backup verified: $original_count tasks"
fi

echo ""
log_success "Backup created: $backup_dir"
echo ""
log_info "To restore: rollback-tasks.sh --backup \"$backup_dir\""
echo ""
