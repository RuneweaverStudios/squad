---
---

Complete current task properly with full verification. Session ends after completion.

# Agent Complete - Finish Task Properly

**Usage:**
- `/squad:complete` - Complete current task and show completion block for review
- `/squad:complete --kill` - Complete task and auto-kill session (self-destruct, no review)

**Flags:**
- `--kill` - IDE will auto-kill the session after completion (no review needed)

**What this command does:**
1. **Full Completion Protocol**:
   - Verify task (tests, lint, security, browser checks)
   - Commit changes with proper message
2. **Write Memory Entry** - Save context for future agents
3. **Task Management**:
   - Mark task as complete (`st close`)
   - Release file reservations
4. **End Session** - Session is complete, user spawns new agent for next task

**When to use:**
- After you display "🔍 READY FOR REVIEW" and user approves
- Task is complete and ready to close

**When NOT to use:**
- Need to pivot quickly → use `/squad:pause` instead

**PREREQUISITE: Emit the `review` signal BEFORE calling /squad:complete**

Before this command is triggered, you must have emitted a `review` signal to enter "ready-for-review" state:

```bash
squad-signal review '{
  "taskId": "squad-abc",
  "taskTitle": "Your task title",
  "summary": ["What you accomplished", "Key changes made"],
  "filesModified": [
    {"path": "src/file.ts", "changeType": "modified", "linesAdded": 50, "linesRemoved": 10}
  ]
}'
```

Then display the review banner and wait for user approval:
```
┌────────────────────────────────────────────────────────┐
│  🔍 READY FOR REVIEW: {TASK_ID}                        │
└────────────────────────────────────────────────────────┘

📋 Summary:
  • [accomplishment 1]
  • [accomplishment 2]

Run /squad:complete when ready to close this task.
```

**How the IDE triggers this command:**

When the agent enters "ready-for-review" state (via the `review` signal), the IDE checks review rules:

| Review Rules Result | IDE Action |
|---------------------|------------------|
| **AUTO** (e.g., P4 chore) | IDE auto-triggers `/squad:complete --kill` |
| **REVIEW** (e.g., P1 bug) | User reviews, then clicks "Complete" or "Complete & Kill" |

- **"Complete"** → IDE sends `/squad:complete` (session stays for review)
- **"Complete & Kill"** → IDE sends `/squad:complete --kill` (session self-destructs)
- **Auto-complete** → IDE sends `/squad:complete --kill` (no user interaction)

---

## CRITICAL: "Ready for Review" vs "Complete"

**These are two different states. Never confuse them.**

| State | Meaning | Display | Task Status |
|-------|---------|---------|--------------|
| **Ready for Review** | Code work done, awaiting user decision | "🔍 READY FOR REVIEW" | `in_progress` |
| **Complete** | Closed, reservations released | "✅ TASK COMPLETE" | `closed` |

**NEVER say "Task Complete" until AFTER:**
1. Changes committed
2. `st close` has run successfully
3. Reservations released

**The typical flow:**
1. You finish coding → display "🔍 READY FOR REVIEW"
2. User reviews and runs `/squad:complete`
3. You run completion steps (commit, close, release, announce)
4. THEN display "✅ TASK COMPLETE"

**Why this matters:**
- Other agents check the task queue to see if tasks are available
- If you say "complete" but haven't run `st close`, another agent will see the task as still in-progress
- This causes confusion and coordination problems

---

## Bash Syntax Patterns for Claude Code

**CRITICAL:** Claude Code's Bash tool escapes command substitution syntax. You MUST use these patterns:

### CORRECT Patterns

**Pattern 1: Use Read/Write tools (RECOMMENDED)**
```bash
# Step 1: Get value
get-current-session-id
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
SESSION_ID=$(get-current-session-id)
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
get-current-session-id
# → Extract session_id value
```

#### 1B: Get Agent Name
```bash
# Read .claude/agent-{session_id}.txt
# → Extract agent_name
```

#### 1C: Get Current Task
```bash
# Get task (in_progress tasks for this agent)
st list --json | jq -r --arg agent "$agent_name" \
  '.[] | select(.assignee == $agent and .status == "in_progress") | .id' | head -1
```

**Error handling:**
- If no session ID found → error "No active session. Run /squad:start first"
- If no agent name found → error "No agent registered. Run /squad:start first"
- If no in_progress task → **continue to Step 1D** (spontaneous work detection)

---

### STEP 1D: Spontaneous Work Detection (If No Task Found)

**Only execute if Step 1C found no `in_progress` task.**

