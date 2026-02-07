# JAT Tools

## Overview

This directory contains CLI tools for JAT task management.

---

## Review Rules Management

Configure which tasks auto-proceed vs require human review on completion.

### jt-review-rules

Manage review rules that determine task completion behavior.

```bash
# Show all current rules
jt-review-rules

# Set max auto-proceed priority for a type
jt-review-rules --type bug --max-auto 1    # P0-P1 bugs auto, P2-P4 review

# Show rule for specific type
jt-review-rules --type feature

# Set default action for unconfigured types
jt-review-rules --default auto             # Default to auto-proceed

# Reset all rules to defaults
jt-review-rules --reset
```

#### Configuration Schema

Rules are stored in two places (automatically synced):
1. **`jt config`** key-value pairs (for CLI access)
2. **`.jat/review-rules.json`** (human-readable, version-controllable)

##### JSON File Schema (v1)

```json
{
  "version": 1,
  "defaultAction": "review",
  "priorityThreshold": 3,
  "rules": [
    { "type": "bug", "maxAutoPriority": 3, "note": "P0-P3 auto" },
    { "type": "feature", "maxAutoPriority": 3 },
    { "type": "epic", "maxAutoPriority": -1, "note": "Always review" }
  ],
  "overrides": [
    { "taskId": "jat-abc", "action": "always_review", "reason": "Security" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Schema version (currently 1) |
| `defaultAction` | string | Default: `review` or `auto` |
| `priorityThreshold` | number | Global fallback (0-4) |
| `rules[].type` | string | `bug`, `feature`, `task`, `chore`, `epic` |
| `rules[].maxAutoPriority` | number | -1 to 4 |
| `rules[].note` | string | Optional explanation |
| `overrides[].taskId` | string | Task ID to override |
| `overrides[].action` | string | `always_review` or `always_auto` |
| `overrides[].reason` | string | Optional explanation |

##### jt config Keys

Rules are also stored as `jt config` key-value pairs:

| Key | Values | Description |
|-----|--------|-------------|
| `review_rules.default_action` | `review` or `auto` | Default when no type rule matches |
| `review_rules.<type>.max_auto` | `-1` to `4` | Max priority that auto-proceeds |

Types: `bug`, `feature`, `task`, `chore`, `epic`

#### Priority Thresholds

- `max_auto = 3` → P0-P3 auto-proceed, P4 requires review
- `max_auto = 1` → P0-P1 auto-proceed, P2-P4 require review
- `max_auto = -1` → All priorities require review
- `max_auto = 4` → All priorities auto-proceed

### jt-review-rules-loader

Low-level tool for managing `.jat/review-rules.json` directly.

```bash
# Load rules (creates defaults if missing)
jt-review-rules-loader

# Initialize with default rules
jt-review-rules-loader --init

# Validate existing rules file
jt-review-rules-loader --validate

# Sync JSON to jt config
jt-review-rules-loader --sync-to-config

# Sync jt config to JSON
jt-review-rules-loader --sync-from-config

# Get maxAutoPriority for a type
jt-review-rules-loader --get bug           # Returns: 3

# Get override for a task
jt-review-rules-loader --get-override jat-abc  # Returns: always_review or none

# Output as JSON
jt-review-rules-loader --json

# Override management (JSON file overrides)
jt-review-rules-loader --add-override jat-abc always_review "Security sensitive"
jt-review-rules-loader --add-override jat-xyz always_auto
jt-review-rules-loader --remove-override jat-abc
jt-review-rules-loader --list-overrides
```

**Note:** Changes made via `jt-review-rules` are automatically synced to the JSON file. The loader is primarily for:
- Direct JSON file manipulation
- Schema migration between versions
- Programmatic access to rules
- Managing centralized task overrides

### jt-set-review-override

Set task-level overrides (stored on the task itself, not in JSON file).

```bash
# Set override on a task
jt-set-review-override jat-abc always_review "Security sensitive"
jt-set-review-override jat-xyz always_auto

# Show current override
jt-set-review-override jat-abc --show

