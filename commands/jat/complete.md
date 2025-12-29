---
---

Complete current task properly with full verification. Session ends after completion.

# Agent Complete - Finish Task Properly

**Usage:**
- `/jat:complete` - Complete current task with full verification

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

This step implements the review rules system that allows project-level configuration of which tasks require human review vs auto-proceed.

#### Rule Evaluation Order

```
0. Check session epic context (.claude/sessions/context-{session_id}.json)
   └─ If epic context exists with reviewThreshold:
      └─ Compare task.priority to threshold
      └─ If priority > threshold: COMPLETION_MODE="review_required" → completed signal (no autoProceed)
      └─ If priority <= threshold: COMPLETION_MODE="auto_proceed" → completed signal with autoProceed: true
   └─ Epic context takes precedence over all other rules

1. Check task.notes for [REVIEW_OVERRIDE:...] pattern
   └─ If found → Use override action (always_review, auto_proceed, force_review)

2. Load .beads/review-rules.json
   └─ Find rule matching task.issue_type
   └─ Compare task.priority to rule.maxAutoPriority

3. If config missing → review required (safe default)
```

**Note on priority semantics:** Lower priority number = higher importance (P0 is critical, P4 is lowest).
The threshold represents the HIGHEST priority number that should auto-proceed.
- `threshold: 1` → Only P0 and P1 auto-proceed, P2-P4 require review
- `threshold: 3` → P0-P3 auto-proceed, only P4 requires review

#### Implementation

```bash
# Get task details
task_json=$(bd show "$task_id" --json)
task_notes=$(echo "$task_json" | jq -r '.[0].notes // ""')
task_priority=$(echo "$task_json" | jq -r '.[0].priority')
task_type=$(echo "$task_json" | jq -r '.[0].issue_type')

COMPLETION_MODE=""  # Will be set by first matching rule: "review_required" or "auto_proceed"

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
    # 'p0' = only P0 requires review (threshold -1 means P0+ auto-proceed is wrong)
    # 'p0-p1' = P0-P1 require review (threshold 1, P2+ auto-proceed)
    # 'p0-p2' = P0-P2 require review (threshold 2, P3+ auto-proceed)
    case "$epic_threshold" in
      "all")
        echo "📋 Epic context: reviewThreshold='all' → All tasks require review"
        COMPLETION_MODE="review_required"
        ;;
      "none")
        echo "📋 Epic context: reviewThreshold='none' → All tasks auto-proceed"
        COMPLETION_MODE="auto_proceed"
        ;;
      "p0")
        # Only P0 requires review; P1+ auto-proceed
        if (( task_priority == 0 )); then
          echo "📋 Epic context: P0 task requires review (threshold: p0)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-proceeds (threshold: p0)"
          COMPLETION_MODE="auto_proceed"
        fi
        ;;
      "p0-p1")
        # P0-P1 require review; P2+ auto-proceed
        if (( task_priority <= 1 )); then
          echo "📋 Epic context: P${task_priority} task requires review (threshold: p0-p1)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-proceeds (threshold: p0-p1)"
          COMPLETION_MODE="auto_proceed"
        fi
        ;;
      "p0-p2")
        # P0-P2 require review; P3+ auto-proceed
        if (( task_priority <= 2 )); then
          echo "📋 Epic context: P${task_priority} task requires review (threshold: p0-p2)"
          COMPLETION_MODE="review_required"
        else
          echo "📋 Epic context: P${task_priority} task auto-proceeds (threshold: p0-p2)"
          COMPLETION_MODE="auto_proceed"
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
  elif echo "$task_notes" | grep -q '\[REVIEW_OVERRIDE:auto_proceed\]'; then
    echo "📋 Review override detected: auto_proceed"
    COMPLETION_MODE="auto_proceed"
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
      # Compare: task can auto-proceed if priority <= maxAutoPriority
      # (lower number = higher priority, e.g., P0 < P3)
      if (( task_priority <= max_auto )); then
        echo "📋 Auto-proceed: P${task_priority} ${task_type} (max: P${max_auto})"
        COMPLETION_MODE="auto_proceed"
      else
        echo "📋 Review required: P${task_priority} ${task_type} (max auto: P${max_auto})"
        COMPLETION_MODE="review_required"
      fi
    else
      # No rule for this type, check defaultAction
      default_action=$(jq -r '.defaultAction // "review"' "$rules_file")
      if [[ "$default_action" == "auto" ]]; then
        COMPLETION_MODE="auto_proceed"
      else
        COMPLETION_MODE="review_required"
      fi
    fi
  else
    # Step 3: Fallback - NO auto-proceed without explicit configuration
    #
    # CRITICAL: Auto-proceed should ONLY happen when deliberately enabled:
    # 1. Epic context file exists (dashboard spawned agent for swarm)
    # 2. Per-task override in notes ([REVIEW_OVERRIDE:auto_proceed])
    # 3. Project has .beads/review-rules.json with explicit rules
    #
    # Without any of these, the user should decide what to do next.
    # Spawning random unrelated tasks is confusing and wrong.
    echo "📋 No review-rules.json and no epic context → review required (default)"
    COMPLETION_MODE="review_required"
  fi
  fi  # End of: if [[ -z "$COMPLETION_MODE" ]]
fi  # End of: else (no REVIEW_OVERRIDE found)

# Emit the completion signal with JSON payload
# Use 'completed' for review required, 'auto_proceed' for auto-spawn
if [[ "$COMPLETION_MODE" == "review_required" ]]; then
  # Standard completed signal - task finished, awaiting review
  jat-signal completed '{"taskId":"'"$task_id"'","outcome":"success"}'
elif [[ "$COMPLETION_MODE" == "auto_proceed" ]]; then
  # Query next ready task before emitting auto_proceed signal
  next_task_json=$(bd ready --json 2>/dev/null | jq -r '.[0] // empty')
  next_task_id=""
  next_task_title=""
  if [[ -n "$next_task_json" ]]; then
    next_task_id=$(echo "$next_task_json" | jq -r '.id // empty')
    next_task_title=$(echo "$next_task_json" | jq -r '.title // empty')
  fi

  # Emit auto_proceed signal - dashboard will spawn next task automatically
  jat-signal auto_proceed '{"taskId":"'"$task_id"'","nextTaskId":"'"$next_task_id"'","nextTaskTitle":"'"$next_task_title"'"}'
fi
```