This step detects ad-hoc work done without a formal task and offers to create a backfilled task record for proper attribution and audit trail.

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
- **Title**: Verb + noun describing the work (e.g., "Fix squad CLI -p flag causing non-interactive sessions")
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
st create "[title]" \
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
  • /squad:start - Pick up a new task
  • st create "..." - Manually create a task
  • Just commit your changes directly with git
```

**Exit the /squad:complete flow** - do not continue to Step 2.

#### If No Work Detected

```
No task in progress and no spontaneous work detected.

Options:
  • /squad:start - Pick a task to work on
  • st list - View available tasks
```

**Exit the /squad:complete flow** - do not continue to Step 2.

---

#### Real Example: Spontaneous Bug Fix

**Conversation signals detected:**
```
User: "squad squad 4 crashed all terminals"
Agent: "I see the issue... The -p flag makes Claude non-interactive..."
Agent: "Let me update the squad script..."
Agent: "Now try running squad squad 4 again"
```

**Git state:**
```
M cli/squad
```

**Proposed backfill:**
```
Title: Fix squad CLI -p flag causing non-interactive sessions
Type: bug
Description: The -p flag was causing Claude Code to run in print mode
             (non-interactive), exiting immediately after processing.
             Removed -p and pass prompt as positional argument instead.
Files: cli/squad
```

---

### STEP 2: Verify Task

```bash
squad-step verifying --task "$task_id" --title "$task_title" --agent "$agent_name"


# Run verification checks:
# - Tests
# - Lint
# - Security scan
# - Browser checks (if applicable)

# If verification fails, STOP and report issues
# Do NOT continue to completion
```

---

### STEP 2.5: Update Documentation (If Appropriate)

**Most tasks do NOT require doc updates.** Only update docs when you've made changes that affect how others use the codebase.

#### When to Update Docs

| Update Docs | Skip Docs |
|-------------|-----------|
| New tool/command added | Bug fixes |
| New API endpoint or parameter | Internal refactors |
| Breaking change to existing behavior | Performance improvements |
| New configuration option | Code cleanup |
| New pattern others must follow | Adding tests |
| Removed/deprecated feature | UI tweaks |

#### Where to Check

1. **CLAUDE.md** - Project instructions for agents
2. **docs/** folder - If one exists
3. **README.md** - Only for user-facing changes

#### How to Update (Minimal Approach)

**DO:**
- Update existing sections (add a row to a table, a bullet to a list)
- One-liners preferred over paragraphs
- Keep it factual: "Added `--emit` flag to squad-complete-bundle"

**DON'T:**
- Add new sections for small changes
- Write verbose explanations
- Document implementation details (code is self-documenting)
- Add changelog entries or "as of version X" notes
- Duplicate what's already in code comments

#### Example: Good vs Bad

**Good (minimal, updates existing):**
```markdown
| `--emit` | Automatically emit signal (recommended) |
```

**Bad (verbose, adds new section):**
```markdown
## New Feature: Automatic Signal Emission

In version 2.0, we added a new `--emit` flag to the squad-complete-bundle
command. This flag allows you to automatically emit the completion signal
without having to manually call squad-signal. This was added because...
[50 more lines]
```

#### Decision Flow

```
Did you add/change/remove something that affects usage?
  ├─ No → Skip this step
  └─ Yes → Can you update an existing section with 1-3 lines?
        ├─ Yes → Make the minimal update
        └─ No → Ask yourself: is this really necessary?
              ├─ Yes → Add minimal new content
              └─ No → Skip, let docs evolve organically
```

**When in doubt, skip.** Docs can always be updated later. Over-documentation is worse than under-documentation.

---

### STEP 2.6: Update Changelog (If Notable)

**Most tasks do NOT need changelog entries.** Only add entries for changes users/stakeholders would care about.

#### When to Add Entry

| Add Entry | Skip Entry |
|-----------|------------|
| New user-facing feature | Internal refactors |
| Bug fix users would notice | Test additions |
| API endpoint added/changed | Code cleanup |
| Breaking change | CI/CD changes |
| Security fix | Documentation updates |
| Performance improvement users feel | Dependency bumps (minor) |

#### How to Add

1. Check if `CHANGELOG.md` exists - if not, skip
2. Find the `## [Unreleased]` section
3. Add one-liner under appropriate category: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`

**Format:** One line, starts with verb, includes component context if helpful

```markdown
### Added
- Add minimap navigation to TmuxTerminal for quick scrolling

### Fixed
- Fix file upload failing when quote record doesn't exist

### Changed
- Project status endpoint now validates against allowed values
```

#### Decision Flow

```
Is this change visible to users/stakeholders?
  ├─ No → Skip
  └─ Yes → Which category?
        ├─ New capability → Added
        ├─ Behavior change → Changed
        ├─ Bug fix → Fixed
        ├─ Security issue → Security
        └─ Going away → Deprecated/Removed
