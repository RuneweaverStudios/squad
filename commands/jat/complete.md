---
---

Complete current task properly with full verification. Session ends after completion.

# Agent Complete - Finish Task Properly

**Usage:**
- `/jat:complete` - Complete current task and show completion block for review
- `/jat:complete --kill` - Complete task and auto-kill session (self-destruct, no review)

**Flags:**
- `--kill` - Sets completion mode to `auto_kill`, session self-destructs after completion (no review)

**What this command does:**
1. **Read & Respond to Agent Mail** (ALWAYS - before completing)
2. **Full Completion Protocol**:
   - Verify task (tests, lint, security, browser checks)
   - Commit changes with proper message
3. **Beads Task Management**:
   - Mark task as complete in Beads (`bd close`)
   - Release file reservations
4. **Announce Completion** in Agent Mail
5. **End Session** - Session is complete, user spawns new agent for next task

**Key behaviors:**
- **ALWAYS check Agent Mail first** - before completing work
- Mail = read + respond + ack (not just silent batch-ack)

**When to use:**
- After you display "🔍 READY FOR REVIEW" and user approves
- Task is complete and ready to close

**When NOT to use:**
- Need to pivot quickly → use `/jat:pause` instead

**How the dashboard triggers this command:**

When the agent enters "ready-for-review" state, the dashboard checks review rules:

| Review Rules Result | Dashboard Action |
|---------------------|------------------|
| **AUTO** (e.g., P4 chore) | Dashboard auto-triggers `/jat:complete --kill` |
| **REVIEW** (e.g., P1 bug) | User reviews, then clicks "Complete" or "Complete & Kill" |

- **"Complete"** → Dashboard sends `/jat:complete` (session stays for review)
- **"Complete & Kill"** → Dashboard sends `/jat:complete --kill` (session self-destructs)
- **Auto-complete** → Dashboard sends `/jat:complete --kill` (no user interaction)

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

**Emit `completing` signal to show progress during verification.**

```bash
echo "Verifying task before completion..."

# Emit completing signal: verifying (0% progress)
jat-signal completing '{
  "taskId": "'"$task_id"'",
  "taskTitle": "'"$task_title"'",
  "currentStep": "verifying",
  "stepsCompleted": [],
  "stepsRemaining": ["committing", "closing", "releasing", "announcing"],
  "progress": 0,
  "stepDescription": "Running verification checks (tests, lint, security)"
}'

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

**Emit `completing` signal for the committing step.**

```bash
echo "Committing changes..."

# Emit completing signal: committing (20% progress)
jat-signal completing '{
  "taskId": "'"$task_id"'",
  "taskTitle": "'"$task_title"'",
  "currentStep": "committing",
  "stepsCompleted": ["verifying"],
  "stepsRemaining": ["closing", "releasing", "announcing"],
  "progress": 20,
  "stepDescription": "Committing changes to git"
}'

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

**Emit `completing` signal for the closing step.**

```bash
# Emit completing signal: closing (40% progress)
jat-signal completing '{
  "taskId": "'"$task_id"'",
  "taskTitle": "'"$task_title"'",
  "currentStep": "closing",
  "stepsCompleted": ["verifying", "committing"],
  "stepsRemaining": ["releasing", "announcing"],
  "progress": 40,
  "stepDescription": "Marking task complete in Beads"
}'

bd close "$task_id" --reason "Completed by $agent_name"
```

---

### STEP 5.5: Auto-Close Eligible Epics

**After closing a task, check if any parent epics are now fully complete.**

This ensures epics don't linger in "open" status when all children are done.

```bash
# Auto-close epics where all children are complete
bd epic close-eligible

# This command:
# - Finds all epics with issue_type=epic and status=open
# - Checks if all child tasks (by ID pattern) are closed
# - Automatically closes eligible epics
# - Reports what was closed
```

**Why this matters:**
- Without this, epics stay open forever even when all work is done
- The Epic Swarm dropdown filters out closed epics
- This keeps the task list clean and accurate

---

### STEP 6: Release File Reservations

**Emit `completing` signal for the releasing step.**

