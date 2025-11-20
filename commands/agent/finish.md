---
argument-hint: [--skip-summary] [--no-commit]
---

End your agent session gracefully - wrap up work, clean up state, and prepare for next session.

# Agent Session Finish

**Usage:**
- `/agent:finish` - Full session wrap-up with summary
- `/agent:finish --skip-summary` - Quick cleanup without detailed summary
- `/agent:finish --no-commit` - Don't auto-commit/stash changes

**What this command does:**
1. **Complete/Pause In-Progress Work:** Handles current task appropriately
2. **Release All Reservations:** Clean up file locks
3. **Handle Uncommitted Changes:** Commit or stash with clear message
4. **Respond to Messages:** Review and acknowledge pending messages
5. **Capture TODOs:** Convert TODO comments to Beads tasks
6. **Session Summary:** Generate and send daily summary
7. **Clear Session State:** Remove session files
8. **Goodbye Message:** Final output with tomorrow's priorities

**When to use:** End of work session, going to bed, shutting down computer

---

## Implementation Steps

### STEP 0: Parse Arguments

```bash
SKIP_SUMMARY=false
NO_COMMIT=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-summary)
            SKIP_SUMMARY=true
            shift
            ;;
        --no-commit)
            NO_COMMIT=true
            shift
            ;;
        --help|-h)
            # Show help and exit
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done
```

---

### STEP 1: Get Agent Identity

```bash
# Get session ID
SESSION_ID=$(~/code/jat/scripts/get-current-session-id 2>/dev/null | tr -d '\n')

if [[ -z "$SESSION_ID" ]]; then
    echo "❌ Error: Could not determine session ID"
    echo "💡 Statusline hasn't run yet or /tmp/claude-session-${PPID}.txt missing"
    exit 1
fi

# Get agent name from session file
AGENT_NAME=""
if [[ -f ".claude/agent-${SESSION_ID}.txt" ]]; then
    AGENT_NAME=$(cat ".claude/agent-${SESSION_ID}.txt" 2>/dev/null | tr -d '\n')
fi

if [[ -z "$AGENT_NAME" ]]; then
    echo "❌ Error: No agent registered for this session"
    echo "💡 Run /agent:register or /agent:start first"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                    👋 SESSION WRAP-UP - $AGENT_NAME"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
```

---

### STEP 2: Handle In-Progress Work

```bash
# Check for in-progress tasks assigned to this agent
IN_PROGRESS_TASKS=$(bd list --json 2>/dev/null | jq -r --arg agent "$AGENT_NAME" '.[] | select(.assignee == $agent and .status == "in_progress") | .id')

if [[ -n "$IN_PROGRESS_TASKS" ]]; then
    echo "📋 In-Progress Work:"
    echo ""

    for task_id in $IN_PROGRESS_TASKS; do
        TASK_INFO=$(bd show "$task_id" --json 2>/dev/null | jq -r '.[0]')
        TASK_TITLE=$(echo "$TASK_INFO" | jq -r '.title')

        echo "  📌 $task_id - $TASK_TITLE"
        echo ""

        # Ask what to do with each task
        echo "  What should we do with this task?"
        echo "    1. Mark as paused (end of session)"
        echo "    2. Keep as in_progress (will resume tomorrow)"
        echo "    3. Complete it now"
        echo ""
        read -p "  Choice (1/2/3): " -n 1 -r
        echo ""
        echo ""

        case $REPLY in
            1)
                # Pause task
                bd update "$task_id" --status open 2>/dev/null

                # Send pause message to Agent Mail
                am-send "[$task_id] Paused: End of session" \
                    "Pausing work on this task for end of session.

**Current Status:** Work in progress
**Next Steps:** Resume in next session
**Agent:** $AGENT_NAME

Will resume when session restarts." \
                    --from "$AGENT_NAME" \
                    --to "Team" \
                    --thread "$task_id" 2>/dev/null || true

                echo "  ⏸️  Paused: $task_id"
                ;;
            2)
                # Keep in_progress
                echo "  ✓ Keeping in_progress: $task_id"
                ;;
            3)
                # Complete - suggest running /agent:complete
                echo "  💡 Please run: /agent:complete $task_id"
                echo "  (Then run /agent:finish again)"
                exit 0
                ;;
            *)
                echo "  ⚠️  Invalid choice, keeping as in_progress"
                ;;
        esac
    done
    echo ""
fi
```