```

**When in doubt, skip.** Changelogs aggregate at release time anyway.

---

### STEP 3: Commit Changes

```bash
# Get task type for commit message
task_type=$(st show "$task_id" --json | jq -r '.[0].issue_type // "task"')

# Emit signal + commit changes (skips if no changes)
squad-step committing --task "$task_id" --title "$task_title" --agent "$agent_name" --type "$task_type"
```

---

### STEP 3.5: Write Memory Entry

**Save context from this session for future agents.**

Generate a memory file capturing the key learnings from this task.

#### 4.5A: Generate Memory Content

Synthesize a memory entry from:
- Task description and title
- Approach taken (from your working signal)
- Files modified (from git diff)
- Key decisions made during the session
- Lessons learned and gotchas discovered

#### 4.5B: Write the Memory File

```bash
# File naming: {date}-{taskId}-{slug}.md
# Slug: lowercase task title, non-alphanumeric → hyphens, max 50 chars
# Example: .squad/memory/2026-02-11-squad-abc-fix-oauth-timeout.md
```

Use the Write tool to create the file at `.squad/memory/{date}-{taskId}-{slug}.md` following this format:

```markdown
---
task: {taskId}
agent: {agentName}
project: {projectName}
completed: {ISO timestamp}
files:
  - {modified file paths from git diff}
tags:
  - {semantic tags derived from content}
labels:
  - {task labels from SQUAD}
priority: {task priority}
type: {task type}
---

## Summary

- {What was accomplished, bullet points}

## Approach

{How the work was done, 2-3 sentences}

## Decisions

- {Key decisions and rationale}

## Key Files

- `{path}:{line}` - {what this file does}

## Lessons

- {Non-obvious learnings for future agents}
```

Only include sections that have meaningful content. Skip `## Decisions` or `## Lessons` if nothing notable.

#### 4.5C: Update Memory Index

```bash
squad-memory index --project "$(pwd)"
```

This incrementally indexes the new file. If no memory index exists yet, it creates one.

**If squad-memory index fails**, log the error but continue with completion. Memory is non-blocking.

---

### STEP 4: Mark Task Complete

```bash
# Emit signal + close task
squad-step closing --task "$task_id" --title "$task_title" --agent "$agent_name"
```

---

### STEP 4.5: Auto-Close Eligible Epics

**After closing a task, check if any parent epics are now fully complete.**

This ensures epics don't linger in "open" status when all children are done.

```bash
# Auto-close epics where all children are complete
st epic close-eligible

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

### STEP 5: Release File Reservations

```bash
# Emit signal + release all reservations for this agent
squad-step releasing --task "$task_id" --title "$task_title" --agent "$agent_name"
```

---

### STEP 6: Generate Completion Bundle and Emit Signal

```bash
# Generate completion bundle via LLM and emit the complete signal
# Review mode is auto-detected from task notes, session context, and project rules
squad-step complete --task "$task_id" --title "$task_title" --agent "$agent_name"
```

**What this does:**
1. Fetches task details
2. Collects git status, diff stats, recent commits
3. Auto-detects completion mode (review_required or auto_proceed) from:
   - Task notes: `[REVIEW_OVERRIDE:auto_proceed]` or `[REVIEW_OVERRIDE:always_review]`
   - Session epic context: `.claude/sessions/context-{session_id}.json`
   - Project rules: `.squad/review-rules.json`
   - Default: `review_required` (safe fallback)
4. Calls LLM to generate structured completion bundle
5. Emits `complete` signal (100%) to IDE

**After the signal emits, output a terminal debrief:**

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: $task_id                                              ║
║  👤 Agent: $agent_name                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

[Display summary, quality status, human actions, suggested tasks from the bundle]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Session complete. IDE shows interactive UI for creating suggested tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Prerequisites:**
- `ANTHROPIC_API_KEY` environment variable must be set
- Task must exist in the task database

**If it fails:**
- Check `ANTHROPIC_API_KEY` is set
- Check task ID is valid with `st show $task_id`
- Check network connectivity

<details>
<summary>📋 Review Mode Auto-Detection Details (Reference)</summary>

The completion mode determines whether to auto-spawn the next task (Epic Swarm mode). This is handled automatically by `squad-complete-bundle --auto-mode`.

1. Check task notes for `[REVIEW_OVERRIDE:auto_proceed]` or `[REVIEW_OVERRIDE:always_review]`
2. Check session epic context: `.claude/sessions/context-{session_id}.json` with `reviewThreshold`
3. Check project rules: `.squad/review-rules.json`
4. Default: `review_required` (safe fallback)

</details>

---

### What the IDE Does

When it receives the `complete` signal:

1. **Human Actions Panel** - Shows checklist with checkboxes
   - User can check off actions as they complete them
   - Uncompleted actions show warning indicator

2. **Suggested Tasks Panel** - Shows task cards
   - Each task has "Create Task" button
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

---

## Output Examples

The completion output is generated by `squad-complete-bundle`. A typical flow looks like:

```
🔍 Verifying task...
   ✅ Tests passed
   ✅ Build clean

