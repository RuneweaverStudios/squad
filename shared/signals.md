## JAT Signal System

**Hook-based agent-to-IDE communication for real-time state tracking.**

Agents emit signals via `jat-signal` command, PostToolUse hooks capture them, and the IDE receives real-time updates via SSE.

### Why Signals?

**Benefits:**
- Reliable delivery (hooks fire on every Bash command)
- Structured data (JSON payloads)
- Real-time SSE events to IDE
- Extensible (states, tasks, actions, custom data)
- No terminal parsing - direct hook capture

### Signal TTL Behavior

Signal files expire after a time-to-live (TTL) to prevent stale data. Different signal types use different TTLs based on whether they wait for human action.

**Configuration:** `ide/src/lib/config/constants.ts` → `SIGNAL_TTL`

| TTL Type | Duration | States | Purpose |
|----------|----------|--------|---------|
| **Transient** | 1 minute | `working`, `starting`, `idle`, `compacting` | Agent is actively working, frequent updates expected |
| **User-Waiting** | 30 minutes | `completed`, `review`, `needs_input` | Waiting for human action - user may step away |

**Why this matters:**
- If you emit a `review` signal and the user takes a coffee break, the signal persists for 30 minutes
- Transient states like `working` expire quickly so stale signals don't show incorrect state
- Without the longer TTL, the IDE falls back to output parsing which can misinterpret state

**Example:** Agent emits `review`, user is away for 10 minutes → IDE still shows "🔍 REVIEW" (not stale fallback state)

### Signal Format

All signals require JSON payloads:

```bash
jat-signal <type> '<json-payload>'
```

Output format: `[JAT-SIGNAL:<type>] <json-payload>`

### Signal Types

**State Signals** - Agent lifecycle states (all require JSON):

| Signal | Command | Required Fields |
|--------|---------|-----------------|
| `starting` | `jat-signal starting '{...}'` | agentName (optional: sessionId, taskId, taskTitle, project) |
| `working` | `jat-signal working '{...}'` | taskId, taskTitle |
| `compacting` | `jat-signal compacting '{...}'` | reason, contextSizeBefore |
| `review` | `jat-signal review '{...}'` | taskId |
| `needs_input` | `jat-signal needs_input '{...}'` | taskId, question, questionType |
| `idle` | `jat-signal idle '{...}'` | readyForWork |
| `question` | `jat-signal question '{...}'` | question, questionType (optional: options, timeout) |
| `completing` | `jat-signal completing '{...}'` | taskId, taskTitle, currentStep, stepsCompleted, stepsRemaining, progress, stepDescription, stepStartedAt |

**IDE Signals** - Events written by the IDE (not agents):

| Signal | Source | Purpose |
|--------|--------|---------|
| `ide_input` | `/api/sessions/[name]/input` | Tracks input sent from IDE UI to an agent session |
| `user_input` | `UserPromptSubmit` hook | Tracks user text entered in Claude Code terminal |

**`ide_input` signal** - Written when IDE sends input to a tmux session:

The IDE writes this signal directly to the timeline file when a user sends input via the SessionCard UI. This ensures IDE-initiated inputs appear in EventStack even if Claude Code's `UserPromptSubmit` hook fails to capture them.

**When it's written:**
- User types text in SessionCard input field and hits Enter
- User sends a slash command (e.g., `/jat:complete`)
- IDE automation sends input programmatically

**Signal format (written to timeline JSONL):**
```json
{
  "type": "ide_input",
  "tmux_session": "jat-AgentName",
  "timestamp": "2025-12-30T10:00:00.000Z",
  "data": {
    "input": "/jat:complete",
    "inputType": "command",
    "isCommand": true,
    "source": "ide"
  }
}
```

**Data fields:**
| Field | Type | Description |
|-------|------|-------------|
| `input` | string | The text/command sent to the session |
| `inputType` | enum | `"text"` (regular input), `"command"` (slash command), `"key"` (special key) |
| `isCommand` | boolean | `true` if input starts with `/` |
| `source` | string | Always `"ide"` (distinguishes from terminal input) |

