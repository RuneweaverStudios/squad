#!/usr/bin/env bash
#
# rollback-squad.sh - Restore SQUAD task database from backup
#
# Safely restores SQUAD task and Agent Mail databases from a timestamped backup,
# with checksum verification for integrity.
#
# Usage:
#   ./rollback-squad.sh --backup PATH [--verify] [--force]
#
# Example:
#   ./rollback-squad.sh --backup ~/code/chimaro/.squad/backups/backup_20260205_123456
#

set -euo pipefail

# Script metadata
SCRIPT_NAME="rollback-squad.sh"
VERSION="2.0.0"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
BACKUP_DIR=""
VERIFY_MODE=false
FORCE_MODE=false
AGENT_MAIL_DB="$HOME/.agent-mail.db"

log_error() { echo -e "${RED}✗${NC}  $1" >&2; }
log_success() { echo -e "${GREEN}✓${NC}  $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
log_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

show_help() {
    cat <<EOF
${SCRIPT_NAME} v${VERSION} - Restore SQUAD task database from backup

USAGE:
    $SCRIPT_NAME --backup PATH [OPTIONS]

OPTIONS:
    --backup PATH       Path to backup directory (required)
    --verify            Verify backup integrity before restoring
    --force             Skip confirmation prompt
    --help              Show this help message
    --version           Show version information

DESCRIPTION:
    Restores SQUAD task and Agent Mail databases from a backup created by
    backup-squad.sh. Creates a safety backup of current state first.

BACKUP DIRECTORY:
    Must contain:
    - tasks.db.backup (required)
    - tasks.db.sha256 (required for --verify)
    - agent-mail.db.backup (optional)
    - metadata.txt (optional, used to find project path)

EXAMPLES:
    $SCRIPT_NAME --backup ~/code/chimaro/.squad/backups/backup_20260205_123456
    $SCRIPT_NAME --backup PATH --verify
    $SCRIPT_NAME --backup PATH --force

SEE ALSO:
    backup-squad.sh - Create backup

EOF
}

# Argument parsing
while [[ $# -gt 0 ]]; do
    case "$1" in
        --backup) BACKUP_DIR="$2"; shift 2 ;;
        --verify) VERIFY_MODE=true; shift ;;
        --force) FORCE_MODE=true; shift ;;
        --help) show_help; exit 0 ;;
        --version) echo "${SCRIPT_NAME} v${VERSION}"; exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$BACKUP_DIR" ]]; then
    log_error "Missing required argument: --backup"
    echo "Run with --help for usage information"
    exit 1
fi

# Expand tilde
BACKUP_DIR="${BACKUP_DIR/#\~/$HOME}"

# Validate backup
if [[ ! -f "${BACKUP_DIR}/tasks.db.backup" ]]; then
    log_error "Backup file not found: ${BACKUP_DIR}/tasks.db.backup"
    exit 1
fi

# Verify if requested
if [[ "$VERIFY_MODE" == true ]]; then
    if [[ ! -f "${BACKUP_DIR}/tasks.db.sha256" ]]; then
        log_error "Checksum file not found, cannot verify"
        exit 1
    fi

    log_info "Verifying backup integrity..."
    STORED=$(cat "${BACKUP_DIR}/tasks.db.sha256")
    ACTUAL=$(sha256sum "${BACKUP_DIR}/tasks.db.backup" | awk '{print $1}')
    if [[ "$STORED" != "$ACTUAL" ]]; then
        log_error "Checksum mismatch - backup may be corrupted"
        exit 3
    fi
    log_success "Backup integrity verified"
fi

# Determine target database path
TASKS_DB=""
if [[ -f "${BACKUP_DIR}/metadata.txt" ]]; then
    PROJECT_PATH=$(grep "^Project:" "${BACKUP_DIR}/metadata.txt" | cut -d' ' -f2-)
    if [[ -n "$PROJECT_PATH" ]]; then
        TASKS_DB="${PROJECT_PATH}/.squad/tasks.db"
    fi
fi

# Fallback: infer from backup directory structure
# Backup dir is: project/.squad/backups/backup_timestamp/
if [[ -z "$TASKS_DB" ]]; then
    PARENT_DIR=$(dirname "$(dirname "$BACKUP_DIR")")
    TASKS_DB="${PARENT_DIR}/tasks.db"
fi

if [[ ! -d "$(dirname "$TASKS_DB")" ]]; then
    log_error "Cannot determine target database: $TASKS_DB"
    exit 1
fi

log_info "Target database: $TASKS_DB"

# Confirmation
if [[ "$FORCE_MODE" != true ]]; then
    log_warning "This will overwrite your current database!"
    read -p "Proceed? (yes/no): " -r
    if [[ ! "$REPLY" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi
fi

# Safety backup of current state
if [[ -f "$TASKS_DB" ]]; then
    SAFETY_DIR="${BACKUP_DIR}/pre-rollback_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$SAFETY_DIR"
    cp "$TASKS_DB" "${SAFETY_DIR}/tasks.db.current"
    sha256sum "$TASKS_DB" | awk '{print $1}' > "${SAFETY_DIR}/tasks.db.sha256"
    log_success "Safety backup created: $SAFETY_DIR"
fi

# Restore
cp "${BACKUP_DIR}/tasks.db.backup" "$TASKS_DB"
log_success "Task database restored"

if [[ -f "${BACKUP_DIR}/agent-mail.db.backup" ]]; then
    cp "${BACKUP_DIR}/agent-mail.db.backup" "$AGENT_MAIL_DB"
    log_success "Agent Mail database restored"
fi

log_success "Rollback complete from: $BACKUP_DIR"
log_info "Verify with: st list --json | head -5"