---

### STEP 3: Release All File Reservations

```bash
echo "🔒 Releasing file reservations..."

# Get all active reservations for this agent
ACTIVE_RESERVATIONS=$(am-reservations --agent "$AGENT_NAME" 2>/dev/null | grep "^Pattern:" | sed 's/^Pattern: //')

if [[ -n "$ACTIVE_RESERVATIONS" ]]; then
    RELEASE_COUNT=0

    while IFS= read -r pattern; do
        am-release "$pattern" --agent "$AGENT_NAME" >/dev/null 2>&1 && ((RELEASE_COUNT++))
    done <<< "$ACTIVE_RESERVATIONS"

    echo "  ✓ Released $RELEASE_COUNT reservation(s)"
else
    echo "  ✓ No active reservations"
fi
echo ""
```

---

### STEP 4: Handle Uncommitted Changes

```bash
if [[ "$NO_COMMIT" != true ]]; then
    echo "💾 Checking for uncommitted changes..."

    # Check git status
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        echo "  ⚠️  Found uncommitted changes"
        echo ""

        # Show brief diff stats
        echo "  Modified files:"
        git diff --stat
        echo ""

        echo "  What should we do?"
        echo "    1. Auto-commit with 'WIP: End of session' message"
        echo "    2. Auto-stash with timestamp"
        echo "    3. Skip (leave as-is)"
        echo ""
        read -p "  Choice (1/2/3): " -n 1 -r
        echo ""
        echo ""

        case $REPLY in
            1)
                # Auto-commit
                TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
                git add . 2>/dev/null
                git commit -m "WIP: End of session - $TIMESTAMP

Work in progress at end of session.

Agent: $AGENT_NAME
Session: $SESSION_ID

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" 2>/dev/null

                echo "  ✓ Changes committed"
                ;;
            2)
                # Auto-stash
                TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
                git stash push -m "WIP: $AGENT_NAME - $TIMESTAMP" 2>/dev/null
                echo "  ✓ Changes stashed"
                ;;
            3)
                echo "  ⚠️  Leaving changes uncommitted"
                ;;
            *)
                echo "  ⚠️  Invalid choice, leaving changes as-is"
                ;;
        esac
    else
        echo "  ✓ No uncommitted changes"
    fi
    echo ""
fi
```

---

### STEP 5: Review Unread Messages

```bash
echo "📬 Checking for unread messages..."

UNREAD_COUNT=$(am-inbox "$AGENT_NAME" --unread --json 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

if [[ "$UNREAD_COUNT" -gt 0 ]]; then
    echo "  ⚠️  You have $UNREAD_COUNT unread message(s)"
    echo ""

    # Show message subjects
    am-inbox "$AGENT_NAME" --unread 2>/dev/null | grep "Subject:" | head -5
    echo ""

    echo "  Do you want to acknowledge all unread messages?"
    echo "    y - Acknowledge all"
    echo "    n - Leave unread"
    echo ""
    read -p "  Choice (y/n): " -n 1 -r
    echo ""
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Acknowledge all unread messages
        MESSAGE_IDS=$(am-inbox "$AGENT_NAME" --unread --json 2>/dev/null | jq -r '.[].id')

        ACK_COUNT=0
        for msg_id in $MESSAGE_IDS; do
            am-ack "$msg_id" --agent "$AGENT_NAME" >/dev/null 2>&1 && ((ACK_COUNT++))
        done

        echo "  ✓ Acknowledged $ACK_COUNT message(s)"
    else
        echo "  ⚠️  $UNREAD_COUNT message(s) remain unread"
    fi
else
    echo "  ✓ No unread messages"
fi
echo ""
```