**Where it's written:**
- File: `/tmp/jat-timeline-{tmuxSession}.jsonl`
- Writer: `ide/src/routes/api/sessions/[name]/input/+server.js`

**EventStack display:**
- Shows as purple `💬 USER INPUT` card in timeline
- Collapsed view shows truncated input text (first 60 chars)
- Click-to-copy the full input text

**Completion Signal** - A single signal is emitted at the end of `/jat:complete`:

| Signal | Command | Purpose |
|--------|---------|---------|
| `complete` | `jat-signal complete '{...}'` | **Final bundle** - emitted ONCE at the end. Sets state to "completed" AND provides rich data (summary, quality, suggestedTasks, humanActions). |

### complete Signal

**`complete` signal** - Emitted once after all completion steps:
- Triggers IDE to show "COMPLETED" state
- Contains the full CompletionBundle with summary, quality, suggested tasks
- Determines what happens next (review_required vs auto_proceed)

```
┌─────────────────────────────────────────────────────────────────────┐
│  /jat:complete workflow                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 2: Verify task (tests, lint, security)                        │
│       ↓                                                             │
│  Step 3: Commit changes                                             │
│       ↓                                                             │
│  Step 4: Close task in JAT Tasks (jt close)                         │
│       ↓                                                             │
│  Step 5: Release file reservations                                  │
│       ↓                                                             │
│  Step 6: jat-signal complete '{"completionMode":"..."}'       100% │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**IDE behavior:**
| Signal | IDE State | IDE Display |
|--------|-----------------|-------------------|
| `completing` | ⏳ COMPLETING | Progress bar with current step |
| `complete` | ✅ COMPLETED | Completion summary, quality badges, suggested tasks |

> **Note:** The `completing` signal is emitted at each step during `/jat:complete` to show progress (verifying → committing → closing → releasing → announcing). The final `complete` signal is emitted once all steps finish.

### Signal Schemas (Full Field Reference)

**`working` signal fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| taskId | **Yes** | string | Task ID (e.g., "jat-abc") |
| taskTitle | **Yes** | string | Human-readable title |
| taskDescription | No | string | Full description from JAT Tasks |
| taskPriority | No | number | 0-4 |
| taskType | No | string | feature/bug/task/chore/epic |
| approach | No | string | How you'll implement this |
| expectedFiles | No | string[] | Files you expect to modify |
| estimatedScope | No | enum | "small" / "medium" / "large" |
| baselineCommit | No | string | Git SHA for rollback |
| baselineBranch | No | string | Current branch |
| dependencies | No | string[] | Blocking task IDs |

**`review` signal fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| taskId | **Yes** | string | Task ID |
| taskTitle | No | string | Task title |
| summary | Recommended | string[] | Bullet points of accomplishments |
| approach | No | string | How it was implemented |
| filesModified | Recommended | object[] | `{path, changeType, linesAdded, linesRemoved}` |
| totalLinesAdded | No | number | Total lines added |
| totalLinesRemoved | No | number | Total lines removed |
| keyDecisions | No | object[] | `{decision, rationale}` |
| testsStatus | Recommended | enum | "passing" / "failing" / "none" / "skipped" |
| buildStatus | Recommended | enum | "clean" / "warnings" / "errors" |
| reviewFocus | Recommended | string[] | Areas reviewer should check |
| knownLimitations | No | string[] | Edge cases not handled |
| commits | No | object[] | `{sha, message}` |

**`needs_input` signal fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| taskId | **Yes** | string | Task ID |
| question | **Yes** | string | The question to ask |
| questionType | **Yes** | enum | "choice" / "text" / "approval" / "confirm" |
| taskTitle | No | string | Task title for context |
| context | No | string | Why this question arose |
| options | No | object[] | `{label, value, description}` for choice questions |
| impact | No | string | What depends on this answer |
| timeout | No | number | Seconds before timing out |

**`completing` signal fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| taskId | **Yes** | string | Task ID being completed |
| taskTitle | **Yes** | string | Task title |
| currentStep | **Yes** | enum | `"verifying"` / `"committing"` / `"closing"` / `"releasing"` / `"announcing"` |
| stepsCompleted | **Yes** | string[] | Steps that have been completed |
| stepsRemaining | **Yes** | string[] | Steps remaining to be done |
| progress | **Yes** | number | Overall progress percentage (0-100) |
| stepDescription | **Yes** | string | Human-readable description of current step |
| stepStartedAt | **Yes** | string | ISO timestamp when current step started |

**`complete` signal fields (RECOMMENDED):**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| taskId | **Yes** | string | Task ID |
| agentName | **Yes** | string | Agent name |
| summary | **Yes** | string[] | Array of accomplishment bullet points |
| quality | **Yes** | object | `{ tests: "passing"/"failing"/"none", build: "clean"/"warnings"/"errors" }` |
| completionMode | **Yes** | string | `"review_required"` or `"auto_proceed"` |
| suggestedTasks | **Yes** | object[] | Follow-up tasks (always include at least one) |
| humanActions | No | object[] | Manual steps for user |
| crossAgentIntel | No | object | `{ files?, patterns?, gotchas? }` for other agents |
| nextTaskId | No | string | Task ID to spawn next (if auto_proceed) |
| nextTaskTitle | No | string | Title of next task (for display) |

### Usage Examples

**State Signals:**
```bash
# Session starting up (basic)
jat-signal starting '{"agentName":"FairBay","project":"chimaro","model":"sonnet-4"}'