```bash
# Emit completing signal: releasing (60% progress)
jat-signal completing '{
  "taskId": "'"$task_id"'",
  "taskTitle": "'"$task_title"'",
  "currentStep": "releasing",
  "stepsCompleted": ["verifying", "committing", "closing"],
  "stepsRemaining": ["announcing"],
  "progress": 60,
  "stepDescription": "Releasing file reservations"
}'

# Release all file reservations for this agent
am-reservations --agent "$agent_name" --json | jq -r '.[].path_pattern' | while read pattern; do
  am-release "$pattern" --agent "$agent_name"
done
```

---

### STEP 7: Announce Completion

**Emit `completing` signal for the announcing step.**

```bash
# Emit completing signal: announcing (80% progress)
jat-signal completing '{
  "taskId": "'"$task_id"'",
  "taskTitle": "'"$task_title"'",
  "currentStep": "announcing",
  "stepsCompleted": ["verifying", "committing", "closing", "releasing"],
  "stepsRemaining": [],
  "progress": 80,
  "stepDescription": "Announcing completion to other agents"
}'

am-send "[$task_id] Completed: $task_title" \
  "Task completed by $agent_name.

Status: Complete
Type: $task_type
Verification: Full (tests, lint, security)" \
  --from "$agent_name" \
  --to @active \
  --thread "$task_id"
```

---

### STEP 7.5: Determine Review Action (Configurable Rules)

**After announcing completion, determine which completion signal to emit based on configurable rules.**

This step implements the review rules system that allows project-level configuration of which tasks require human review vs auto-kill.

#### Rule Evaluation Order

```
0. Check session epic context (.claude/sessions/context-{session_id}.json)
   └─ If epic context exists with reviewThreshold:
      └─ Compare task.priority to threshold
      └─ If priority > threshold: COMPLETION_MODE="review_required" → completed signal (no autoKill)
      └─ If priority <= threshold: COMPLETION_MODE="auto_kill" → completed signal with autoKill: true
   └─ Epic context takes precedence over all other rules

1. Check task.notes for [REVIEW_OVERRIDE:...] pattern
   └─ If found → Use override action (always_review, auto_kill, force_review)

2. Load .beads/review-rules.json
   └─ Find rule matching task.issue_type
   └─ Compare task.priority to rule.maxAutoPriority

3. If config missing → review required (safe default)
```

**Note on priority semantics:** Lower priority number = higher importance (P0 is critical, P4 is lowest).
The threshold represents the HIGHEST priority number that should auto-kill.
- `threshold: 1` → Only P0 and P1 auto-kill, P2-P4 require review
- `threshold: 3` → P0-P3 auto-kill, only P4 requires review

#### Implementation

