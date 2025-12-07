---
argument-hint:
---

Complete current task properly with full verification, then show menu of available tasks and recommend next task.

# Agent Complete - Finish Task Properly

**Usage:**
- `/jat:complete` - Complete current task with full verification, show menu

**What this command does:**
1. **Read & Respond to Agent Mail** (ALWAYS - before completing)
2. **Full Completion Protocol**:
   - Verify task (tests, lint, security, browser checks)
   - Commit changes with proper message
3. **Beads Task Management**:
   - Mark task as complete in Beads (`bd close`)
   - Release file reservations
4. **Announce Completion** in Agent Mail
5. **Next Task Selection**:
   - Show available tasks menu
   - Display recommended next task with one-line command
   - Wait for user to choose (does NOT auto-start)

**Key behaviors:**
- **ALWAYS check Agent Mail first** - before completing work
- Mail = read + respond + ack (not just silent batch-ack)

**When to use:**
- After you display "🔍 READY FOR REVIEW" and user approves
- **Careful workflow**: You want to choose next task manually
- **Context switch**: Might want different type of work next
- **Review point**: Want to check status before continuing
- **End of work**: Last task before closing terminal

**When NOT to use:**
- Need to pivot quickly → use `/jat:pause` instead

---

## CRITICAL: "Ready for Review" vs "Complete"

**These are two different states. Never confuse them.**

| State | Meaning | Display | Beads Status |
|-------|---------|---------|--------------|
| **Ready for Review** | Code work done, awaiting user decision | "🔍 READY FOR REVIEW" | `in_progress` |
| **Complete** | Closed in Beads, reservations released | "✅ TASK COMPLETE" | `closed` |

**NEVER say "Task Complete" until AFTER:**
1. Changes committed
2. `bd close` has run successfully
3. Reservations released
4. Completion announced via Agent Mail

**The typical flow:**
1. You finish coding → display "🔍 READY FOR REVIEW"
2. User reviews and runs `/jat:complete`
3. You run completion steps (commit, close, release, announce)
4. THEN display "✅ TASK COMPLETE"

**Why this matters:**
- Other agents check Beads to see if tasks are available
- If you say "complete" but haven't run `bd close`, another agent will see the task as still in-progress
- This causes confusion and coordination problems

---

## Bash Syntax Patterns for Claude Code

**CRITICAL:** Claude Code's Bash tool escapes command substitution syntax. You MUST use these patterns:

### CORRECT Patterns

**Pattern 1: Use Read/Write tools (RECOMMENDED)**
```bash
# Step 1: Get value
~/code/jat/scripts/get-current-session-id
# → "a019c84c-7b54-45cc-9eee-dd6a70dea1a3"

# Step 2: Use Write tool with that value
Write(.claude/agent-a019c84c-7b54-45cc-9eee-dd6a70dea1a3.txt, "AgentName")
```

**Pattern 2: Explicit variable assignment with semicolon**
```bash
# Works: Explicit assignment with semicolon
SESSION_ID="a019c84c-7b54-45cc-9eee-dd6a70dea1a3"; echo "$SESSION_ID"

# Works: Use test command with && / ||
test -f "$file" && echo "exists" || echo "not found"
```

### WRONG Patterns (Will Cause Syntax Errors)

```bash
# BROKEN: Command substitution in assignment
SESSION_ID=$(~/code/jat/scripts/get-current-session-id)
# Error: gets escaped

# BROKEN: if statement with &&
SESSION_ID="abc" && if [[ -f "$file" ]]; then echo "yes"; fi
# Error: syntax error
```

---

## Implementation Steps

### STEP 1: Get Current Task and Agent Identity

#### 1A: Get Session ID
```bash
~/code/jat/scripts/get-current-session-id
# → Extract session_id value
```

#### 1B: Get Agent Name
```bash
# Read .claude/agent-{session_id}.txt
# → Extract agent_name
```

#### 1C: Get Current Task
```bash
# Get task from Beads (in_progress tasks for this agent)
bd list --json | jq -r --arg agent "$agent_name" \
  '.[] | select(.assignee == $agent and .status == "in_progress") | .id' | head -1
```

**Error handling:**
- If no session ID found → error "No active session. Run /jat:start first"
- If no agent name found → error "No agent registered. Run /jat:start first"
- If no in_progress task → **continue to Step 1D** (spontaneous work detection)

---

### STEP 1D: Spontaneous Work Detection (If No Task Found)

**Only execute if Step 1C found no `in_progress` task.**

This step detects ad-hoc work done without a formal Beads task and offers to create a backfilled task record for proper attribution and audit trail.

#### Analyze Conversation Context

Review recent conversation for **completed work signals**:

1. **Work completion phrases:**
   - "I added...", "I fixed...", "I implemented...", "I refactored..."
   - "Built...", "Created...", "Removed...", "Changed...", "Updated..."
   - "Done with...", "Finished...", "Completed..."
   - "The fix...", "The solution...", "Root cause was..."

2. **File/code references:**
   - File paths mentioned in tool calls or discussion
   - Code snippets shared or modified
   - Technical details of implementation

3. **Problem/solution context:**
   - What problem was being solved?
   - What was the approach taken?
   - Any decisions or trade-offs made?

#### Analyze Git State

```bash
# Check for uncommitted changes
git status --porcelain

# Get summary of what changed
git diff --stat

# Recent commits (may include work from this session)
git log --oneline -5
```