💾 Committing changes...
   ✅ Committed: "feat: Add user settings page"

✅ Marking task complete...
   ✅ Closed squad-abc

╔═══════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: squad-abc                                   ║
║  👤 Agent: JustGrove                                          ║
╚═══════════════════════════════════════════════════════════════╝

[Summary, quality status, suggested tasks, cross-agent intel from bundle]
```

---

## IDE State Signals

The completion flow emits **progress signals** at each step, followed by a final **completion bundle**:

| Tool | Signal Emitted | IDE Effect |
|------|----------------|------------------|
| `squad-step verifying\|committing\|closing\|releasing` | `completing` | Shows progress bar with current step |
| `squad-complete-bundle --emit` | `complete` | Full completion bundle with summary, suggested tasks |

**Signals are emitted automatically by the tools.** You don't need to manually call `squad-signal`. The final **complete signal** includes:
- `completionMode: "review_required"` → IDE shows COMPLETED state, session stays open for review
- `completionMode: "auto_proceed"` with `nextTaskId` → IDE spawns next task (Epic Swarm)

**Completion mode is determined automatically** based on:
1. Per-task override in notes (`[REVIEW_OVERRIDE:...]`)
2. Project review rules (`.squad/review-rules.json`)
3. Safe default: review required (no auto-proceed without explicit configuration)

**Critical timing:**
- Do NOT run `squad-signal complete` until AFTER all completion steps succeed
- If you signal early, IDE shows "complete" but task is still open
- This causes confusion - other agents think task is done when it isn't

**Human actions:**
- Include in the `humanActions` array within the `squad-signal complete` bundle
- IDE renders these as an interactive checklist for manual steps

---

## Error Handling

**No active session:**
```
No active session detected.
Run /squad:start to begin working
```

**No task in progress (with spontaneous work):**
```
🔍 SPONTANEOUS WORK DETECTED
[Proposal displayed, user confirms]
✓ Created backfill task: squad-xyz
[Continues to normal completion flow]
```

**No task in progress (no work detected):**
```
No task in progress and no spontaneous work detected.
Run /squad:start to pick a task
```

**Verification failed:**
```
Task verification failed:
   • 2 tests failing
   • 5 lint errors

Fix issues and try again
Or run /squad:verify to see detailed error report
```

---

## Step Summary

| Step | Name | Tool |
|------|------|------|
| 1A-C | Get Task and Agent Identity | - |
| 1D | Spontaneous Work Detection | - |
| 2 | Verify Task | `squad-step verifying` (0%) |
| 2.5 | Update Documentation | *(if appropriate - most tasks skip)* |
| 2.6 | Update Changelog | *(if notable - most tasks skip)* |
| 3 | Commit Changes | `squad-step committing` (25%) |
| **3.5** | **Write Memory Entry** | **Write tool + `squad-memory index`** |
| 4 | Mark Task Complete | `squad-step closing` (50%) |
| 4.5 | Auto-Close Eligible Epics | `st epic close-eligible` |
| 5 | Release Reservations | `squad-step releasing` (75%) |
| **6** | **Generate & Emit Completion** | **`squad-step complete`** (100%) |

**Note:** `squad-step` automatically emits signals. Steps 2-5 emit `completing` signals with progress. Step 6 (`squad-step complete`) auto-detects review mode and emits the final `complete` signal.

---

## Key Design Principles

1. **Full verification required**
   - No quick mode for this command
   - Quality over speed

2. **One agent = one session = one task**
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
│  squad-abc (Epic): "Improve IDE"                                    │
│    └─ DEPENDS ON (blocked by):                                          │
│         → squad-abc.1: "Add caching" [READY - can start immediately]      │
│         → squad-abc.2: "Optimize queries" [READY - can start immediately] │
│         → squad-abc.3: "Add tests" [READY - can start immediately]        │
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
│  squad-abc (Epic): "Improve IDE"                                    │
│    └─ BLOCKS:                                                           │
│         ← squad-abc.1: "Add caching" [BLOCKED - waiting on epic!]         │
│         ← squad-abc.2: "Optimize queries" [BLOCKED]                       │
│         ← squad-abc.3: "Add tests" [BLOCKED]                              │
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
st create "Improve IDE Performance" \
  --type epic \
  --description "Parent epic for performance improvements. This task becomes verification/UAT once all children complete." \
  --priority 1
# → Creates: squad-abc
```

