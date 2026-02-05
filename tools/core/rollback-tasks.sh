#!/usr/bin/env bash
#
# rollback-tasks.sh - Restore .jat/tasks.db from backup
#
# Usage:
#   rollback-tasks.sh --backup PATH [--verify] [--force]
#
# Example:
#   rollback-tasks.sh --backup ~/code/chimaro/.jat/backups/backup_20231124_123456

set -euo pipefail

SCRIPT_NAME="rollback-tasks.sh"
VERSION="1.0.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

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
${SCRIPT_NAME} v${VERSION} - Restore tasks database from backup

USAGE:
    $SCRIPT_NAME --backup PATH [OPTIONS]

OPTIONS:
    --backup PATH       Path to backup directory (required)
    --verify            Verify backup integrity before restoring
    --force             Skip confirmation prompt
    --help              Show this help message

BACKUP DIRECTORY:
    Must contain: tasks.db.backup, tasks.db.sha256 (for --verify)

EXAMPLES:
    $SCRIPT_NAME --backup ~/code/project/.jat/backups/backup_20231124_123456
    $SCRIPT_NAME --backup ~/code/project/.jat/backups/backup_20231124_123456 --verify --force
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --backup) BACKUP_DIR="$2"; shift 2 ;;
        --verify) VERIFY_MODE=true; shift ;;
        --force) FORCE_MODE=true; shift ;;
        --help) show_help; exit 0 ;;
        --version) echo "$SCRIPT_NAME v$VERSION"; exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$BACKUP_DIR" ]]; then
    log_error "Missing required argument: --backup"; exit 1
fi

BACKUP_DIR="${BACKUP_DIR/#\~/$HOME}"

# Validate backup
if [[ ! -d "$BACKUP_DIR" ]]; then
    log_error "Backup directory does not exist: $BACKUP_DIR"; exit 1
fi
if [[ ! -f "${BACKUP_DIR}/tasks.db.backup" ]]; then
    log_error "Backup file not found: ${BACKUP_DIR}/tasks.db.backup"; exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            Tasks Database Rollback v${VERSION}                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Show metadata if available
if [[ -f "${BACKUP_DIR}/metadata.txt" ]]; then
    log_info "Backup metadata:"
    sed 's/^/  /' "${BACKUP_DIR}/metadata.txt"
    echo ""
fi

# Verify if requested
if [[ "$VERIFY_MODE" == true ]]; then
    if [[ ! -f "${BACKUP_DIR}/tasks.db.sha256" ]]; then
        log_error "Cannot verify without checksum file"; exit 1
    fi
    stored=$(cat "${BACKUP_DIR}/tasks.db.sha256")
    actual=$(sha256sum "${BACKUP_DIR}/tasks.db.backup" | awk '{print $1}')
    if [[ "$stored" != "$actual" ]]; then
        log_error "Checksum mismatch - backup may be corrupted"; exit 1
    fi
    log_success "Backup integrity verified"
fi

# Determine target database path
tasks_db=""
if [[ -f "${BACKUP_DIR}/metadata.txt" ]]; then
    project_path=$(grep "^Project:" "${BACKUP_DIR}/metadata.txt" | cut -d' ' -f2-)
    [[ -n "$project_path" ]] && tasks_db="${project_path}/.jat/tasks.db"
fi
if [[ -z "$tasks_db" ]]; then
    # Infer from backup dir: project/.jat/backups/backup_xxx/
    parent_dir=$(dirname "$(dirname "$BACKUP_DIR")")
    tasks_db="${parent_dir}/tasks.db"
fi

log_info "Target: $tasks_db"

# Confirmation
if [[ "$FORCE_MODE" != true ]]; then
    echo ""
    log_warning "This will overwrite your current database!"
    read -p "Proceed? (yes/no): " -r
    [[ ! "$REPLY" =~ ^[Yy][Ee][Ss]$ ]] && { log_info "Cancelled"; exit 0; }
fi

# Safety backup of current state
if [[ -f "$tasks_db" ]]; then
    safety_dir="${BACKUP_DIR}/pre-rollback_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$safety_dir"
    cp "$tasks_db" "${safety_dir}/tasks.db.current"
    sha256sum "$tasks_db" | awk '{print $1}' > "${safety_dir}/tasks.db.sha256"
    log_success "Safety backup: $safety_dir"
fi

# Restore
cp "${BACKUP_DIR}/tasks.db.backup" "$tasks_db"
log_success "Tasks database restored"

# Restore Agent Mail if backup exists
if [[ -f "${BACKUP_DIR}/agent-mail.db.backup" ]]; then
    cp "${BACKUP_DIR}/agent-mail.db.backup" "$AGENT_MAIL_DB"
    log_success "Agent Mail database restored"
fi

echo ""
log_success "Rollback complete from: $BACKUP_DIR"
echo ""
log_info "Verify with: jt list --json | head -5"
echo ""