# Session starting up (with task and session ID)
jat-signal starting '{"agentName":"FairBay","project":"chimaro","sessionId":"4a5001aa-04eb-47f6-a4da-75048baf4c79","taskId":"jat-abc","taskTitle":"Add auth flow"}'

# Starting work on a task
jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth flow"}'

# Context compacting (auto-summarization)
jat-signal compacting '{"reason":"context_limit","contextSizeBefore":180000}'

# Waiting for user input
jat-signal needs_input '{"taskId":"jat-abc","question":"Which auth library?","questionType":"choice"}'

# Structured question for IDE (standalone, not tied to a task)
jat-signal question '{"question":"Which authentication method?","questionType":"choice","options":[{"label":"OAuth 2.0","value":"oauth","description":"Industry standard"},{"label":"JWT","value":"jwt","description":"Stateless tokens"}]}'

# Confirm question (yes/no)
jat-signal question '{"question":"Proceed with database migration?","questionType":"confirm"}'

# Input question with timeout
jat-signal question '{"question":"Enter component name:","questionType":"input","timeout":120}'

# Ready for review (rich payload with file stats, quality status, review guidance)
jat-signal review '{
  "taskId":"jat-abc",
  "taskTitle":"Add user auth",
  "summary":["Added login page","Implemented OAuth"],
  "filesModified":[
    {"path":"src/lib/auth.ts","changeType":"added","linesAdded":150,"linesRemoved":0},
    {"path":"src/routes/login/+page.svelte","changeType":"added","linesAdded":80,"linesRemoved":0}
  ],
  "totalLinesAdded":230,
  "totalLinesRemoved":0,
  "testsStatus":"passing",
  "buildStatus":"clean",
  "reviewFocus":["Check token refresh logic","Verify error handling"]
}'

# Session idle
jat-signal idle '{"readyForWork":true}'
```

**Task Completion (RECOMMENDED - use `complete` for rich data):**
```bash
# Standard completion - requires human review
jat-signal complete '{
  "taskId": "jat-abc",
  "agentName": "WisePrairie",
  "completionMode": "review_required",
  "summary": ["Fixed OAuth flow", "Added retry logic"],
  "quality": {"tests": "passing", "build": "clean"},
  "suggestedTasks": [{"type": "task", "title": "Add tests", "description": "...", "priority": 2}]
}'