```bash
# Parse command-line flags (set by dashboard based on user choice)
# --kill: Session should self-destruct after completion (no review)
KILL_FLAG=false

for arg in "$@"; do
  case "$arg" in
    --kill) KILL_FLAG=true ;;
  esac
done

# If --kill flag provided, skip all rule evaluation and auto-kill
if [[ "$KILL_FLAG" == "true" ]]; then
  COMPLETION_MODE="auto_kill"
  echo "📋 Mode: Complete & Kill (self-destruct session)"
else
  # No flag provided - evaluate rules to determine completion mode
  # This happens when user clicks "Complete" button (show completion block)

  # Get task details
  task_json=$(bd show "$task_id" --json)
  task_notes=$(echo "$task_json" | jq -r '.[0].notes // ""')
  task_priority=$(echo "$task_json" | jq -r '.[0].priority')
  task_type=$(echo "$task_json" | jq -r '.[0].issue_type')

  COMPLETION_MODE=""  # Will be set by first matching rule: "review_required" or "auto_kill"

  # Step 0: Check session epic context (highest priority)
# Session context is set by dashboard when spawning agents for epic execution
session_id=$(~/code/jat/scripts/get-current-session-id)
context_file=".claude/sessions/context-${session_id}.json"

if [[ -f "$context_file" ]]; then
  epic_threshold=$(jq -r '.reviewThreshold // empty' "$context_file")

  if [[ -n "$epic_threshold" ]]; then
    # Convert reviewThreshold string to numeric threshold
    # 'all' = always review (threshold -1)
    # 'none' = never review (threshold 4)
    # 'p0' = only P0 requires review (threshold -1 means P0+ auto-kill is wrong)
    # 'p0-p1' = P0-P1 require review (threshold 1, P2+ auto-kill)
    # 'p0-p2' = P0-P2 require review (threshold 2, P3+ auto-kill)
    case "$epic_threshold" in
      "all")
        echo "📋 Epic context: reviewThreshold='all' → All tasks require review"
        COMPLETION_MODE="review_required"
        ;;
      "none")
        echo "📋 Epic context: reviewThreshold='none' → All tasks auto-kill"
        COMPLETION_MODE="auto_kill"
        ;;
      "p0")
        # Only P0 requires review; P1+ auto-kill
        if (( task_priority == 0 )); then
          echo "📋 Epic context: P0 task requires review (threshold: p0)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-kills (threshold: p0)"
          COMPLETION_MODE="auto_kill"
        fi
        ;;
      "p0-p1")
        # P0-P1 require review; P2+ auto-kill
        if (( task_priority <= 1 )); then
          echo "📋 Epic context: P${task_priority} task requires review (threshold: p0-p1)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-kills (threshold: p0-p1)"
          COMPLETION_MODE="auto_kill"
        fi
        ;;
      "p0-p2")
        # P0-P2 require review; P3+ auto-kill
        if (( task_priority <= 2 )); then
          echo "📋 Epic context: P${task_priority} task requires review (threshold: p0-p2)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-kills (threshold: p0-p2)"
          COMPLETION_MODE="auto_kill"
        fi
        ;;
      *)
        echo "⚠️ Unknown epic reviewThreshold: $epic_threshold (ignoring)"
        ;;
    esac
  fi
fi

# If epic context didn't set mode, continue with other rules
if [[ -z "$COMPLETION_MODE" ]]; then
  COMPLETION_MODE="review_required"  # Default: requires review

  # Step 1: Check for per-task override in notes
  if echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:always_review\]'; then
    echo "📋 Review override detected: always_review"
    COMPLETION_MODE="review_required"
  elif echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:auto_kill\]'; then
    echo "📋 Review override detected: auto_kill"
    COMPLETION_MODE="auto_kill"
  elif echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:force_review\]'; then
    echo "📋 Review override detected: force_review"
    COMPLETION_MODE="review_required"
  else
  # Step 2: Load review-rules.json and apply type-based rules
  rules_file=".beads/review-rules.json"

  if [[ -f "$rules_file" ]]; then
    # Find maxAutoPriority for this task type
    max_auto=$(jq -r --arg type "$task_type" \
      '.rules[] | select(.type == $type) | .maxAutoPriority // -1' \
      "$rules_file")

    if [[ "$max_auto" != "-1" && "$max_auto" != "null" && -n "$max_auto" ]]; then
      # Compare: task can auto-kill if priority <= maxAutoPriority
      # (lower number = higher priority, e.g., P0 < P3)
      if (( task_priority <= max_auto )); then
        echo "📋 Auto-kill: P${task_priority} ${task_type} (max: P${max_auto})"
        COMPLETION_MODE="auto_kill"
      else
        echo "📋 Review required: P${task_priority} ${task_type} (max auto: P${max_auto})"
        COMPLETION_MODE="review_required"
      fi
    else
      # No rule for this type, check defaultAction
      default_action=$(jq -r '.defaultAction // "review"' "$rules_file")
      if [[ "$default_action" == "auto" ]]; then
        COMPLETION_MODE="auto_kill"
      else
        COMPLETION_MODE="review_required"
      fi
    fi
  else
    # Step 3: Fallback - NO auto-kill without explicit configuration
    #
    # CRITICAL: Auto-kill should ONLY happen when deliberately enabled:
    # 1. Epic context file exists (dashboard spawned agent for swarm)
    # 2. Per-task override in notes ([REVIEW_OVERRIDE:auto_kill])
    # 3. Project has .beads/review-rules.json with explicit rules
    #
    # Without any of these, the user should decide what to do next.
    # Spawning random unrelated tasks is confusing and wrong.
    echo "📋 No review-rules.json and no epic context → review required (default)"
    COMPLETION_MODE="review_required"
  fi
  fi  # End of: if [[ -z "$COMPLETION_MODE" ]]
fi  # End of: else (no REVIEW_OVERRIDE found)
fi  # End of: if/elif/else for --kill flag

# COMPLETION_MODE is now set - will be used in Step 8 when emitting jat-signal complete
# The actual signal emission happens in Step 8 with the full completion bundle
echo "📋 Completion mode determined: ${COMPLETION_MODE}"
```

#### Review Override Values

