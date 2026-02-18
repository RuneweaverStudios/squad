#!/bin/bash
#
# Automated JSONL cleanup - run via cron or systemd timer
# Deletes Claude Code session files older than 7 days
#
# Add to crontab:
#   0 4 * * * /home/jw/code/squad/tools/scripts/cleanup-jsonl-cron.sh >> /tmp/jsonl-cleanup.log 2>&1
#

PROJECTS_DIR="$HOME/.claude/projects"
DAYS_TO_KEEP=7
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Count before
BEFORE_SIZE=$(du -sh "$PROJECTS_DIR" 2>/dev/null | cut -f1)
BEFORE_COUNT=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l)

# Find and delete old files
OLD_FILES=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f -mtime +$DAYS_TO_KEEP 2>/dev/null)
OLD_COUNT=$(echo "$OLD_FILES" | grep -c . 2>/dev/null || echo 0)

if [[ "$OLD_COUNT" -gt 0 ]]; then
    echo "$OLD_FILES" | xargs rm -f 2>/dev/null
    AFTER_SIZE=$(du -sh "$PROJECTS_DIR" 2>/dev/null | cut -f1)
    echo "$LOG_PREFIX Cleaned $OLD_COUNT files older than ${DAYS_TO_KEEP}d. Size: $BEFORE_SIZE → $AFTER_SIZE"
else
    echo "$LOG_PREFIX No files older than ${DAYS_TO_KEEP}d to clean (total: $BEFORE_COUNT files, $BEFORE_SIZE)"
fi