# Auto-proceed completion - IDE spawns next task automatically
jat-signal complete '{
  "taskId": "jat-abc",
  "agentName": "WisePrairie",
  "completionMode": "auto_proceed",
  "nextTaskId": "jat-def",
  "nextTaskTitle": "Implement OAuth flow",
  "summary": ["Fixed authentication"],
  "quality": {"tests": "passing", "build": "clean"},
  "suggestedTasks": [{"type": "task", "title": "Add tests", "description": "...", "priority": 2}]
}'
```

### How It Works

```
1. Agent runs jat-signal command
   └─► jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth"}'

2. Command outputs marker line
   └─► [JAT-SIGNAL:working] {"taskId":"jat-abc","taskTitle":"Add auth"}

3. PostToolUse hook fires (post-bash-jat-signal.sh)
   └─► Parses output, extracts signal type and JSON payload
   └─► Writes JSON to /tmp/jat-signal-{session}.json
   └─► Also writes /tmp/jat-signal-tmux-{sessionName}.json

4. IDE SSE server watches signal files
   └─► /api/sessions/events endpoint
   └─► Broadcasts session-signal event to all clients

5. IDE UI updates in real-time
   └─► SessionCard shows current state
   └─► Suggested tasks appear in UI
```

### Hook Architecture

**PostToolUse Hook:** `.claude/hooks/post-bash-jat-signal.sh`

The hook is triggered after every Bash tool call. It:
1. Checks if command was `jat-signal *`
2. Extracts `session_id` from hook input JSON
3. Parses `[JAT-SIGNAL:<type>]` marker and JSON payload from output
4. Reads project paths from `~/.config/jat/projects.json` and searches each project's `.claude/sessions/` for `agent-{session_id}.txt`
5. Writes structured JSON to `/tmp/jat-signal-{session}.json` and `/tmp/jat-signal-tmux-{tmuxSession}.json`
6. Appends to timeline JSONL at `/tmp/jat-timeline-{tmuxSession}.jsonl`

**Note:** Projects must be registered in `~/.config/jat/projects.json` for signals to work. Add new projects with their path to enable signal tracking.

**Hook Configuration:** `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-bash-jat-signal.sh"
          }
        ]
      }
    ]
  }
}
```

**Signal File Format:**

```json
{
  "type": "working",
  "session_id": "abc123-def456",
  "tmux_session": "jat-FairBay",
  "timestamp": "2025-12-08T15:30:00Z",
  "task_id": "jat-abc",
  "data": {
    "taskId": "jat-abc",
    "taskTitle": "Add auth flow"
  }
}
```

### IDE Integration

**SSE Endpoint:** `/api/sessions/events`

Broadcasts real-time events to connected clients:
- `session-signal` - Any signal (working, review, tasks, etc.)

**Signal API:** `/api/sessions/[name]/signal`

- `GET` - Read current signal for session
- `DELETE` - Clear signal file after processing

**Svelte Store:** `sessionEvents.ts`

```typescript
// Subscribe to session events
import { lastSessionEvent } from '$lib/stores/sessionEvents';