#### Review Override Values

| Override Value | COMPLETION_MODE | Signal Emitted | Use Case |
|----------------|-----------------|----------------|----------|
| `always_review` | `review_required` | `completed` | Testing override behavior |
| `auto_proceed` | `auto_proceed` | `auto_proceed` | Skip review for specific task |
| `force_review` | `review_required` | `completed` | Force review even if rules say auto |

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

**CRITICAL: Emit a structured completion signal so the dashboard can render an interactive UI.**

Instead of just outputting text, you MUST build a JSON completion bundle and emit it via `jat-signal complete`. This enables:
- One-click task creation for suggested follow-up work
- Interactive checklist for human actions
- Structured display of quality signals and cross-agent intel

**Before building the bundle, actively search for follow-up work.** Look at:
- Files you modified - any related issues?
- Adjacent code - tech debt or improvements?
- Test coverage - gaps you noticed?
- Documentation - needs updating?

You MUST include at least one suggested task (see suggestedTasks below).

#### Build the Completion Bundle

Analyze your work and build a JSON object with these fields:

```typescript
interface CompletionBundle {
  // REQUIRED
  taskId: string;           // The task ID (e.g., "jat-abc")
  agentName: string;        // Your agent name
  summary: string[];        // Array of accomplishment bullet points

  // REQUIRED - Quality signals
  quality: {
    tests: "passing" | "failing" | "none" | "skipped";
    build: "clean" | "warnings" | "errors";
    preExisting?: string;   // Note if issues were pre-existing
  };

  // OPTIONAL - Only if manual steps needed
  humanActions?: Array<{
    title: string;          // Short title (3-8 words)
    description: string;    // Detailed steps
  }>;

  // REQUIRED - Always look for follow-up work!
  // If you genuinely found nothing, explain why in a single task with type "task"
  suggestedTasks: Array<{
    type: "feature" | "bug" | "task" | "chore";
    title: string;          // Task title
    description: string;    // What needs to be done
    priority: number;       // 0-4 (P0=critical, P4=backlog)
    reason?: string;        // Why this was discovered
    project?: string;       // Project ID (e.g., "jat", "chimaro") - defaults to current project
    labels?: string;        // Comma-separated labels (e.g., "ui,auth,critical")
    depends_on?: string[];  // Task IDs this depends on (e.g., ["jat-abc", "jat-def"])
  }>;

  // OPTIONAL - Intel for other agents
  crossAgentIntel?: {
    files?: string[];       // Key files modified
    patterns?: string[];    // Conventions to follow
    gotchas?: string[];     // Surprises or tricky areas
  };
}
```