| Override Value | COMPLETION_MODE | Behavior | Use Case |
|----------------|-----------------|----------|----------|
| `always_review` | `review_required` | Session stays open for human review | Testing override behavior |
| `auto_kill` | `auto_kill` | Session self-destructs after completion | Skip review for specific task |
| `force_review` | `review_required` | Session stays open for human review | Force review even if rules say auto |

#### Example review-rules.json

```json
{
  "version": 1,
  "defaultAction": "review",
  "priorityThreshold": 3,
  "rules": [
    { "type": "bug", "maxAutoPriority": 3, "note": "P0-P3 bugs auto-kill" },
    { "type": "feature", "maxAutoPriority": 3, "note": "P0-P3 features auto-kill" },
    { "type": "task", "maxAutoPriority": 3 },
    { "type": "chore", "maxAutoPriority": 4, "note": "All chores auto-kill" },
    { "type": "epic", "maxAutoPriority": -1, "note": "Epics always require review" }
  ],
  "overrides": []
}
```

**Understanding maxAutoPriority:**
- Value represents highest priority number that can auto-kill
- Lower priority number = higher importance (P0 is most critical)
- `maxAutoPriority: 3` means P0, P1, P2, P3 can auto-kill; P4 requires review
- `maxAutoPriority: -1` means no auto-kill (always review)
- `maxAutoPriority: 4` means all priorities auto-kill

#### Session Epic Context

When agents are spawned as part of an epic swarm, the dashboard writes session context to:
```
.claude/sessions/context-{session_id}.json
```

**Context file format:**
```json
{
  "epicId": "jat-abc",
  "reviewThreshold": "p0-p1",
  "spawnedAt": "2025-12-08T15:30:00.000Z"
}
```

**reviewThreshold values:**

| Value | Requires Review | Auto-Proceed |
|-------|-----------------|--------------|
| `all` | All priorities | None |
| `p0` | P0 only | P1-P4 |
| `p0-p1` | P0, P1 | P2-P4 |
| `p0-p2` | P0, P1, P2 | P3-P4 |
| `none` | None | All priorities |

**Dashboard integration:**

When the dashboard spawns an agent for epic execution (via `epicQueueStore.launchEpic()`), it should:

1. Call POST `/api/sessions` to spawn the agent
2. Get the session ID from the response
3. Write context file: `.claude/sessions/context-{session_id}.json`
4. Include the `reviewThreshold` from `epicQueueStore.settings`

**Example dashboard code:**
```typescript
// After spawning agent
const contextPath = `.claude/sessions/context-${sessionId}.json`;
const context = {
  epicId: state.epicId,
  reviewThreshold: state.settings.reviewThreshold,
  spawnedAt: new Date().toISOString()
};
await writeFile(contextPath, JSON.stringify(context, null, 2));
```

**Note:** Epic context takes precedence over all other review rules. This allows the human commander to set a review threshold for the entire epic swarm, overriding per-project or per-task defaults.

---

### STEP 8: Emit Structured Completion Signal

**Use the `jat-complete-bundle` tool to generate the completion bundle.**

The tool gathers all context (task details, git status, diffs, commits) and calls the Anthropic API to generate a structured CompletionBundle JSON.

```bash
# Generate the completion bundle (uses COMPLETION_MODE from Step 7.5)
BUNDLE=$(jat-complete-bundle --task "$task_id" --agent "$agent_name" --mode "$COMPLETION_MODE")

# If auto_kill with next task:
# BUNDLE=$(jat-complete-bundle --task "$task_id" --agent "$agent_name" --mode auto_proceed --next-task "$next_task_id")

# Emit the signal
jat-signal complete "$BUNDLE"
```

**What jat-complete-bundle does:**
1. Fetches task details from Beads (title, type, priority, description)
2. Collects git status, diff stats, recent commits
3. Sends context to LLM to generate structured summary with:
   - Summary bullets
   - Quality signals (tests, build status)
   - Human actions (if manual steps needed)
   - Suggested follow-up tasks
   - Cross-agent intel (files, patterns, gotchas)
   - AI insights (suggested rename, labels, risk level)
4. Outputs valid JSON for `jat-signal complete`

**Requirements:**
- `ANTHROPIC_API_KEY` environment variable must be set
- Task must exist in Beads

#### Then Output Terminal Debrief

After emitting the signal, output a completion summary. The bundle JSON contains all the fields - parse and display them:

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: $task_id                                              ║
║  👤 Agent: $agent_name                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