---

### STEP 6: Generate Session Summary

```bash
if [[ "$SKIP_SUMMARY" != true ]]; then
    echo "📊 Generating session summary..."
    echo ""

    # Get session start time (from oldest agent-*.txt file modification time)
    SESSION_START=$(stat -c %Y ".claude/agent-${SESSION_ID}.txt" 2>/dev/null || date +%s)
    SESSION_END=$(date +%s)
    DURATION_SECONDS=$((SESSION_END - SESSION_START))
    DURATION_HOURS=$((DURATION_SECONDS / 3600))
    DURATION_MINUTES=$(((DURATION_SECONDS % 3600) / 60))

    # Get completed tasks today
    TODAY=$(date +%Y-%m-%d)
    COMPLETED_TODAY=$(bd list --json 2>/dev/null | \
        jq -r --arg agent "$AGENT_NAME" --arg today "$TODAY" \
        '.[] | select(.assignee == $agent and .status == "closed" and (.updated_at | startswith($today))) | .id + " - " + .title')

    # Get commit count today
    COMMITS_TODAY=$(git log --since="$TODAY 00:00" --oneline --author="Claude" 2>/dev/null | wc -l || echo "0")

    # Get files changed today
    FILES_CHANGED=$(git diff --stat HEAD@{1.day}..HEAD 2>/dev/null | tail -1 | grep -oE '[0-9]+ files? changed' || echo "0 files changed")

    # Build summary
    SUMMARY="Session Summary - $(date +'%Y-%m-%d')
Agent: $AGENT_NAME
Duration: ${DURATION_HOURS}h ${DURATION_MINUTES}m

✅ Completed Tasks:
$(if [[ -n "$COMPLETED_TODAY" ]]; then echo "$COMPLETED_TODAY" | sed 's/^/  • /'; else echo "  (none)"; fi)

📊 Git Activity:
  • Commits: $COMMITS_TODAY
  • $FILES_CHANGED

📬 Agent Mail:
  • Unread messages: $UNREAD_COUNT

🔒 File Reservations:
  • All released

Session complete. Ready for next session."

    echo "$SUMMARY"
    echo ""

    # Send to Agent Mail
    echo "📨 Sending summary to Agent Mail..."
    am-send "[EOD] Session Summary - $AGENT_NAME" \
        "$SUMMARY" \
        --from "$AGENT_NAME" \
        --to "Team" \
        --thread "daily-summaries" 2>/dev/null || true

    echo "  ✓ Summary sent (thread: daily-summaries)"
    echo ""
fi
```

---

### STEP 7: Show Tomorrow's Priorities

```bash
echo "🎯 Tomorrow's Top Priorities:"
echo ""

# Get top 3 ready tasks
bd ready --json 2>/dev/null | jq -r 'sort_by(.priority) | reverse | .[0:3] | .[] | "  " + (if .priority == 0 then "🔴" elif .priority == 1 then "🟡" else "🟢" end) + " " + .id + " - " + .title'

echo ""
```

---

### STEP 8: Clear Session State

```bash
echo "🧹 Cleaning up session state..."

# Remove session file
if [[ -f ".claude/agent-${SESSION_ID}.txt" ]]; then
    rm -f ".claude/agent-${SESSION_ID}.txt"
    echo "  ✓ Removed session file"
else
    echo "  ✓ No session file to remove"
fi

# PPID file is in /tmp, will be auto-cleaned by OS
echo "  ✓ Session state cleared"
echo ""
```

---

### STEP 9: Final Goodbye