#### Emit the Signal

```bash
# Build the JSON (escape quotes properly!)
jat-signal complete '{
  "taskId": "jat-abc",
  "agentName": "WisePrairie",
  "summary": [
    "Fixed authentication flow for OAuth providers",
    "Added retry logic for failed token refreshes"
  ],
  "quality": {
    "tests": "passing",
    "build": "clean"
  },
  "humanActions": [
    {
      "title": "Enable OAuth in Supabase",
      "description": "Go to Authentication > Providers and enable Google OAuth"
    }
  ],
  "suggestedTasks": [
    {
      "type": "feature",
      "title": "Add Apple Sign-In support",
      "description": "Similar flow to Google OAuth, needs Apple Developer account setup",
      "priority": 2,
      "reason": "Discovered while implementing Google OAuth",
      "project": "chimaro",
      "labels": "auth,oauth,ios"
    },
    {
      "type": "task",
      "title": "Add OAuth error tracking",
      "description": "Log failed OAuth attempts to Sentry for debugging",
      "priority": 3,
      "depends_on": ["jat-abc"]
    }
  ],
  "crossAgentIntel": {
    "files": ["src/lib/auth/oauth.ts", "src/routes/auth/callback/+server.ts"],
    "patterns": ["Use authError() helper for consistent error responses"],
    "gotchas": ["Token refresh can fail silently - always check response.ok"]
  }
}'
```

**JSON Escaping Rules:**
- Use single quotes around the entire JSON argument
- Use double quotes inside JSON (standard JSON format)
- Escape any internal single quotes with `'\''` if needed
- Test with `echo '...' | jq .` to validate

#### Then Output Full Terminal Debrief

After emitting the signal, output a comprehensive completion summary. **This is a full debrief for the user, not just a log.**

The terminal summary should mirror everything in the signal - the user viewing the terminal deserves the same complete information as the dashboard UI.

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: $task_id                                              ║
║  👤 Agent: $agent_name                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📋 WHAT WAS ACCOMPLISHED ────────────────────────────────────────────────┐
│                                                                          │
│  • [Summary bullet 1 - specific accomplishment]                          │
│  • [Summary bullet 2 - specific accomplishment]                          │
│  • [Summary bullet 3 - specific accomplishment]                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ ⚡ QUALITY STATUS ───────────────────────────────────────────────────────┐
│                                                                          │
│  Tests: [passing/failing/none/skipped] ([N/N] if applicable)             │
│  Build: [clean/warnings/errors]                                          │
│  Pre-existing: [note if any issues were pre-existing]                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🧑 HUMAN ACTIONS REQUIRED ───────────────────────────────────────────────┐
│  (Manual steps needed to complete this work)                             │
│                                                                          │
│  1. [Action title]                                                       │
│     → [Detailed description of what to do]                               │
│                                                                          │
│  2. [Action title]                                                       │
│     → [Detailed description of what to do]                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 💡 SUGGESTED FOLLOW-UP TASKS ────────────────────────────────────────────┐
│  (Ideas discovered during this work - use dashboard to create in Beads)  │
│                                                                          │
│  [P2] [feature] Add Apple Sign-In support                                │
│       Similar flow to Google OAuth, needs Apple Developer account setup  │
│       Reason: Discovered while implementing Google OAuth                 │
│                                                                          │
│  [P3] [task] Add OAuth error tracking                                    │
│       Log failed OAuth attempts to Sentry for debugging                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔗 CROSS-AGENT INTEL ────────────────────────────────────────────────────┐
│  (Knowledge to share with other agents working in this codebase)         │
│                                                                          │
│  📁 Files modified:                                                       │
│     • src/lib/auth/oauth.ts                                              │
│     • src/routes/auth/callback/+server.ts                                │
│                                                                          │
│  📐 Patterns to follow:                                                   │
│     • Use authError() helper for consistent error responses              │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • Token refresh can fail silently - always check response.ok         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔄 PATTERN APPLICABILITY ────────────────────────────────────────────────┐
│  (How this work pattern could apply elsewhere in the project)            │
│                                                                          │
│  The retry-with-backoff pattern used for token refresh could also be appl│
│  to: API calls in src/lib/api.ts, webhook deliveries, database reconnecti│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Session complete. Dashboard shows interactive UI for creating suggested tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Section Guidelines:**