$effect(() => {
  const event = $lastSessionEvent;
  if (event?.type === 'session-signal') {
    // Handle suggested tasks, actions, etc.
  }
});
```

### Session States in IDE

| State | Signal Type | Icon | Color | Description |
|-------|-------------|------|-------|-------------|
| User Input | `user_input` | 💬 | Purple | User sent a message (from terminal) |
| IDE Input | `ide_input` | 💬 | Purple | User sent input from IDE UI |
| Starting | `starting` | 🚀 | Cyan | Agent initializing |
| Working | `working` | ⚡ | Amber | Actively working on task |
| Compacting | `compacting` | 📦 | Orange | Summarizing context |
| Needs Input | `needs_input` | ❓ | Purple | Waiting for user response |
| Ready for Review | `review` | 👁 | Cyan | Asking to mark complete |
| Completed | `completed` | ✅ | Green | Task finished (review required) |
| Completed + Auto-Proceed | `completed` (completionMode='auto_proceed') | 🚀 | Green | Task finished, spawning next task |
| Idle | `idle` | 💤 | Gray | No active task |

### Timeline / EventStack

All signals are also written to a timeline JSONL file (`/tmp/jat-timeline-jat-{AgentName}.jsonl`) for historical tracking. The IDE's **EventStack** component displays this timeline in a stacked card UI.

**Features:**
- Shows most recent event in collapsed view
- Hover to expand and see full timeline
- Click event to see rich details
- Rollback button for events with git_sha
- Auto-refresh polling

**Collapsed Card Labels:**

Collapsed cards show context-specific summaries from signal payloads:

| Event Type | Collapsed Label Shows | Fallback |
|------------|----------------------|----------|
| `user_input` | Truncated prompt (first 60 chars) | - |
| `ide_input` | Truncated input (first 60 chars) | - |
| `working` | `data.approach` (what agent plans to do) | `data.taskTitle` |
| `review` | First `data.summary` item or `data.reviewFocus` | `data.taskTitle` |
| `completed` | `data.outcome` (e.g., "Task completed successfully") | `data.taskTitle` |
| `needs_input` | `data.question` (what agent is asking) | `data.taskTitle` |
| `question` | `data.question` (the question text) | - |
| Others | Uppercase type + task ID (e.g., "STARTING jat-abc") | - |

**Click-to-Copy:**

In the expanded view, `user_input` message text is click-to-copy. Click the purple message box to copy the full prompt to clipboard. A brief "Copied!" badge confirms the action.

**Rich Event Views:**

Each event type has a custom UI in the expanded timeline:

| Event Type | Rich View |
|------------|-----------|
| `user_input` | User message in purple card, click-to-copy |
| `ide_input` | IDE input in purple card, click-to-copy, shows "from IDE" source badge |
| `tasks` | Full SuggestedTasksSection with checkboxes, priority dropdowns, editable titles, "Create Tasks" button |
| `complete` | Summary bullets, quality badges (tests/build), human actions, suggested tasks, cross-agent intel |
| `action` | Title and description card |
| `working` | Task title, task ID, git SHA where work started |
| `review` | Summary items, files modified, tests status |
| `needs_input` | Question, question type, options if provided |
| `question` | Interactive question UI with type-specific controls (see below) |
| `completed` | Green outcome badge, summary checklist, task ID |
| `starting` | Agent name, session ID (full UUID), task ID and title, project |
| `compacting` | Reason, context size before |
| `idle` | Ready for work status, session summary |

**Question Signal UI:**

The `question` signal renders an interactive UI based on `questionType`:

| Type | UI Rendered | User Interaction |
|------|-------------|------------------|
| `choice` | Numbered option buttons with descriptions | Click button to send answer |
| `confirm` | Yes/No buttons (green/red) | Click to send "yes" or "no" |
| `input` | Text field with Submit button | Type answer, Enter or click Submit |

**Question UI Features:**

- **Collapsed indicator**: Purple "❓ Question" badge pulses in collapsed EventStack when unanswered question exists
- **Expanded highlight**: Unanswered questions have purple glow, ring effect, and "NEEDS ANSWER" badge
- **Sound notification**: Plays alert sound when new question arrives (if sounds enabled)
- **Timeout countdown**: Shows remaining seconds (e.g., "⏱ 45s"), pulses when < 30s, shows "⏱ Expired" when done
- **Answered state**: Card turns green with "✓ Answered" badge showing selected option
- **Re-answer option**: "Change answer" button allows changing selection after answering

**Example Signals:**
```bash
# Choice question with options
jat-signal question '{"question":"Which approach?","questionType":"choice","options":[{"label":"Option A","value":"a"},{"label":"Option B","value":"b"}]}'

# Confirm question (yes/no)
jat-signal question '{"question":"Proceed with migration?","questionType":"confirm"}'

