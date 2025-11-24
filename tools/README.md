# Beads Migration Tool

## beads-migrate-prefix.sh

Migrate Beads task ID prefixes across all related databases and files.

### Features

- **Safe Migration**: Automatic backup creation with SHA256 checksums
- **Atomic Updates**: Uses SQLite transactions (all-or-nothing)
- **Dry-Run Mode**: Preview changes without modifying data
- **Comprehensive**: Updates Beads DB, Agent Mail, and file reservations
- **Validated**: Pre and post-migration validation checks
- **Color Output**: Clear, color-coded logging for easy monitoring

### What It Migrates

1. **Beads Database** (`beads.db`)
   - Task IDs in `issues` table
   - References in `dependencies.issue_id`
   - References in `dependencies.depends_on_id`

2. **Agent Mail Database** (`~/.agent-mail.db`)
   - Thread IDs in `messages.thread_id`
   - Task references in `file_reservations.reason`

3. **Preserves**
   - All metadata and timestamps
   - Task relationships (dependencies)
   - Message history and threads

### Usage

```bash
# Preview migration (recommended first step)
./tools/beads-migrate-prefix.sh \
  --from dirt \
  --to chimaro \
  --project ~/code/chimaro \
  --dry-run

# Execute migration
./tools/beads-migrate-prefix.sh \
  --from dirt \
  --to chimaro \
  --project ~/code/chimaro
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `--from PREFIX` | Old prefix to migrate from (e.g., `dirt`) | Yes |
| `--to PREFIX` | New prefix to migrate to (e.g., `chimaro`) | Yes |
| `--project PATH` | Path to project directory | Yes |
| `--dry-run` | Preview changes without modifying | No |
| `--help` | Show help message | No |
| `--version` | Show version information | No |

### Safety Features

1. **Automatic Backup**
   - Creates timestamped backup directory
   - Copies all databases before migration
   - Generates SHA256 checksums for verification
   - Location: `<project>/.beads/backups/migration_<from>_to_<to>_<timestamp>/`

2. **Validation**
   - Validates prefix format (lowercase alphanumeric + hyphens)
   - Checks project structure exists
   - Verifies database accessibility
   - Detects ID collisions before migration
   - Validates results after migration

3. **Atomic Updates**
   - SQLite transactions ensure all-or-nothing updates
   - Rollback on any error
   - No partial migrations

4. **Error Handling**
   - Clear error messages
   - Exit codes for scripting
   - Rollback instructions on failure

### Example Output

```
╔══════════════════════════════════════════════════════════════════════════╗
║            Beads Project Prefix Migration Tool v1.0.0                  ║
╚══════════════════════════════════════════════════════════════════════════╝

ℹ  Configuration:
ℹ    From Prefix: dirt
ℹ    To Prefix: chimaro
ℹ    Project: /home/user/code/chimaro
ℹ    Beads DB: /home/user/code/chimaro/.beads/beads.db
ℹ    Agent Mail DB: /home/user/.agent-mail.db

ℹ  Validating inputs...
✓  Input validation passed

ℹ  Analyzing Beads database...
ℹ    Tasks with 'dirt-' prefix: 389
ℹ    Dependency references: 15
✓  Beads analysis complete (no collisions)

ℹ  Creating backup...
✓  Beads database backed up
ℹ    Location: /home/user/code/chimaro/.beads/backups/migration_dirt_to_chimaro_20251124_111843/beads.db.backup
ℹ    Checksum: 7a8b9c...

ℹ  Starting migration...
ℹ  Migrating Beads database...
✓  Beads database migration complete

ℹ  Validating migration...
✓  Beads database validation passed
✓  Migration validation complete - all checks passed

╔══════════════════════════════════════════════════════════════════════════╗
║                    ✓ MIGRATION COMPLETED SUCCESSFULLY                    ║
╚══════════════════════════════════════════════════════════════════════════╝

✓  All task IDs migrated from 'dirt-' to 'chimaro-'
✓  Backup location: /home/user/code/chimaro/.beads/backups/migration_dirt_to_chimaro_20251124_111843

ℹ  Next steps:
ℹ    1. Update Beads config: Set issue-prefix: "chimaro" in /home/user/code/chimaro/.beads/config.yaml
ℹ    2. Test with: bd list --json | jq -r '.[].id' | head -5
ℹ    3. Verify new tasks use new prefix: bd create "Test task"

ℹ  Rollback (if needed):
ℹ    cp /home/user/code/chimaro/.beads/backups/migration_dirt_to_chimaro_20251124_111843/beads.db.backup /home/user/code/chimaro/.beads/beads.db
```

### Workflow

#### 1. **Dry-Run First** (always recommended)

```bash
./tools/beads-migrate-prefix.sh \
  --from dirt \
  --to chimaro \
  --project ~/code/chimaro \
  --dry-run
```

Review the output:
- How many tasks will be migrated?
- Any collision warnings?
- Are the numbers reasonable?

#### 2. **Execute Migration**

```bash
./tools/beads-migrate-prefix.sh \
  --from dirt \
  --to chimaro \
  --project ~/code/chimaro
```

#### 3. **Update Config**

Edit `<project>/.beads/config.yaml`:

```yaml
# Uncomment and set new prefix
issue-prefix: "chimaro"
```

#### 4. **Verify**

```bash
# Check existing tasks have new IDs
bd list --json | jq -r '.[].id' | head -5

# Test new tasks use new prefix
bd create "Test task after migration"
```

### Rollback

If migration fails or you need to revert:

```bash
# Beads database
cp <backup-dir>/beads.db.backup <project>/.beads/beads.db

# Agent Mail database (if migrated)
cp <backup-dir>/agent-mail.db.backup ~/.agent-mail.db
```

Backup location is printed after migration completes.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Invalid arguments or validation failed |
| 2 | Database error (migration or validation failed) |
| 3 | Backup/restore failed |

### Requirements

- `bash` (4.0+)
- `sqlite3` command-line tool
- `sha256sum` (for checksums)
- Read/write access to Beads database
- Read/write access to Agent Mail database (if present)

### Limitations

- Does **not** modify git commit messages (intentional - history stays unchanged)
- Does **not** update external documentation or files
- Agent Mail database is optional (skips if not found)
- Requires exclusive access to databases during migration

### Troubleshooting

**"Beads directory not found"**
- Verify project path is correct
- Ensure project was initialized with Beads (`bd init`)

**"Collision detected"**
- Target prefix already has tasks with same IDs
- Choose different target prefix or rename existing tasks first

**"Database is not readable/writable"**
- Check file permissions
- Ensure no other process is locking the database
- Try closing Beads daemon: `bd daemon stop`

**Migration failed mid-way**
- Check error message for details
- Restore from backup (see Rollback section)
- Report issue with backup location and error details

### Development

The tool is designed to be:
- **Reusable**: Works with any Beads project and prefix pair
- **Safe**: Multiple validation layers and atomic transactions
- **Clear**: Verbose logging and color-coded output
- **Tested**: Dry-run mode for safe testing

### Related Tasks

- `jat-625k`: Design migration algorithm and data structures
- `jat-v0i6`: Create backup and rollback mechanism
- `jat-o8oy`: Implement SQLite schema migration logic
- `jat-f9pa`: Test migration on isolated copy
- `jat-y84z`: Execute production migration

### License

Part of Jomarchy Agent Tools (JAT) project.