# Clear override
jt-set-review-override jat-abc --clear
```

**Two types of overrides:**

| Type | Command | Storage | Use Case |
|------|---------|---------|----------|
| JSON file | `--add-override` | `.jat/review-rules.json` | Standing rules, version-controlled |
| Task-level | `jt-set-review-override` | Task's notes field | One-off decisions |

Task-level overrides take precedence over JSON file overrides.

### jt-check-review

Preview what review action would be taken for a task.

```bash
# Check single task
jt-check-review jat-abc

# JSON output
jt-check-review jat-xyz --json

# Check all open/in_progress tasks
jt-check-review --batch
```

#### Example Output

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    🔍 Review Check: jat-abc                              ║
╚══════════════════════════════════════════════════════════════════════════╝

  Task: Fix authentication timeout
  Type: bug
  Priority: P2 (Medium)
  Status: in_progress

  Rule applied:
    Source: Type rule (review_rules.bug.max_auto = 1)

  ┌────────────────────────────────────────────────────────────────────────┐
  │  👁 DECISION: REQUIRES REVIEW                                          │
  │                                                                        │
  │  This task will wait for human review before closing.                  │
  │                                                                        │
  │  Reason: Priority P2 > max_auto P1 for type 'bug'                     │
  └────────────────────────────────────────────────────────────────────────┘

  To change this behavior:
    • Increase max_auto: jt-review-rules --type bug --max-auto 2
    • Set task override: jt update jat-abc --review-override always_auto
```

---

## Database Tools

Two complementary tools for safe JAT task database backup and rollback:

1. **backup-jat.sh** - Standalone backup utility
2. **rollback-jat.sh** - Restore from backup

---

## backup-jat.sh

Standalone utility to create timestamped backups of JAT task and Agent Mail databases.

### Usage

```bash
# Basic backup
./tools/backup-jat.sh --project ~/code/chimaro

# Labeled backup (for specific purpose)
./tools/backup-jat.sh --project ~/code/chimaro --label "before-migration"

# Backup with integrity verification
./tools/backup-jat.sh --project ~/code/chimaro --verify
```

### Features

- Timestamped backup directories
- SHA256 checksum verification
- Metadata file with backup details
- Optional integrity verification
- Backs up both JAT task and Agent Mail databases

### Backup Location

```
<project>/.jat/backups/backup_<timestamp>[_<label>]/
  ├── tasks.db.backup
  ├── tasks.db.sha256
  ├── agent-mail.db.backup (if exists)
  ├── agent-mail.db.sha256 (if exists)
  └── metadata.txt
```

### Options

| Option | Description |
|--------|-------------|
| `--project PATH` | Path to JAT project (required) |
| `--label LABEL` | Optional label for backup |
| `--verify` | Verify backup integrity after creation |
| `--help` | Show help message |
| `--version` | Show version information |

---

## rollback-jat.sh

Restore JAT task and Agent Mail databases from a backup.

### Usage

```bash
# Restore with confirmation prompt
./tools/rollback-jat.sh --backup ~/code/chimaro/.jat/backups/backup_20231124_123456

# Restore with integrity verification
./tools/rollback-jat.sh --backup <backup-dir> --verify

# Restore without confirmation (automated)
./tools/rollback-jat.sh --backup <backup-dir> --force
```

### Safety Features

- **Checksum verification** (optional with `--verify`)
- **Confirmation prompt** (skip with `--force`)
- **Safety backup** of current state before restoring
- Validates backup directory structure
- Detailed rollback instructions

### Pre-Rollback Safety Backup

Before restoring, creates safety backup of current state:

```
<backup-dir>/pre-rollback_<timestamp>/
  ├── tasks.db.current
  ├── tasks.db.sha256
  ├── agent-mail.db.current (if exists)
  └── agent-mail.db.sha256 (if exists)
```

This ensures you can recover if rollback doesn't work as expected.

### Options

| Option | Description |
|--------|-------------|
| `--backup PATH` | Path to backup directory (required) |
| `--verify` | Verify backup integrity before restoring |
| `--force` | Skip confirmation prompt |
| `--help` | Show help message |
| `--version` | Show version information |