# Input question with timeout
jat-signal question '{"question":"Enter name:","questionType":"input","timeout":60}'
```

**Completion Display:**

When a task completes, the `complete` signal is shown with:
- Green "✓ Task Completed Successfully" badge
- "WHAT WAS DONE" summary checklist
- Task ID reference
- Quality badges (tests/build status)
- Human actions and suggested tasks

**JSONL Format:**

Signals must be written as compact single-line JSON (JSONL format), one event per line:
```jsonl
{"type":"working","session_id":"abc123","tmux_session":"jat-FairBay","timestamp":"2025-12-09T15:30:00Z","task_id":"jat-abc","data":{"taskId":"jat-abc","taskTitle":"Add auth"},"git_sha":"2ce771d"}
{"type":"review","session_id":"abc123","tmux_session":"jat-FairBay","timestamp":"2025-12-09T16:00:00Z","task_id":"jat-abc","data":{"taskId":"jat-abc","summary":["Added login"]},"git_sha":"b8fe242"}
```

**Important:** The hook uses `jq -c` (compact output) to ensure proper JSONL format. Pretty-printed JSON will break timeline parsing.

### When to Signal

**Always signal these transitions:**

| Situation | Signal |
|-----------|--------|
| Session just started | `jat-signal starting '{"agentName":"...","project":"..."}'` |
| Starting work on task | `jat-signal working '{"taskId":"...","taskTitle":"..."}'` |
| Context is compacting | `jat-signal compacting '{"reason":"...","contextSizeBefore":...}'` |
| Need user input | `jat-signal needs_input '{"taskId":"...","question":"...","questionType":"..."}'` |
| Structured question for IDE | `jat-signal question '{"question":"...","questionType":"..."}'` |
| Done coding, awaiting review | `jat-signal review '{"taskId":"..."}'` |
| Running /jat:complete steps | `jat-signal completing '{"taskId":"...","currentStep":"verifying",...}'` |
| Task fully completed | `jat-signal complete '{"taskId":"...","completionMode":"review_required",...}'` |
| Task completed + auto-proceed | `jat-signal complete '{"taskId":"...","completionMode":"auto_proceed","nextTaskId":"...","nextTaskTitle":"...",...}'` |
| Session idle | `jat-signal idle '{"readyForWork":true}'` |

**Critical:** Without signals, IDE shows stale state. Always signal when:
- You start or finish substantial work
- You're waiting for user input
- You transition between states
- Context compaction begins

### Files Reference

**Signal Tool:**
- `signal/jat-signal` - Main signal command (symlinked to ~/.local/bin/)
- `signal/jat-signal-validate` - JSON schema validation
- `signal/jat-signal-schema.json` - JSON schemas for all signal types

**Hooks:**
- `.claude/hooks/post-bash-jat-signal.sh` - PostToolUse hook

**IDE:**
- `ide/src/lib/stores/sessionEvents.ts` - SSE client store
- `ide/src/lib/components/work/EventStack.svelte` - Timeline UI component
- `ide/src/routes/api/sessions/events/+server.ts` - SSE endpoint
- `ide/src/routes/api/sessions/[name]/signal/+server.js` - Signal API
- `ide/src/routes/api/sessions/[name]/timeline/+server.ts` - Timeline API
- `ide/src/routes/api/signals/+server.js` - All signals API

**Signal Card Components:**

The IDE renders rich signal cards based on the signal type. Each card provides interactive UI for that specific state.

| Component | Signal Type | Description |
|-----------|-------------|-------------|
| `WorkingSignalCard` | `working` | Task context, work plan, expected files, baseline for rollback |
| `ReviewSignalCard` | `review` | Work summary, files modified, quality status, approve/reject actions |
| `NeedsInputSignalCard` | `needs_input` | Question with options, context, timeout info |
| `IdleSignalCard` | `idle` | Session summary, suggested next task, start work actions |
| `StartingSignalCard` | `starting` | Agent name, project, model, git status, tools available |
| `CompactingSignalCard` | `compacting` | Reason, context size before/after, items being preserved |

**Note:** `completed` signals are rendered via **EventStack** timeline (auto-expands on completion) rather than a dedicated signal card. This allows users to collapse the completion info to see terminal output.

**Signal Card Files:**
- `ide/src/lib/components/signals/index.ts` - Export barrel file
- `ide/src/lib/components/signals/WorkingSignalCard.svelte`
- `ide/src/lib/components/signals/ReviewSignalCard.svelte`
- `ide/src/lib/components/signals/NeedsInputSignalCard.svelte`
- `ide/src/lib/components/signals/IdleSignalCard.svelte`
- `ide/src/lib/components/signals/StartingSignalCard.svelte`
- `ide/src/lib/components/signals/CompactingSignalCard.svelte`

**Type Definitions:**
- `ide/src/lib/types/richSignals.ts` - TypeScript interfaces for all signal types

**Signal Files:**
- `/tmp/jat-signal-{session_id}.json` - Current signal by Claude session ID
- `/tmp/jat-signal-tmux-{sessionName}.json` - Current signal by tmux session name
- `/tmp/jat-timeline-jat-{AgentName}.jsonl` - Timeline history (JSONL format)

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| IDE shows wrong state | Signal not sent | Run appropriate `jat-signal` command |
| "No signal file found" | Hook not firing | Check `.claude/settings.json` has PostToolUse hook |
| Signal file not written | Agent file missing | Ensure `.claude/sessions/agent-{id}.txt` exists |
| SSE not updating | Connection dropped | Refresh page, check `/api/sessions/events` |
| Timeline not showing events | Pretty-printed JSON | Fix with `jq -c '.' file.jsonl > fixed.jsonl && mv fixed.jsonl file.jsonl` |
| "requires JSON payload" error | Using old thin format | Update to new JSON format |

**Debug Steps:**
```bash
# Check signal files
ls /tmp/jat-signal-*.json