[Display summary, quality status, human actions, suggested tasks, and cross-agent intel from the bundle]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Session complete. Dashboard shows interactive UI for creating suggested tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### What the Dashboard Does

When it receives the `complete` signal:

1. **Human Actions Panel** - Shows checklist with checkboxes
   - User can check off actions as they complete them
   - Uncompleted actions show warning indicator

2. **Suggested Tasks Panel** - Shows task cards
   - Each task has "Create in Beads" button
   - One-click creation with all fields pre-filled
   - Bulk "Create All" option

3. **Quality Badge** - Visual indicator
   - Green checkmark for passing/clean
   - Yellow warning for warnings/pre-existing issues
   - Red X for failures

4. **Cross-Agent Intel** - Collapsible section
   - Files listed with copy buttons
   - Patterns and gotchas displayed for reference

---

## Quick Mode Behavior

**This command does NOT have a quick mode.**

Full verification ensures quality before task closure.

**Still done (NEVER skip these):**
- STEP 2: Read & respond to Agent Mail
- All other steps

---

## Output Examples

The completion output is generated by `jat-complete-bundle`. A typical flow looks like:

```
📬 Checking Agent Mail...
  No unread messages

🔍 Verifying task...
   ✅ Tests passed
   ✅ Build clean

💾 Committing changes...
   ✅ Committed: "feat: Add user settings page"

✅ Marking task complete in Beads...
   ✅ Closed jat-abc

📢 Announcing completion...
   ✅ Sent to @active

╔═══════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: jat-abc                                   ║
║  👤 Agent: JustGrove                                          ║
╚═══════════════════════════════════════════════════════════════╝

[Summary, quality status, suggested tasks, cross-agent intel from bundle]
```

---

## Dashboard State Signals

The completion flow uses these signals (captured by PostToolUse hook):

| Signal Command | When to Run | Dashboard Effect |
|----------------|-------------|------------------|
| `jat-signal completing '{...}'` | During each completion step | Shows progress bar and current step |
| `jat-signal complete '{...}'` | After all completion steps | Full completion bundle with summary, suggested tasks, human actions, cross-agent intel |

**The `jat-signal complete` bundle is the ONLY completion signal needed.** It includes:
- `completionMode: "review_required"` → Dashboard shows COMPLETED state, session stays open for review
- `completionMode: "auto_kill"` with `nextTaskId` → Dashboard auto-kills session and spawns next task

### Completing Signal Progress Sequence

The `completing` signal is emitted at each step of the completion workflow:

| Step | currentStep | progress | stepsCompleted | stepsRemaining |
|------|-------------|----------|----------------|----------------|
| 3 | `verifying` | 0% | [] | [committing, closing, releasing, announcing] |
| 4 | `committing` | 20% | [verifying] | [closing, releasing, announcing] |
| 5 | `closing` | 40% | [verifying, committing] | [releasing, announcing] |
| 6 | `releasing` | 60% | [verifying, committing, closing] | [announcing] |
| 7 | `announcing` | 80% | [verifying, committing, closing, releasing] | [] |
| 8 | (complete) | 100% | All steps | [] |

**Completing Signal Payload:**
```bash
jat-signal completing '{
  "taskId": "jat-abc",
  "taskTitle": "Add user authentication",
  "currentStep": "committing",
  "stepsCompleted": ["verifying"],
  "stepsRemaining": ["closing", "releasing", "announcing"],
  "progress": 20,
  "stepDescription": "Committing changes to git"
}'
```

**Dashboard renders:** Progress bar at 20%, "Step 2/5: Committing changes to git"

**Completion mode is determined in Step 7.5** based on:
1. Per-task override in notes (`[REVIEW_OVERRIDE:...]`)
2. Project review rules (`.beads/review-rules.json`)
3. Safe default: review required (no auto-kill without explicit configuration)

**Critical timing:**
- Do NOT run `jat-signal complete` until AFTER all completion steps succeed
- If you signal early, dashboard shows "complete" but task is still open in Beads
- This causes confusion - other agents think task is done when it isn't

**Human actions:**
- Include in the `humanActions` array within the `jat-signal complete` bundle
- Dashboard renders these as an interactive checklist for manual steps

**Only one signal call needed:** Use `jat-signal complete` with the full bundle (Step 8).

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