**Step 2: Create child tasks**
```bash
# Create children as separate tasks
st create "Add caching layer" --type task --priority 2
# → Creates: squad-def

st create "Optimize database queries" --type task --priority 2
# → Creates: squad-ghi

st create "Add performance tests" --type task --priority 3
# → Creates: squad-jkl
```

**Step 3: Set up dependencies (epic depends on children)**
```bash
# Epic is blocked by each child (NOT children blocked by epic!)
st dep add squad-abc squad-def   # Epic depends on child 1
st dep add squad-abc squad-ghi   # Epic depends on child 2
st dep add squad-abc squad-jkl   # Epic depends on child 3
```

**Result:**
- `squad-abc` (epic) shows as BLOCKED until all children complete
- Children (`squad-def`, `squad-ghi`, `squad-jkl`) show as READY
- Agents can pick up children immediately
- When all children complete, epic becomes READY for verification

### Fixing Incorrectly Created Epics

If you have an epic with wrong dependency direction:

```bash
# Check current state
st show squad-abc
# If it shows "Blocks: ← squad-abc.1, ← squad-abc.2" - it's WRONG

# Fix by removing and re-adding dependencies
st dep remove squad-abc.1 squad-abc    # Remove child → parent dep
st dep remove squad-abc.2 squad-abc
st dep remove squad-abc.3 squad-abc

st dep add squad-abc squad-abc.1       # Add parent → child dep (correct)
st dep add squad-abc squad-abc.2
st dep add squad-abc squad-abc.3

# Verify fix
st show squad-abc
# Should now show "Depends on: → squad-abc.1, → squad-abc.2, → squad-abc.3"
```

---

## Completing an Epic (Verification/UAT Workflow)

**When all children are done, the epic becomes a verification task.**

When you pick up an epic that has become READY (all children completed), your job is:

1. **Verify all children are actually complete**
   - Check each child task is closed
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
   - If verification passes: run `/squad:complete`
   - If issues found: create follow-up tasks, document issues

### Epic Completion Output Template

When completing an epic, use this modified summary with full debrief sections:

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ EPIC VERIFIED: squad-abc "Improve IDE Performance"                ║
║  👤 Agent: $agent_name                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📦 CHILD TASKS COMPLETED ────────────────────────────────────────────────┐
│                                                                          │
│  ✓ squad-abc.1: Add caching layer (by CalmMeadow)                          │
│  ✓ squad-abc.2: Optimize database queries (by SwiftMoon)                   │
│  ✓ squad-abc.3: Add performance tests (by JustGrove)                       │
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
│     → From squad-abc.1: Run cache warmup script after deploy               │
│                                                                          │
│  2. Update monitoring dashboards                                         │
│     → From squad-abc.3: Add P99 latency alerts for new endpoints           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ 📊 EPIC IMPACT ──────────────────────────────────────────────────────────┐
│                                                                          │
│  • IDE load time reduced by 75%                                    │
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
│     • src/lib/cache/redis.ts (squad-abc.1)                                 │
│     • src/lib/db/queries.ts (squad-abc.2)                                  │
│     • tests/integration/performance.test.ts (squad-abc.3)                  │
│                                                                          │
│  📐 Patterns established:                                                 │
│     • Use Redis client from $lib/cache for all caching                   │
│     • Performance tests should use P99 not average latency               │
│                                                                          │
│  ⚠️ Gotchas:                                                             │
│     • Cache TTL must match session duration (from squad-abc.1)             │
│     • Query planner hints needed for complex joins (from squad-abc.2)      │
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
remaining=$(st show "$parent_id" --json | jq -r '.[] | select(.status != "closed") | .id' | grep -v "$parent_id")

if [[ -z "$remaining" ]]; then
  echo "🎉 This was the last child! Parent epic squad-abc is now READY for verification."
fi
```

**Step 3: Include epic status in completion summary:**

When completing a child task that belongs to an epic, add an "EPIC STATUS" section after the header:

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ TASK COMPLETED: squad-abc.3 "Add performance tests"                     ║
║  👤 Agent: JustGrove                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ 📦 EPIC STATUS ──────────────────────────────────────────────────────────┐
│                                                                          │
│  Parent: squad-abc "Improve IDE Performance"                         │
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