# Read a signal file
cat /tmp/jat-signal-tmux-jat-FairBay.json

# Test signal command
jat-signal working '{"taskId":"test-123","taskTitle":"Test task"}'

# Verify hook is installed
grep -A5 'PostToolUse' .claude/settings.json

# Check timeline files
ls /tmp/jat-timeline-*.jsonl

# View timeline for an agent
cat /tmp/jat-timeline-jat-FairBay.jsonl

# Verify JSONL format (each line should be valid JSON)
head -3 /tmp/jat-timeline-jat-FairBay.jsonl | jq .

# Check validation
jat-signal --help
```

### Best Practices

1. **Signal immediately** when state changes (don't batch)
2. **Include all required fields** in JSON payload
3. **Signal `review`** before saying "I'm done" to user
4. **Include context** in suggested tasks (priority, description)
5. **Use validation** - run with `--strict` in CI/tests

### Example Workflow

```bash
# Agent starts session (with session ID and task if known)
jat-signal starting '{"agentName":"FairBay","project":"chimaro","sessionId":"4a5001aa-04eb-47f6-a4da-75048baf4c79","taskId":"jat-abc","taskTitle":"Add auth flow"}'

# Agent picks up task via /jat:start
jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth flow"}'

# Agent needs clarification
jat-signal needs_input '{"taskId":"jat-abc","question":"OAuth or JWT?","questionType":"choice"}'

# User provides answer, agent resumes
jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth flow"}'

# Agent finishes coding - emit rich review signal
jat-signal review '{
  "taskId":"jat-abc",
  "taskTitle":"Add auth flow",
  "summary":["Added OAuth login","Created user session"],
  "filesModified":[
    {"path":"src/lib/auth.ts","changeType":"added","linesAdded":120,"linesRemoved":0}
  ],
  "totalLinesAdded":120,
  "totalLinesRemoved":0,
  "testsStatus":"passing",
  "buildStatus":"clean",
  "reviewFocus":["Verify OAuth token handling"]
}'

# User approves, agent runs /jat:complete
# Use jat-step for each completion step (auto-emits completing signals):

jat-step verifying --task jat-abc --title "Add auth flow" --agent FairBay
# ... verification runs ...

jat-step committing --task jat-abc --title "Add auth flow" --agent FairBay --type feature
# → emits completing (20%) + git commit

jat-step closing --task jat-abc --title "Add auth flow" --agent FairBay
# → emits completing (40%) + jt close