| Step | Name | When | Completing Signal |
|------|------|------|-------------------|
| 1A-C | Get Task and Agent Identity | ALWAYS | - |
| 1D | Spontaneous Work Detection | If no in_progress task found | - |
| 2 | Read & Respond to Mail | ALWAYS (after task identified) | - |
| 3 | Verify Task | ALWAYS | `verifying` (0%) |
| 4 | Commit Changes | ALWAYS | `committing` (20%) |
| 5 | Mark Task Complete | ALWAYS | `closing` (40%) |
| 5.5 | Auto-Close Eligible Epics | ALWAYS | - |
| 6 | Release Reservations | ALWAYS | `releasing` (60%) |
| 7 | Announce Completion | ALWAYS | `announcing` (80%) |
| 7.5 | Determine Review Action | ALWAYS (sets COMPLETION_MODE) | - |
| 8 | Emit Completion Bundle | ALWAYS | (100% implied) |

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
   - Session ENDS after completion (do NOT show "Available Tasks")
   - User spawns new agent for next task
   - Keeps context clean and focused
   - Completion summary shows: what was accomplished, suggested follow-ups, human actions

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

When completing an epic, use this modified summary with full debrief sections:

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ EPIC VERIFIED: jat-abc "Improve Dashboard Performance"                ║
║  👤 Agent: $agent_name                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📦 CHILD TASKS COMPLETED ────────────────────────────────────────────────┐
│                                                                          │
│  ✓ jat-abc.1: Add caching layer (by CalmMeadow)                          │
│  ✓ jat-abc.2: Optimize database queries (by SwiftMoon)                   │
│  ✓ jat-abc.3: Add performance tests (by JustGrove)                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔍 VERIFICATION RESULTS ─────────────────────────────────────────────────┐
│                                                                          │
│  • Integration tests: passing                                            │
│  • Performance target: achieved (P99 < 200ms)                            │
│  • No regressions detected                                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🧑 HUMAN ACTIONS REQUIRED (from child tasks) ────────────────────────────┐
│                                                                          │
│  1. Deploy cache layer to production                                     │
│     → From jat-abc.1: Run cache warmup script after deploy               │
│                                                                          │
│  2. Update monitoring dashboards                                         │
│     → From jat-abc.3: Add P99 latency alerts for new endpoints           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 📊 EPIC IMPACT ──────────────────────────────────────────────────────────┐
│                                                                          │
│  • Dashboard load time reduced by 75%                                    │
│  • Database query time reduced by 60%                                    │
│  • User-facing latency P99 now under 200ms                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 💡 SUGGESTED FOLLOW-UP TASKS ────────────────────────────────────────────┐
│  (Discovered during epic verification)                                   │
│                                                                          │
│  [P3] [task] Add cache invalidation monitoring                           │
│       Track cache hit/miss ratios, alert on degradation                  │
│       Reason: Caching layer deployed but no observability yet            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔗 CROSS-AGENT INTEL (aggregated from children) ─────────────────────────┐
│                                                                          │
│  📁 Files modified across epic:                                           │
│     • src/lib/cache/redis.ts (jat-abc.1)                                 │
│     • src/lib/db/queries.ts (jat-abc.2)                                  │
│     • tests/integration/performance.test.ts (jat-abc.3)                  │
│                                                                          │
│  📐 Patterns established:                                                 │
│     • Use Redis client from $lib/cache for all caching                   │
│     • Performance tests should use P99 not average latency               │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • Cache TTL must match session duration (from jat-abc.1)             │
│     • Query planner hints needed for complex joins (from jat-abc.2)      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Epic complete. All work verified and integrated.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

**Step 3: Include epic status in completion summary:**

When completing a child task that belongs to an epic, add an "EPIC STATUS" section after the header:

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: jat-abc.3 "Add performance tests"                     ║
║  👤 Agent: JustGrove                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📦 EPIC STATUS ──────────────────────────────────────────────────────────┐
│                                                                          │
│  Parent: jat-abc "Improve Dashboard Performance"                         │
│  Progress: 3/3 children complete                                         │
│  🎉 Epic is now READY for verification!                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 📋 WHAT WAS ACCOMPLISHED ────────────────────────────────────────────────┐
│                                                                          │
│  • Added integration performance test suite                              │
│  • Implemented P99 latency assertions                                    │
│  • Set up load test fixtures                                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

[... rest of standard full debrief sections ...]
```

This helps the commander know when an epic is ready for final verification.