```bash
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                    👋 SESSION COMPLETE - GOODBYE!                        ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Session wrapped up successfully"
if [[ "$SKIP_SUMMARY" != true ]]; then
    echo "📝 Summary sent to Agent Mail (thread: daily-summaries)"
fi
echo "🔒 All file reservations released"
if [[ "$NO_COMMIT" != true ]]; then
    echo "💾 Changes handled (committed, stashed, or noted)"
fi
echo "📬 Messages reviewed"
echo ""
echo "🌙 Rest well, $AGENT_NAME! See you next session."
echo ""
```

---

## Output Format Example

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    👋 SESSION WRAP-UP - RichPrairie                      ║
╚══════════════════════════════════════════════════════════════════════════╝

📋 In-Progress Work:

  📌 jat-abc - Fix dashboard bug

  What should we do with this task?
    1. Mark as paused (end of session)
    2. Keep as in_progress (will resume tomorrow)
    3. Complete it now

  Choice (1/2/3): 1

  ⏸️  Paused: jat-abc

🔒 Releasing file reservations...
  ✓ Released 2 reservation(s)

💾 Checking for uncommitted changes...
  ✓ No uncommitted changes

📬 Checking for unread messages...
  ✓ No unread messages

📊 Generating session summary...

Session Summary - 2025-11-20
Agent: RichPrairie
Duration: 3h 45m

✅ Completed Tasks:
  • jat-x32 - Update /agent:start to use global agent lookup
  • jat-135 - Remove --all-projects flag (no longer needed)
  • jat-vkr - Implement @recent mention expansion in am-send

📊 Git Activity:
  • Commits: 3
  • 4 files changed

📬 Agent Mail:
  • Unread messages: 0

🔒 File Reservations:
  • All released

Session complete. Ready for next session.

📨 Sending summary to Agent Mail...
  ✓ Summary sent (thread: daily-summaries)

🎯 Tomorrow's Top Priorities:

  🔴 jat-0t2 - Fix /api/agents simple mode to respect project filter
  🟡 jat-bjq - Add --hide-acked flag to am-inbox
  🟡 jat-jdw - Add --active-window flag to am-send

🧹 Cleaning up session state...
  ✓ Removed session file
  ✓ Session state cleared

╔══════════════════════════════════════════════════════════════════════════╗
║                    👋 SESSION COMPLETE - GOODBYE!                        ║
╚══════════════════════════════════════════════════════════════════════════╝

✅ Session wrapped up successfully
📝 Summary sent to Agent Mail (thread: daily-summaries)
🔒 All file reservations released
💾 Changes handled (committed, stashed, or noted)
📬 Messages reviewed

🌙 Rest well, RichPrairie! See you next session.
```

---

## Error Handling

**Common errors:**
- "Could not determine session ID" → Statusline hasn't run yet
- "No agent registered" → Run /agent:register or /agent:start first
- "Database locked" → Wait a moment and try again
- "No ready tasks" → All caught up! Create new tasks or enjoy the break

---

## Notes

- **Session boundary:** This is the clean way to end your work session
- **Graceful shutdown:** Handles all loose ends automatically
- **Tomorrow ready:** Leaves clear priorities for next session
- **Audit trail:** Sends summary to Agent Mail for tracking
- **Clean slate:** Removes session files so next session starts fresh
- **Optional flags:** Use --skip-summary for quick exits, --no-commit to preserve working state
- **Interactive:** Prompts for important decisions (what to do with in-progress work)
- **Safe:** Won't force-complete tasks or delete uncommitted work

---

## Comparison with Other Commands

| Command | Use Case |
|---------|----------|
| `/agent:start` | "What's next?" - Keep working |
| `/agent:complete` | "Done with this task" - Task completion |
| `/agent:pause` | "Switching context" - Pause specific task |
| `/agent:finish` | "Going to bed" - End entire session |

---

## Future Enhancements

Potential additions:
- Time tracking summary (hours per task)
- Productivity metrics
- Auto-detect long-running sessions and suggest breaks
- Integration with calendar (schedule tomorrow's session)
- Export session summary to markdown file
- Send summary via email/Slack