#### Synthesize Work Summary

Combine conversation signals + git state to infer:
- **Title**: Verb + noun describing the work (e.g., "Fix jat CLI -p flag causing non-interactive sessions")
- **Type**: `bug`, `feature`, `task`, or `chore` based on nature of work
- **Description**: What was done and why
- **Files touched**: From git diff + conversation context

#### Present Proposal

**If work detected**, display proposal and ask for confirmation:

```
╔════════════════════════════════════════════════════════╗
║         🔍 SPONTANEOUS WORK DETECTED                   ║
╚════════════════════════════════════════════════════════╝

No formal task was in progress, but work was detected:

📋 Proposed Task:
   Title: [inferred title]
   Type: [task/bug/feature/chore]
   Description: [inferred description]

📁 Files Changed: [list from git status/diff]

Create a backfilled task record? [Proceed? Y/n]
```

#### If User Confirms

```bash
# Create the backfilled task (already in_progress since work is done)
bd create "[title]" \
  --type [type] \
  --description "[description]" \
  --assignee "$agent_name" \
  --status in_progress

# Extract task_id from output
# Set $task_id and $task_title variables
# Continue to Step 2 (Read & Respond to Mail)
```

#### If User Declines

```
Understood. No task record created.

Options:
  • /jat:start - Pick up a new task
  • bd create "..." - Manually create a task
  • Just commit your changes directly with git
```

**Exit the /jat:complete flow** - do not continue to Step 2.

#### If No Work Detected

```
No task in progress and no spontaneous work detected.

Options:
  • /jat:start - Pick a task to work on
  • bd list - View available tasks
```

**Exit the /jat:complete flow** - do not continue to Step 2.

---

#### Real Example: Spontaneous Bug Fix

**Conversation signals detected:**
```
User: "jat jat 4 crashed all terminals"
Agent: "I see the issue... The -p flag makes Claude non-interactive..."
Agent: "Let me update the jat script..."
Agent: "Now try running jat jat 4 again"
```

**Git state:**
```
M cli/jat
```

**Proposed backfill:**
```
Title: Fix jat CLI -p flag causing non-interactive sessions
Type: bug
Description: The -p flag was causing Claude Code to run in print mode
             (non-interactive), exiting immediately after processing.
             Removed -p and pass prompt as positional argument instead.
Files: cli/jat
```

---

### STEP 2: Read & Respond to Agent Mail (ALWAYS)

**THIS STEP IS MANDATORY - runs before any completion work.**

Do NOT silently batch-ack messages. Actually READ them and RESPOND if needed.

#### 2A: Check Inbox (with registration fallback)