jat-step releasing --task jat-abc --title "Add auth flow" --agent FairBay
# → emits completing (60%) + am-release all

jat-step announcing --task jat-abc --title "Add auth flow" --agent FairBay
# → emits completing (80%) + am-send

# Final completion bundle (100%) - generates + emits in one call
jat-complete-bundle --task jat-abc --agent FairBay --emit
```

**Key points:**
- `jat-step` automatically emits `completing` signals AND executes the step action
- `jat-complete-bundle --emit` generates the summary via LLM and emits the `complete` signal
- No manual `jat-signal` calls needed - signals are baked into the tools

### Auto-Proceed Flow

When `/jat:complete` determines the task can auto-proceed (based on review rules and context), it emits a `complete` signal with `completionMode: "auto_proceed"` that triggers automatic spawning of the next ready task.

**Auto-Proceed Signal Flow:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTO-PROCEED SIGNAL FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Agent completes task via /jat:complete                                  │
│     └─► Step 7.5 determines: completionMode="auto_proceed"                 │
│                                                                             │
│  2. Agent queries next ready task                                           │
│     └─► jt ready --json | jq '.[0]'                                        │
│         └─► Gets nextTaskId + nextTaskTitle                                │
│                                                                             │
│  3. Agent emits complete signal with auto_proceed mode                      │
│     └─► jat-signal complete '{                                             │
│           "taskId": "jat-abc",                                             │
│           "agentName": "FairBay",                                          │
│           "completionMode": "auto_proceed",                                │
│           "nextTaskId": "jat-def",                                         │
│           "nextTaskTitle": "Add user auth",                                │
│           "summary": [...],                                                │
│           "quality": {...},                                                │
│           "suggestedTasks": [...]                                          │
│         }'                                                                  │
│                                                                             │
│  4. PostToolUse hook captures signal                                        │
│     └─► Writes to /tmp/jat-signal-tmux-jat-AgentName.json                  │
│                                                                             │
│  5. SSE server detects file change                                          │
│     └─► Broadcasts session-signal event (type: 'complete', bundle)         │
│                                                                             │
│  6. IDE receives SSE event                                            │
│     └─► sessionEvents.ts handleSessionSignal()                             │
│     └─► Detects completionMode === 'auto_proceed' in complete signal      │
│     └─► Updates session state to 'auto-proceeding'                         │
│     └─► Calls handleAutoProceed()                                          │
│                                                                             │
│  7. handleAutoProceed() executes                                            │
│     └─► Calls POST /api/sessions/next                                      │
│                                                                             │
│  8. API spawns next session                                                 │
│     └─► Kills old tmux session                                             │
│     └─► Creates new tmux session (jat-pending-*)                           │
│     └─► Runs: /jat:start {nextTaskId}                                      │
│     └─► Returns { success, sessionName, nextTaskId }                       │
│                                                                             │
│  9. New agent starts working                                                │
│     └─► /jat:start registers new agent                                     │
│     └─► Renames session to jat-{NewAgentName}                              │
│     └─► Emits working signal                                               │
│     └─► IDE shows new session card                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API Endpoint: `/api/sessions/next`**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions/next` | Spawn next ready task |

**Request Body:**
```json
{
  "completedTaskId": "jat-abc",
  "completedSessionName": "jat-FairBay",
  "project": "chimaro"
}
```

**Response:**
```json
{
  "success": true,
  "nextTaskId": "jat-def",
  "nextTaskTitle": "Add user authentication",
  "sessionName": "jat-pending-1703456789",
  "completedTaskId": "jat-abc"
}
```

**IDE State Transition:**

| Before | Signal | After |
|--------|--------|-------|
| `review` | `complete` (completionMode="auto_proceed") | `auto-proceeding` |
| `auto-proceeding` | (spawn completes) | Session removed, new session appears |

**Visual Feedback:**
- SessionCard shows "🚀 SPAWNING NEXT" badge with pulse animation
- EventStack displays completed task checkmark and next task with loading spinner
- Toast notification when spawn succeeds or fails