| Section | When to Include | What to Show |
|---------|-----------------|--------------|
| WHAT WAS ACCOMPLISHED | Always | All summary bullets from signal |
| QUALITY STATUS | Always | Tests and build status with details |
| HUMAN ACTIONS REQUIRED | If humanActions in signal | Full title + description for each |
| SUGGESTED FOLLOW-UP TASKS | If suggestedTasks in signal | Priority, type, title, description, reason |
| CROSS-AGENT INTEL | If crossAgentIntel in signal | Files, patterns, gotchas |
| PATTERN APPLICABILITY | When applicable | How patterns used here apply elsewhere |

**Omit sections if empty** - don't show "None" for empty sections, just skip them.

**The dashboard ALSO renders this information** via the structured signal, but the terminal debrief ensures users who primarily interact via terminal get the full context.

---

### Field Guidelines

#### Human Actions (humanActions)

Include when the user must take manual steps for the task to be truly complete:
- Run migration in production
- Enable feature flags
- Configure third-party services
- Update environment variables
- Deploy to production
- Manual testing required

**Do NOT include:**
- "Review the code" (that's implied)
- "Test in browser" (you should have done this)
- General suggestions (those go in suggestedTasks)

#### Suggested Tasks (suggestedTasks) - REQUIRED

**You MUST always include suggested tasks.** Before completing, actively search for:
- Similar code that needs the same fix
- Tech debt you noticed while working
- Features that would improve the area you worked on
- Bugs you found but didn't fix (out of scope)
- Documentation that needs updating
- Tests that should be added
- Error handling improvements
- Performance optimizations noticed

**If you genuinely found nothing after searching**, include one task explaining this:
```json
{
  "type": "task",
  "title": "Review [area] for improvements",
  "description": "Completed [task] - code was clean, no obvious follow-up needed. Future reviewer should check for edge cases.",
  "priority": 4,
  "reason": "No immediate follow-up discovered during task completion"
}
```

**Priority Guide:**
- P0: Critical - blocks other work or has security implications
- P1: High - should be done soon, impacts users
- P2: Medium - normal backlog priority
- P3: Low - nice to have
- P4: Backlog - someday/maybe

**Optional but Recommended Fields:**
- **project**: Set to the current project ID (e.g., "jat", "chimaro"). Defaults to current project if omitted.
- **labels**: Comma-separated labels for categorization (e.g., "ui,auth,performance"). Use when the task belongs to a specific area.
- **depends_on**: Array of task IDs that must complete first (e.g., `["jat-abc"]`). Use when:
  - The suggested task requires output from another task
  - Tasks have a natural ordering (create feature, then add tests)
  - You're suggesting multiple related tasks where one builds on another

#### Cross-Agent Intel (crossAgentIntel)

Share knowledge that helps other agents working in the same codebase:
- **files**: Key files you modified (helps avoid conflicts)
- **patterns**: Conventions you followed or established
- **gotchas**: Non-obvious issues you encountered

---

### Example: Full Completion Flow

```bash
# Step 7.5 already ran and set COMPLETION_MODE (review_required or auto_proceed)

# Step 8: Emit structured completion signal
jat-signal complete '{
  "taskId": "chimaro-xyz",
  "agentName": "CalmMeadow",
  "summary": [
    "Created migration for auth_mode column",
    "Added anonymous session handling",
    "Updated session middleware to detect auth mode"
  ],
  "quality": {
    "tests": "passing",
    "build": "warnings",
    "preExisting": "Build warnings pre-existing (unrelated type errors)"
  },
  "humanActions": [
    {
      "title": "Run database migration",
      "description": "Run: npx prisma migrate deploy\nThis adds the auth_mode column to the sessions table."
    },
    {
      "title": "Enable Anonymous Auth",
      "description": "In Supabase dashboard:\n1. Go to Authentication > Providers\n2. Enable Anonymous Sign-ins\n3. Set session duration to 24 hours"
    }
  ],
  "suggestedTasks": [
    {
      "type": "feature",
      "title": "Add auth mode indicator to UI",
      "description": "Show users whether they are in anonymous or authenticated mode. Display upgrade prompt for anon users.",
      "priority": 2,
      "reason": "UX improvement discovered while implementing auth modes",
      "project": "chimaro",
      "labels": "ui,auth,ux"
    },
    {
      "type": "task",
      "title": "Add anon session cleanup job",
      "description": "Cron job to delete anonymous sessions older than 7 days to prevent database bloat.",
      "priority": 3,
      "reason": "Tech debt - anon sessions will accumulate without cleanup",
      "labels": "backend,cron,cleanup",
      "depends_on": ["chimaro-xyz"]
    }
  ],
  "crossAgentIntel": {
    "files": [
      "prisma/migrations/20251208_add_auth_mode.sql",
      "src/lib/server/session.ts",
      "src/hooks.server.ts"
    ],
    "patterns": [
      "Session objects now have authMode: anon | authenticated",
      "Use isAnonymous(session) helper to check auth state"
    ],
    "gotchas": [
      "Supabase anon sessions have different JWT structure - check for aud claim"
    ]
  }
}'
```

Terminal output (full debrief):
```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: chimaro-xyz                                           ║
║  👤 Agent: CalmMeadow                                                     ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📋 WHAT WAS ACCOMPLISHED ────────────────────────────────────────────────┐
│                                                                          │
│  • Created migration for auth_mode column                                │
│  • Added anonymous session handling                                      │
│  • Updated session middleware to detect auth mode                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ ⚡ QUALITY STATUS ───────────────────────────────────────────────────────┐
│                                                                          │
│  Tests: passing                                                          │
│  Build: warnings (pre-existing - unrelated type errors)                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🧑 HUMAN ACTIONS REQUIRED ───────────────────────────────────────────────┐
│  (Manual steps needed to complete this work)                             │
│                                                                          │
│  1. Run database migration                                               │
│     → Run: npx prisma migrate deploy                                     │
│       This adds the auth_mode column to the sessions table.              │
│                                                                          │
│  2. Enable Anonymous Auth                                                │
│     → In Supabase dashboard:                                             │
│       1. Go to Authentication > Providers                                │
│       2. Enable Anonymous Sign-ins                                       │
│       3. Set session duration to 24 hours                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 💡 SUGGESTED FOLLOW-UP TASKS ────────────────────────────────────────────┐
│  (Ideas discovered during this work - use dashboard to create in Beads)  │
│                                                                          │
│  [P2] [feature] Add auth mode indicator to UI                            │
│       Show users whether they are in anonymous or authenticated mode.    │
│       Display upgrade prompt for anon users.                             │
│       Reason: UX improvement discovered while implementing auth modes    │
│                                                                          │
│  [P3] [task] Add anon session cleanup job                                │
│       Cron job to delete anonymous sessions older than 7 days to prevent │
│       database bloat.                                                    │
│       Reason: Tech debt - anon sessions will accumulate without cleanup  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔗 CROSS-AGENT INTEL ────────────────────────────────────────────────────┐
│  (Knowledge to share with other agents working in this codebase)         │
│                                                                          │
│  📁 Files modified:                                                       │
│     • prisma/migrations/20251208_add_auth_mode.sql                       │
│     • src/lib/server/session.ts                                          │
│     • src/hooks.server.ts                                                │
│                                                                          │
│  📐 Patterns to follow:                                                   │
│     • Session objects now have authMode: anon | authenticated            │
│     • Use isAnonymous(session) helper to check auth state                │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • Supabase anon sessions have different JWT structure - check for aud│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

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

### Individual Signal Commands

The individual signal commands can be used separately if needed:

```bash
# Separate signals (prefer jat-signal complete bundle)
jat-signal action '{"title":"...","description":"..."}'
jat-signal tasks '[{"type":"feature","title":"...","priority":2}]'
jat-signal completed '{"taskId":"...","agentName":"...","sessionStats":{...},"finalCommit":"..."}'
```

**Prefer `jat-signal complete '{...}'`** - it bundles everything in one call and provides a better dashboard experience.

### Enhanced Completed Signal

The `completed` signal now includes session statistics and final state information:

```bash
jat-signal completed '{
  "taskId": "jat-abc",
  "agentName": "WisePrairie",
  "summary": ["Implemented OAuth flow", "Added login page"],
  "quality": {
    "tests": "passing",
    "build": "clean"
  },
  "suggestedTasks": [
    {
      "type": "feature",
      "title": "Add Apple Sign-In support",
      "priority": 2
    }
  ],
  "sessionStats": {
    "duration": 45,
    "tokensUsed": 150000,
    "filesModified": 5,
    "linesChanged": 320,
    "commitsCreated": 2
  },
  "finalCommit": "abc123def456",
  "prLink": "https://github.com/org/repo/pull/123"
}'
```

#### Session Stats Fields

| Field | Type | Description |
|-------|------|-------------|
| `duration` | integer | Minutes spent working on the task |
| `tokensUsed` | integer | API tokens consumed during the session |
| `filesModified` | integer | Number of files modified |
| `linesChanged` | integer | Total lines changed (added + removed) |
| `commitsCreated` | integer | Number of commits created |

#### Final State Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `finalCommit` | string | Yes | Git SHA of the final committed state |
| `prLink` | string | No | Pull request URL if one was created |

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

Signal: completed (task: jat-abc, outcome: success)
[JAT-SIGNAL:completed] {"taskId":"jat-abc","outcome":"success"}

╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: jat-abc                                               ║
║  👤 Agent: SwiftMoon (Backfilled)                                         ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📋 WHAT WAS ACCOMPLISHED ────────────────────────────────────────────────┐
│                                                                          │
│  • Fixed jat CLI -p flag for non-interactive sessions                    │
│  • Changed to positional argument for prompt passing                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ ⚡ QUALITY STATUS ───────────────────────────────────────────────────────┐
│                                                                          │
│  Tests: none (no tests configured)                                       │
│  Build: clean                                                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 💡 SUGGESTED FOLLOW-UP TASKS ────────────────────────────────────────────┐
│  (Ideas discovered during this work - use dashboard to create in Beads)  │
│                                                                          │
│  [P3] [task] Add tests for jat CLI argument parsing                      │
│       Cover edge cases: quotes, special characters, multi-word prompts   │
│       Reason: No tests exist for CLI argument handling                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔗 CROSS-AGENT INTEL ────────────────────────────────────────────────────┐
│  (Knowledge to share with other agents working in this codebase)         │
│                                                                          │
│  📁 Files modified:                                                       │
│     • cli/jat                                                            │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • Use positional args, not flags for prompts in Claude Code invocatio│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Session complete. Dashboard shows interactive UI for creating suggested tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

Signal: completed (task: jat-abc, outcome: success)
[JAT-SIGNAL:completed] {"taskId":"jat-abc","outcome":"success"}

╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: jat-abc                                               ║
║  👤 Agent: JustGrove                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📋 WHAT WAS ACCOMPLISHED ────────────────────────────────────────────────┐
│                                                                          │
│  • Added user settings page at /account/settings                         │
│  • Implemented form fields for profile, notifications                    │
│  • Added form validation with error messages                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ ⚡ QUALITY STATUS ───────────────────────────────────────────────────────┐
│                                                                          │
│  Tests: passing (12/12)                                                  │
│  Build: clean                                                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🧑 HUMAN ACTIONS REQUIRED ───────────────────────────────────────────────┐
│  (Manual steps needed to complete this work)                             │
│                                                                          │
│  1. Update navigation menu                                               │
│     → Add link to Settings page in the account dropdown menu             │
│       Location: src/lib/components/NavMenu.svelte, line ~45              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 💡 SUGGESTED FOLLOW-UP TASKS ────────────────────────────────────────────┐
│  (Ideas discovered during this work - use dashboard to create in Beads)  │
│                                                                          │
│  [P2] [feature] Add email notification preferences                       │
│       Allow users to configure which emails they receive                 │
│       Reason: Settings page exists but notification controls are minimal │
│                                                                          │
│  [P3] [task] Add settings page to E2E test suite                         │
│       Cover form submission, validation errors, and success states       │
│       Reason: Currently only unit tests exist for this page              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔗 CROSS-AGENT INTEL ────────────────────────────────────────────────────┐
│  (Knowledge to share with other agents working in this codebase)         │
│                                                                          │
│  📁 Files modified:                                                       │
│     • src/routes/account/settings/+page.svelte                           │
│     • src/routes/account/settings/+page.server.ts                        │
│     • src/lib/api/user.ts                                                │
│                                                                          │
│  📐 Patterns to follow:                                                   │
│     • Use form actions for server-side validation                        │
│     • Use $page.form for progressive enhancement                         │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • API returns nested user.profile object - flatten before form bindin│
│     • Form reset after successful save requires manual invalidation      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 🔄 PATTERN APPLICABILITY ────────────────────────────────────────────────┐
│  (How this work pattern could apply elsewhere in the project)            │
│                                                                          │
│  The form-with-server-validation pattern used here could be applied to:  │
│  • Account deletion flow (src/routes/account/delete)                     │
│  • Team settings page (src/routes/team/settings)                         │
│  • Any other form that needs server-side validation with progressive enha│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Session complete. Dashboard shows interactive UI for creating suggested tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Signals explained:**
- `jat-signal completed '{"taskId":"...","outcome":"success"}'` - Task finished, requires review; dashboard shows COMPLETED state
- `jat-signal auto_proceed '{"taskId":"...","nextTaskId":"...","nextTaskTitle":"..."}'` - Auto-proceed enabled; dashboard spawns next task
- `jat-signal tasks '[...]'` - Follow-up tasks discovered during work

The signal used depends on review rules (see Step 7.5).

---

## Dashboard State Signals

The completion flow uses these signals (captured by PostToolUse hook):

| Signal Command | When to Run | Dashboard Effect |
|----------------|-------------|------------------|
| `jat-signal completing '{...}'` | During each completion step | Shows progress bar and current step |
| `jat-signal completed '{"taskId":"...","outcome":"success"}'` | After `bd close`, when review required | Shows "COMPLETED" state (green), session stays open for review |
| `jat-signal auto_proceed '{"taskId":"...","nextTaskId":"...","nextTaskTitle":"..."}'` | After `bd close`, when auto-proceed enabled | Dashboard spawns next task automatically |
| `jat-signal action '{...}'` | When manual steps are required | Shows prominent action checklist |
| `jat-signal tasks '[...]'` | When follow-up work discovered | Shows "N Suggested Tasks" badge, offers Beads creation |
| `jat-signal complete '{...}'` | After all completion steps | Full completion bundle with summary, suggested tasks, cross-agent intel |

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

**Signal selection is automatic** - Step 7.5 determines which signal to run based on:
1. Per-task override in notes (`[REVIEW_OVERRIDE:...]`)
2. Project review rules (`.beads/review-rules.json`)
3. Safe default: review required (no auto-proceed without explicit configuration)

**Critical timing:**
- Do NOT run completion signals until AFTER all completion steps succeed
- If you signal early, dashboard shows "complete" but task is still open in Beads
- This causes confusion - other agents think task is done when it isn't

**Human action signals:**
- Run BEFORE `jat-signal completed`
- Each action gets its own `jat-signal action` call with valid JSON payload
- Dashboard reads these from signal file to show a checklist of manual steps

**The signals are called in Step 7.5 and Step 8** - follow the implementation and signals are emitted correctly.

---

## Handling CREATE_TASKS Input from Dashboard

**When the dashboard sends `[JAT:CREATE_TASKS]` input, handle it before the completion summary.**

This happens when:
1. Agent runs `jat-signal tasks` with follow-up tasks
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

The CREATE_TASKS handling should happen **after showing the completion summary** but **before running `jat-signal idle`**:

1. Steps 1-7 run normally (verify, commit, close, release, announce)
2. Show completion summary box (Step 8)
3. **Wait for potential CREATE_TASKS input from dashboard**
   - If user sends CREATE_TASKS → parse and create tasks → confirm
   - If user sends nothing / closes terminal → proceed to IDLE
4. Run `jat-signal idle`

This allows the dashboard to:
1. Read suggested tasks from signal file (`jat-signal tasks`)
2. Show the SuggestedTasksPanel UI to user
3. User selects and clicks "Create Selected Tasks"
4. Dashboard sends CREATE_TASKS to still-running agent
5. Agent creates tasks and confirms

**Note:** The agent session should remain open briefly after showing completion summary to allow this interaction. The `jat-signal idle` call signals the session can be closed.

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
| 8 | Show Final Summary with Reflection | ALWAYS | (100% implied) |
| 9 | Handle CREATE_TASKS Input | If dashboard sends task creation request | - |

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