**IMPORTANT:** If inbox fails with "Agent not found", the agent may not be registered in this session. Run `am-register` first (it's idempotent), then retry inbox.

```bash
# First attempt
am-inbox "$agent_name" --unread

# If it fails with "Agent not found":
# 1. Run: am-register --name "$agent_name" --program claude-code --model sonnet-4.5
# 2. Then retry: am-inbox "$agent_name" --unread
```

**Best practice:** Run these as separate Bash tool calls, not chained together.

#### 2B: Display Messages to User
Show the user what messages are in the inbox. Read each message.

#### 2C: Respond If Needed
- If a message asks a question → reply with `am-reply`
- If a message changes requirements → adjust your plan
- If a message says "stop" or "wait" → pause and clarify
- If a message is informational → acknowledge it

#### 2D: Acknowledge Messages
```bash
# Only AFTER reading and responding
am-inbox "$agent_name" --unread --json | jq -r '.[].id' | while read msg_id; do
  am-ack "$msg_id" --agent "$agent_name"
done
```

**Why this matters:**
- Messages might say "don't complete yet, found a bug"
- Messages might say "requirements changed"
- Messages might say "I need to review first"
- You need context BEFORE completing work

---

### STEP 3: Verify Task

```bash
echo "Verifying task before completion..."

# Run verification checks:
# - Tests
# - Lint
# - Security scan
# - Browser checks (if applicable)

# If verification fails, STOP and report issues
# Do NOT continue to completion
```

---

### STEP 4: Commit Changes

```bash
echo "Committing changes..."

# Get task details for commit message
task_json=$(bd show "$task_id" --json)
task_title=$(echo "$task_json" | jq -r '.[0].title')
task_type=$(echo "$task_json" | jq -r '.[0].issue_type')

# Check git status
git_status=$(git status --porcelain)

if [[ -n "$git_status" ]]; then
  git add .
  git commit -m "$(cat <<EOF
$task_type: $task_title

Task: $task_id

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
else
  echo "No changes to commit"
fi
```

---

### STEP 5: Mark Task Complete in Beads

```bash
bd close "$task_id" --reason "Completed by $agent_name"
```

---

### STEP 6: Release File Reservations

```bash
# Release all file reservations for this agent
am-reservations --agent "$agent_name" --json | jq -r '.[].path_pattern' | while read pattern; do
  am-release "$pattern" --agent "$agent_name"
done
```

---

### STEP 7: Announce Completion

```bash
am-send "[$task_id] Completed: $task_title" \
  "Task completed by $agent_name.

Status: Complete
Type: $task_type
Verification: Full (tests, lint, security)

Agent is now available for next task." \
  --from "$agent_name" \
  --to @active \
  --thread "$task_id"
```

---

### STEP 7.5: Determine Review Action (Configurable Rules)

**After announcing completion, determine which marker to emit based on configurable rules.**

This step implements the review rules system that allows project-level configuration of which tasks require human review vs auto-proceed.

#### Rule Evaluation Order

```
1. Check task.notes for [REVIEW_OVERRIDE:...] pattern
   └─ If found → Use override action (always_review, auto_proceed, force_review)

2. Load .beads/review-rules.json
   └─ Find rule matching task.issue_type
   └─ Compare task.priority to rule.maxAutoPriority

3. If config missing → Use hardcoded defaults
```

#### Implementation

```bash
# Get task details
task_json=$(bd show "$task_id" --json)
task_notes=$(echo "$task_json" | jq -r '.[0].notes // ""')
task_priority=$(echo "$task_json" | jq -r '.[0].priority')
task_type=$(echo "$task_json" | jq -r '.[0].issue_type')

# Step 1: Check for per-task override in notes
COMPLETION_MARKER="[JAT:IDLE]"  # Default: requires review

if echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:always_review\]'; then
  echo "📋 Review override detected: always_review"
  COMPLETION_MARKER="[JAT:IDLE]"
elif echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:auto_proceed\]'; then
  echo "📋 Review override detected: auto_proceed"
  COMPLETION_MARKER="[JAT:AUTO_PROCEED]"
elif echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:force_review\]'; then
  echo "📋 Review override detected: force_review"
  COMPLETION_MARKER="[JAT:IDLE]"
else
  # Step 2: Load review-rules.json and apply type-based rules
  rules_file=".beads/review-rules.json"

  if [[ -f "$rules_file" ]]; then
    # Find maxAutoPriority for this task type
    max_auto=$(jq -r --arg type "$task_type" \
      '.rules[] | select(.type == $type) | .maxAutoPriority // -1' \
      "$rules_file")

    if [[ "$max_auto" != "-1" && "$max_auto" != "null" && -n "$max_auto" ]]; then
      # Compare: task can auto-proceed if priority <= maxAutoPriority
      # (lower number = higher priority, e.g., P0 < P3)
      if (( task_priority <= max_auto )); then
        echo "📋 Auto-proceed: P${task_priority} ${task_type} (max: P${max_auto})"
        COMPLETION_MARKER="[JAT:AUTO_PROCEED]"
      else
        echo "📋 Review required: P${task_priority} ${task_type} (max auto: P${max_auto})"
        COMPLETION_MARKER="[JAT:IDLE]"
      fi
    else
      # No rule for this type, check defaultAction
      default_action=$(jq -r '.defaultAction // "review"' "$rules_file")
      if [[ "$default_action" == "auto" ]]; then
        COMPLETION_MARKER="[JAT:AUTO_PROCEED]"
      else
        COMPLETION_MARKER="[JAT:IDLE]"
      fi
    fi
  else
    # Step 3: Fallback to hardcoded defaults
    echo "📋 Using hardcoded defaults (no review-rules.json)"

    # Default rules:
    # - Epics: always review (maxAutoPriority: -1)
    # - Chores: always auto-proceed (maxAutoPriority: 4)
    # - Other (bug, feature, task): auto-proceed for P0-P3
    case "$task_type" in
      epic)
        COMPLETION_MARKER="[JAT:IDLE]"  # Epics always require review
        ;;
      chore)
        COMPLETION_MARKER="[JAT:AUTO_PROCEED]"  # Chores always auto-proceed
        ;;
      *)
        # bug, feature, task: auto-proceed for P0-P3, review for P4
        if (( task_priority <= 3 )); then
          COMPLETION_MARKER="[JAT:AUTO_PROCEED]"
        else
          COMPLETION_MARKER="[JAT:IDLE]"
        fi
        ;;
    esac
  fi
fi

echo "🏷️  Completion marker: $COMPLETION_MARKER"
```

#### Review Override Values

| Override Value | Effect | Use Case |
|----------------|--------|----------|
| `always_review` | Emit `[JAT:IDLE]` | Testing override behavior |
| `auto_proceed` | Emit `[JAT:AUTO_PROCEED]` | Skip review for specific task |
| `force_review` | Emit `[JAT:IDLE]` | Force review even if rules say auto |

#### Example review-rules.json

```json
{
  "version": 1,
  "defaultAction": "review",
  "priorityThreshold": 3,
  "rules": [
    { "type": "bug", "maxAutoPriority": 3, "note": "P0-P3 bugs auto-proceed" },
    { "type": "feature", "maxAutoPriority": 3, "note": "P0-P3 features auto-proceed" },
    { "type": "task", "maxAutoPriority": 3 },
    { "type": "chore", "maxAutoPriority": 4, "note": "All chores auto-proceed" },
    { "type": "epic", "maxAutoPriority": -1, "note": "Epics always require review" }
  ],
  "overrides": []
}
```

**Understanding maxAutoPriority:**
- Value represents highest priority number that can auto-proceed
- Lower priority number = higher importance (P0 is most critical)
- `maxAutoPriority: 3` means P0, P1, P2, P3 can auto-proceed; P4 requires review
- `maxAutoPriority: -1` means no auto-proceed (always review)
- `maxAutoPriority: 4` means all priorities auto-proceed

---

### STEP 8: Show Final Summary (Single Unified Box)

Output this SINGLE box containing everything - task info AND reflection together.

**Important:** Use the `$COMPLETION_MARKER` determined in Step 7.5. This will be either:
- `[JAT:IDLE]` - Requires human review (session stays open, dashboard shows as waiting)
- `[JAT:AUTO_PROCEED]` - Auto-proceed enabled (dashboard can auto-close session)

```
┌────────────────────────────────────────────────────────┐
│  ✅ Task Completed: $task_id                           │
│  👤 Agent: $agent_name                                 │
│  [JAT:COMPLETED]                                       │
└────────────────────────────────────────────────────────┘

📋 What was accomplished:
   • [Brief summary of work completed]
   • [Key changes made]

🧑 Human actions required: (ONLY if manual steps needed)
   [JAT:HUMAN_ACTION {"title":"...","description":"..."}]

⚡ Quality: Tests [pass/fail] | Build [clean/warn]

🔗 Cross-agent intel:
   • Files: [key files modified]
   • Gotchas: [surprises or tricky areas]

💡 Session complete. Close terminal when ready.
```

**Guidelines:**
- Everything goes in ONE box - do not output a second box or "Next steps" menu
- Be specific about what was accomplished
- Surface conflicts - files touched that parallel agents might need
- Share discoveries - patterns and gotchas help the whole swarm
- Keep it actionable - insights should help the commander make decisions

---

### Human Actions (CRITICAL)

**When to include human actions:**

If your task requires ANY manual steps by the user that cannot be automated, you MUST output `[JAT:HUMAN_ACTION]` markers. This ensures the dashboard displays them prominently.

**Common examples of human actions:**
- Run migration in production database
- Enable feature flag in admin dashboard
- Configure third-party service (Supabase Auth, Stripe, etc.)
- Update environment variables on production server
- Deploy to production
- Review and merge PR
- Manual testing in staging environment

**Marker format:**

```
[JAT:HUMAN_ACTION {"title":"Short action title","description":"Detailed steps to complete this action"}]
```

**Rules:**
1. Each action gets its own marker on a separate line
2. Title should be 3-8 words (shows as header in dashboard)
3. Description can be multi-line but keep it concise
4. JSON must be valid (escape quotes if needed)
5. Place markers INSIDE the completion box, under "🧑 Human actions required:"

**Example with human actions:**

```
┌────────────────────────────────────────────────────────┐
│  ✅ Task Completed: chimaro-xyz                        │
│  👤 Agent: CalmMeadow                                  │
│  [JAT:IDLE]                                            │
└────────────────────────────────────────────────────────┘

📋 What was accomplished:
   • Created migration for auth_mode column
   • Added anonymous session handling

🧑 Human actions required:
   [JAT:HUMAN_ACTION {"title":"Run migration","description":"..."}]
   [JAT:HUMAN_ACTION {"title":"Enable Anon Auth","description":"..."}]

⚡ Quality: Tests passing | Build clean

💡 Session complete. Close terminal when ready.
```

**What the dashboard does with these markers:**
- Displays a prominent "Human Actions Required" badge on the session card
- Shows each action as a checklist item the user can mark as done
- Persists action completion state until session is closed
- Prevents accidental "task complete" assumption when manual work remains

---

### Suggested Tasks (RECOMMENDED)

**When to include suggested tasks:**

If your task uncovered follow-up work (bugs, improvements, tech debt, new features), you SHOULD output `[JAT:SUGGESTED_TASKS]` markers. This helps the commander make informed decisions about what to tackle next.

**Marker format:**

```
[JAT:SUGGESTED_TASKS]
{"tasks":[
  {"type":"agent","title":"...","description":"...","priority":1},
  {"type":"human","title":"...","description":"...","priority":2}
]}
[/JAT:SUGGESTED_TASKS]
```

**Field Reference:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `type` | ✅ Yes | `"agent"` or `"human"` | Who should do this work |
| `title` | ✅ Yes | string | Short task title (3-10 words) |
| `priority` | ✅ Yes | number | 0-4 (P0=critical, P4=backlog) |
| `description` | ❌ No | string | Detailed description of work needed |
| `labels` | ❌ No | string[] | Labels for categorization (e.g., `["bug", "security"]`) |
| `dependencies` | ❌ No | string[] | Task IDs this depends on (e.g., `["jat-abc"]`) |
| `effort` | ❌ No | `"small"`, `"medium"`, `"large"` | Estimated effort |
| `project` | ❌ No | string | Project name (auto-detected if omitted) |

**Task Types:**

- **`agent`** - Work that can be auto-assigned to the next available agent
  - Examples: bug fixes, refactoring, adding tests, implementing features
  - Dashboard can auto-spawn agents for these tasks

- **`human`** - Work that requires human judgment or access
  - Examples: design decisions, production deployments, security reviews
  - Dashboard shows these prominently but won't auto-assign to agents

**Rules:**

1. JSON must be valid (escape quotes, no trailing commas)
2. One `[JAT:SUGGESTED_TASKS]...[/JAT:SUGGESTED_TASKS]` block per completion
3. Multiple tasks go in the `tasks` array
4. Place marker INSIDE the completion box, under "📊 Backlog impact:"
5. Dashboard parses on session end and offers to create tasks in Beads

**Example with suggested tasks:**

```
┌────────────────────────────────────────────────────────┐
│  ✅ Task Completed: jat-xyz                            │
│  👤 Agent: SwiftMeadow                                 │
│  [JAT:IDLE]                                            │
└────────────────────────────────────────────────────────┘

📋 What was accomplished:
   • Added Redis caching to /api/tasks endpoint
   • Reduced P99 latency from 450ms to 12ms

📊 Backlog impact:
   • Discovered: Other endpoints need same pattern

[JAT:SUGGESTED_TASKS]
{"tasks":[
  {"type":"agent","title":"Cache /api/agents","priority":2},
  {"type":"human","title":"Decide cache TTL","priority":2}
]}
[/JAT:SUGGESTED_TASKS]

💡 Session complete. Close terminal when ready.
```

**What the dashboard does with suggested tasks:**

- Parses the JSON payload when session completes
- Displays "N Suggested Tasks" badge on session card
- Shows task list in a modal when clicked
- Offers one-click creation in Beads (with confirmation)
- Agent tasks can be auto-spawned if user enables swarm mode
- Human tasks are highlighted differently (won't auto-assign)

**Comparison with JAT:HUMAN_ACTION:**

| Aspect | JAT:HUMAN_ACTION | JAT:SUGGESTED_TASKS |
|--------|------------------|---------------------|
| **Purpose** | Manual steps for THIS task | Follow-up work from THIS task |
| **Timing** | Must be done before task is truly complete | Can be done later, separate work |
| **Urgency** | Blocking - task isn't done without these | Non-blocking - backlog items |
| **Creation** | Displayed as checklist | Offered for Beads creation |
| **Auto-assign** | N/A | Agent tasks can auto-spawn |

**When to use each:**

- Use `JAT:HUMAN_ACTION` when: "The user needs to do X for this task to be complete"
  - Example: "Run migration in production" - task isn't done until migration runs

- Use `JAT:SUGGESTED_TASKS` when: "I discovered Y that should be done separately"
  - Example: "Found similar code that needs same fix" - different task, do later

---

## Quick Mode Behavior

**This command does NOT have a quick mode.**

Full verification ensures quality before task closure.

**Still done (NEVER skip these):**
- STEP 2: Read & respond to Agent Mail
- All other steps

---

## Output Examples

**Spontaneous work completion (no prior task):**
```
📋 Checking for in_progress task...
   No task found for SwiftMoon

🔍 Analyzing session for spontaneous work...

╔════════════════════════════════════════════════════════╗
║         🔍 SPONTANEOUS WORK DETECTED                   ║
╚════════════════════════════════════════════════════════╝

No formal task was in progress, but work was detected:

📋 Proposed Task:
   Title: Fix jat CLI -p flag causing non-interactive sessions
   Type: bug
   Description: Fixed -p flag causing non-interactive mode

📁 Files Changed: M cli/jat

Create a backfilled task record? [Proceed? Y/n] Y

✓ Created backfill task: jat-abc "Fix jat CLI -p flag causing non-interactive sessions"

📬 Checking Agent Mail...
  No unread messages

🔍 Verifying task before completion...
   ✅ No tests configured
   ✅ Lint clean

💾 Committing changes...
   ✅ Committed: "bug: Fix jat CLI -p flag causing non-interactive sessions"

✅ Marking task complete in Beads...
   ✅ Closed jat-abc

📢 Announcing task completion...
   ✅ Sent to @active

┌────────────────────────────────────────────────────────┐
│  ✅ Task Completed: jat-abc                            │
│  👤 Agent: SwiftMoon (Backfilled)                      │
│  [JAT:IDLE]                                            │
└────────────────────────────────────────────────────────┘

📋 What was accomplished:
   • Fixed jat CLI -p flag for non-interactive sessions
   • Changed to positional argument for prompt passing

⚡ Quality: Tests passing | Build clean

🔗 Cross-agent intel:
   • Files: cli/jat
   • Gotchas: Use positional args, not flags for prompts

💡 Session complete. Close terminal when ready.
```

---

**Standard completion (existing task):**
```
📬 Checking Agent Mail...
  1 unread message

  From: TeamLead (20 min ago)
  Subject: [jat-abc] Review note
  Body: Looks good, just add a comment to the main function

  → Acknowledged (already addressed in code)

🔍 Verifying task before completion...
   ✅ Tests passed (12/12)
   ✅ Lint clean
   ✅ Security scan clean

💾 Committing changes...
   ✅ Committed: "feat: Add user settings page"

✅ Marking task complete in Beads...
   ✅ Closed jat-abc

🔓 Releasing file reservations...
   ✅ Released 2 file patterns

📢 Announcing task completion...
   ✅ Sent to @active

┌────────────────────────────────────────────────────────┐
│  ✅ Task Completed: jat-abc                            │
│  👤 Agent: JustGrove                                   │
│  [JAT:IDLE]                                            │
└────────────────────────────────────────────────────────┘

📋 What was accomplished:
   • Added user settings page at /account/settings
   • Implemented form fields for profile, notifications

⚡ Quality: Tests passing | Build clean

🔗 Cross-agent intel:
   • Files: routes/account/settings/+page.svelte
   • Gotchas: Flatten nested API response for form binding

💡 Session complete. Close terminal when ready.
```

**Markers explained:**
- `[JAT:IDLE]` - Requires human review; dashboard shows completion state, session stays open
- `[JAT:AUTO_PROCEED]` - Auto-proceed enabled; dashboard can auto-close session
- `[JAT:SUGGESTED_TASKS]...[/JAT:SUGGESTED_TASKS]` - Follow-up tasks discovered during work

The marker used depends on review rules (see Step 7.5).

---

## Dashboard State Markers

The completion flow uses these markers (output automatically by the templates above):

| Marker | When to Output | Dashboard Effect |
|--------|----------------|------------------|
| `[JAT:IDLE]` | After `bd close`, when review required | Shows "Completed" state (green), session stays open |
| `[JAT:AUTO_PROCEED]` | After `bd close`, when auto-proceed enabled | Dashboard can auto-close session, optionally spawn next |
| `[JAT:HUMAN_ACTION {...}]` | When manual steps are required | Shows prominent action checklist |
| `[JAT:SUGGESTED_TASKS]...[/JAT:SUGGESTED_TASKS]` | When follow-up work discovered | Shows "N Suggested Tasks" badge, offers Beads creation |

**Marker selection is automatic** - Step 7.5 determines which marker to use based on:
1. Per-task override in notes (`[REVIEW_OVERRIDE:...]`)
2. Project review rules (`.beads/review-rules.json`)
3. Hardcoded defaults (epics require review, chores auto-proceed, others P0-P3 auto)

**Critical timing:**
- Do NOT output `[JAT:IDLE]` until AFTER all completion steps succeed
- If you output it early, dashboard shows "complete" but task is still open in Beads
- This causes confusion - other agents think task is done when it isn't

**Human action markers:**
- Output BEFORE `[JAT:IDLE]` in the completion box
- Each action gets its own line with valid JSON payload
- Dashboard parses these to show a checklist of manual steps

**The markers are in the template** - just use the Step 8 template and markers are included automatically.

---

## Handling CREATE_TASKS Input from Dashboard

**When the dashboard sends `[JAT:CREATE_TASKS]` input, handle it before the completion summary.**

This happens when:
1. Agent outputs `[JAT:SUGGESTED_TASKS]` with follow-up tasks
2. Dashboard displays SuggestedTasksPanel UI
3. User selects tasks and clicks "Create Selected Tasks"
4. Dashboard sends `[JAT:CREATE_TASKS]{...json...}[/JAT:CREATE_TASKS]` to agent's terminal
5. Agent parses this input and creates tasks in Beads

### Input Format

```
[JAT:CREATE_TASKS]
{
  "tasks": [
    {
      "type": "agent",
      "title": "Add caching to /api/agents endpoint",
      "description": "Same Redis pattern as /api/tasks. Copy approach from cache.ts.",
      "priority": 2
    },
    {
      "type": "human",
      "title": "Decide on cache TTL strategy",
      "description": "Current TTL is 60s. Need product input on freshness vs performance tradeoff.",
      "priority": 2
    }
  ],
  "parent_task_id": "jat-xyz"
}
[/JAT:CREATE_TASKS]
```

### Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `tasks` | Yes | array | Array of tasks to create |
| `tasks[].type` | Yes | `"agent"` or `"human"` | Who should do this work |
| `tasks[].title` | Yes | string | Task title (3-10 words) |
| `tasks[].priority` | Yes | number | 0-4 (P0=critical, P4=lowest) |
| `tasks[].description` | No | string | Detailed description |
| `tasks[].labels` | No | string[] | Labels for categorization |
| `parent_task_id` | No | string | Parent task ID for linking |

### Implementation Steps

**When you detect CREATE_TASKS input in the terminal or receive it as user input:**

#### Step 1: Parse the JSON Payload

```bash
# The input will look like:
# [JAT:CREATE_TASKS]{"tasks":[...]}[/JAT:CREATE_TASKS]
#
# Parse between the markers to extract JSON
```

Extract the JSON payload and validate it has the required fields.

#### Step 2: Create Each Task in Beads

For each task in the `tasks` array:

```bash
# For agent tasks:
bd create "Task title here" \
  --description "Task description" \
  --priority 2 \
  --type task

# For human tasks, add human-action label:
bd create "Human task title here" \
  --description "Task description" \
  --priority 2 \
  --type task \
  --labels "human-action"

# If labels were provided:
bd create "Task title" \
  --description "Description" \
  --priority 2 \
  --type task \
  --labels "label1,label2"
```

**Capture the created task ID from the output** (format: `✓ Created issue: jat-xxx`).

#### Step 3: Link to Parent Task (Optional)

If `parent_task_id` was provided, link the new tasks:

```bash
# Add dependency relationship (syntax: bd dep add [new-id] [parent-id] --type discovered-from)
bd dep add jat-newid jat-parentid --type discovered-from
```

#### Step 4: Output Confirmation

```
📋 Creating suggested tasks from dashboard...

✓ Created 3 tasks:
  • jat-abc - Add caching to /api/agents endpoint (agent)
  • jat-def - Add cache metrics to dashboard (agent)
  • jat-ghi - Decide on cache TTL strategy (human)

  Linked to parent: jat-xyz
```

#### Step 5: Continue with Completion Flow

After creating tasks, continue with the normal `/jat:complete` flow (verification, commit, close, announce).

### Error Handling

**JSON parse error:**
```
⚠️ CREATE_TASKS: Invalid JSON payload
   Error: Unexpected token at position 45
   Skipping task creation, continuing with completion...
```

**bd create fails for one task:**
```
📋 Creating suggested tasks from dashboard...

✓ jat-abc - Add caching to /api/agents endpoint
✗ Failed: Add cache metrics - bd create error: duplicate title
✓ jat-ghi - Decide on cache TTL strategy

2 of 3 tasks created successfully.
```

**Handle errors gracefully** - report which task failed but continue creating others.

### Example Output

```
[User sends from dashboard:]
[JAT:CREATE_TASKS]{"tasks":[{"type":"agent","title":"Add unit tests for cache layer","description":"Cover cache hit/miss scenarios","priority":2},{"type":"human","title":"Review cache invalidation strategy","description":"Ensure we invalidate on all write paths","priority":1}],"parent_task_id":"jat-xyz"}[/JAT:CREATE_TASKS]

[Agent response:]
📋 Creating suggested tasks from dashboard...

Running: bd create "Add unit tests for cache layer" --description "Cover cache hit/miss scenarios" --priority 2 --type task
✓ Created: jat-abc

Running: bd create "Review cache invalidation strategy" --description "Ensure we invalidate on all write paths" --priority 1 --type task --labels "human-action"
✓ Created: jat-def

Linking to parent task jat-xyz...
✓ Added dependency: jat-abc depends on jat-xyz (discovered-from)
✓ Added dependency: jat-def depends on jat-xyz (discovered-from)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Created 2 tasks from suggestions: jat-abc, jat-def
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Continuing with completion flow...]
```

### Integration with Completion Flow

The CREATE_TASKS handling should happen **after showing the completion summary** but **before outputting [JAT:IDLE]**:

1. Steps 1-7 run normally (verify, commit, close, release, announce)
2. Show completion summary box (Step 8)
3. **Wait for potential CREATE_TASKS input from dashboard**
   - If user sends CREATE_TASKS → parse and create tasks → confirm
   - If user sends nothing / closes terminal → proceed to IDLE
4. Output `[JAT:IDLE]` marker

This allows the dashboard to:
1. Parse the `[JAT:SUGGESTED_TASKS]` from completion summary
2. Show the SuggestedTasksPanel UI to user
3. User selects and clicks "Create Selected Tasks"
4. Dashboard sends CREATE_TASKS to still-running agent
5. Agent creates tasks and confirms

**Note:** The agent session should remain open briefly after showing completion summary to allow this interaction. The `[JAT:IDLE]` marker signals the session can be closed.

---

## Error Handling

**No active session:**
```
No active session detected.
Run /jat:start to begin working
```

**No task in progress (with spontaneous work):**
```
🔍 SPONTANEOUS WORK DETECTED
[Proposal displayed, user confirms]
✓ Created backfill task: jat-xyz
[Continues to normal completion flow]
```

**No task in progress (no work detected):**
```
No task in progress and no spontaneous work detected.
Run /jat:start to pick a task
```

**Verification failed:**
```
Task verification failed:
   • 2 tests failing
   • 5 lint errors

Fix issues and try again
Or run /jat:verify to see detailed error report
```

---

## Step Summary

| Step | Name | When |
|------|------|------|
| 1A-C | Get Task and Agent Identity | ALWAYS |
| 1D | Spontaneous Work Detection | If no in_progress task found |
| 2 | Read & Respond to Mail | ALWAYS (after task identified) |
| 3 | Verify Task | ALWAYS |
| 4 | Commit Changes | ALWAYS |
| 5 | Mark Task Complete | ALWAYS |
| 6 | Release Reservations | ALWAYS |
| 7 | Announce Completion | ALWAYS |
| 7.5 | Determine Review Action | ALWAYS (sets COMPLETION_MARKER) |
| 8 | Show Final Summary with Reflection | ALWAYS |
| 9 | Handle CREATE_TASKS Input | If dashboard sends task creation request |

---

## Key Design Principles

1. **Always check Agent Mail first**
   - Read messages BEFORE completing work
   - Respond to questions, don't just ack
   - Context matters for decision-making

2. **Full verification required**
   - No quick mode for this command
   - Quality over speed

3. **One agent = one session = one task**
   - Session typically ends after completion
   - User spawns new agent for next task
   - Keeps context clean and focused

---

## Epic/Child Task Architecture

**Epics are blocked by their children, not the other way around.**

### Dependency Direction

When creating an epic with child tasks, the dependencies must be set up correctly:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    CORRECT DEPENDENCY STRUCTURE                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  jat-abc (Epic): "Improve Dashboard"                                    │
│    └─ DEPENDS ON (blocked by):                                          │
│         → jat-abc.1: "Add caching" [READY - can start immediately]      │
│         → jat-abc.2: "Optimize queries" [READY - can start immediately] │
│         → jat-abc.3: "Add tests" [READY - can start immediately]        │
│                                                                          │
│  Flow:                                                                   │
│    1. Children are READY (no blockers, agents can pick them up)         │
│    2. Epic is BLOCKED (waiting for all children to complete)            │
│    3. When all children complete → Epic becomes READY                   │
│    4. Epic is then verification/UAT task                                │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                    WRONG (OLD) DEPENDENCY STRUCTURE                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  jat-abc (Epic): "Improve Dashboard"                                    │
│    └─ BLOCKS:                                                           │
│         ← jat-abc.1: "Add caching" [BLOCKED - waiting on epic!]         │
│         ← jat-abc.2: "Optimize queries" [BLOCKED]                       │
│         ← jat-abc.3: "Add tests" [BLOCKED]                              │
│                                                                          │
│  Problem: Epic appears READY but has no real work defined               │
│  Problem: Children can't start until epic is "done"                     │
│  Problem: Agent picks epic and tries to do ALL the child work           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Creating Epic with Children (Correct Pattern)

**Step 1: Create the epic (will be blocked by children)**
```bash
bd create "Improve Dashboard Performance" \
  --type epic \
  --description "Parent epic for performance improvements. This task becomes verification/UAT once all children complete." \
  --priority 1
# → Creates: jat-abc
```

**Step 2: Create child tasks**
```bash
# Create children as separate tasks
bd create "Add caching layer" --type task --priority 2
# → Creates: jat-def

bd create "Optimize database queries" --type task --priority 2
# → Creates: jat-ghi

bd create "Add performance tests" --type task --priority 3
# → Creates: jat-jkl
```

**Step 3: Set up dependencies (epic depends on children)**
```bash
# Epic is blocked by each child (NOT children blocked by epic!)
bd dep add jat-abc jat-def   # Epic depends on child 1
bd dep add jat-abc jat-ghi   # Epic depends on child 2
bd dep add jat-abc jat-jkl   # Epic depends on child 3
```

**Result:**
- `jat-abc` (epic) shows as BLOCKED until all children complete
- Children (`jat-def`, `jat-ghi`, `jat-jkl`) show as READY
- Agents can pick up children immediately
- When all children complete, epic becomes READY for verification

### Fixing Incorrectly Created Epics

If you have an epic with wrong dependency direction:

```bash
# Check current state
bd show jat-abc
# If it shows "Blocks: ← jat-abc.1, ← jat-abc.2" - it's WRONG

# Fix by removing and re-adding dependencies
bd dep remove jat-abc.1 jat-abc    # Remove child → parent dep
bd dep remove jat-abc.2 jat-abc
bd dep remove jat-abc.3 jat-abc

bd dep add jat-abc jat-abc.1       # Add parent → child dep (correct)
bd dep add jat-abc jat-abc.2
bd dep add jat-abc jat-abc.3

# Verify fix
bd show jat-abc
# Should now show "Depends on: → jat-abc.1, → jat-abc.2, → jat-abc.3"
```

---

## Completing an Epic (Verification/UAT Workflow)

**When all children are done, the epic becomes a verification task.**

When you pick up an epic that has become READY (all children completed), your job is:

1. **Verify all children are actually complete**
   - Check each child task is closed in Beads
   - Review the work done by child agents

2. **Run integration/UAT verification**
   - Run full test suite
   - Check for integration issues between components
   - Verify the combined work achieves the epic's goal

3. **Check for loose ends**
   - Any human actions that weren't completed?
   - Any suggested tasks that should become real tasks?
   - Any documentation that needs updating?

4. **Complete the epic normally**
   - If verification passes: run `/jat:complete`
   - If issues found: create follow-up tasks, document issues

### Epic Completion Output Template

When completing an epic, use this modified summary:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✅ Epic Verified: jat-abc "Improve Dashboard Performance"               │
│  👤 Agent: $agent_name                                                   │
│  [JAT:IDLE]                                                              │
│                                                                          │
│  📦 Child Tasks Completed:                                               │
│     ✓ jat-abc.1: Add caching layer (by CalmMeadow)                      │
│     ✓ jat-abc.2: Optimize database queries (by SwiftMoon)               │
│     ✓ jat-abc.3: Add performance tests (by JustGrove)                   │
│                                                                          │
│  🔍 Verification Results:                                                │
│     • Integration tests: passing                                         │
│     • Performance target: achieved (P99 < 200ms)                         │
│     • No regressions detected                                            │
│                                                                          │
│  🧑 Human actions required (from child tasks):                           │
│     [List any outstanding human actions from children]                   │
│                                                                          │
│  📊 Epic Impact:                                                         │
│     • Dashboard load time reduced by 75%                                 │
│     • Database query time reduced by 60%                                 │
│                                                                          │
│  💡 Epic complete. All work verified and integrated.                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Completing a Child Task (Epic Context)

When completing a child task that belongs to an epic:

**Step 1: Complete normally** using the standard completion flow.

**Step 2: Check if this was the LAST child**

```bash
# Check if parent epic still has blockers
parent_id=$(echo "$task_id" | sed 's/\.[0-9]*$//')
remaining=$(bd show "$parent_id" --json | jq -r '.[] | select(.status != "closed") | .id' | grep -v "$parent_id")

if [[ -z "$remaining" ]]; then
  echo "🎉 This was the last child! Parent epic jat-abc is now READY for verification."
fi
```

**Step 3: Include in completion summary:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✅ Task Completed: jat-abc.3 "Add performance tests"                    │
│  👤 Agent: JustGrove                                                     │
│  [JAT:IDLE]                                                              │
│                                                                          │
│  📦 Epic Status:                                                         │
│     Parent: jat-abc "Improve Dashboard Performance"                      │
│     Progress: 3/3 children complete                                      │
│     🎉 Epic is now READY for verification!                               │
│                                                                          │
│  [rest of standard summary...]                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

This helps the commander know when an epic is ready for final verification.
