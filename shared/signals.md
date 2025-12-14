## JAT Signal System

**Hook-based agent-to-dashboard communication for real-time state tracking.**

Agents emit signals via `jat-signal` command, PostToolUse hooks capture them, and the dashboard receives real-time updates via SSE.

### Why Signals?

**Benefits:**
- Reliable delivery (hooks fire on every Bash command)
- Structured data (JSON payloads)
- Real-time SSE events to dashboard
- Extensible (states, tasks, actions, custom data)
- No terminal parsing - direct hook capture

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
| `completing` | `jat-signal completing '{...}'` | taskId, currentStep |
| `review` | `jat-signal review '{...}'` | taskId |
| `needs_input` | `jat-signal needs_input '{...}'` | taskId, question, questionType |
| `completed` | `jat-signal completed '{...}'` | taskId, outcome |
| `auto_proceed` | `jat-signal auto_proceed '{...}'` | taskId |
| `idle` | `jat-signal idle '{...}'` | readyForWork |

**Data Signals** - Structured payloads:

| Signal | Command | Description |
|--------|---------|-------------|
| `tasks` | `jat-signal tasks '[{...}]'` | Suggest follow-up tasks (JSON array) |
| `action` | `jat-signal action '{...}'` | Request human action (JSON object) |
| `complete` | `jat-signal complete '{...}'` | Full completion bundle |

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

# Running completion steps
jat-signal completing '{"taskId":"jat-abc","currentStep":"committing"}'

# Waiting for user input
jat-signal needs_input '{"taskId":"jat-abc","question":"Which auth library?","questionType":"choice"}'

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

# Task completed
jat-signal completed '{"taskId":"jat-abc","outcome":"success"}'

# Auto-proceed (will auto-close and pick next task)
jat-signal auto_proceed '{"taskId":"jat-abc","nextTaskId":"jat-def"}'

# Session idle
jat-signal idle '{"readyForWork":true}'
```

**Suggesting Follow-up Tasks:**
```bash
jat-signal tasks '[
  {"title": "Add unit tests", "priority": 2, "type": "task"},
  {"title": "Update documentation", "priority": 3, "type": "task"}
]'
```

**Requesting Human Action:**
```bash
jat-signal action '{
  "title": "Run database migration",
  "description": "Execute: npx prisma migrate deploy"
}'
```

**Full Completion Bundle:**
```bash
jat-signal complete '{
  "suggestedTasks": [
    {"title": "Add tests", "priority": 2}
  ],
  "humanActions": [
    {"title": "Deploy to staging"}
  ]
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

4. Dashboard SSE server watches signal files
   └─► /api/sessions/events endpoint
   └─► Broadcasts session-signal event to all clients

5. Dashboard UI updates in real-time
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

### Dashboard Integration

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

### Session States in Dashboard

| State | Signal Type | Icon | Color | Description |
|-------|-------------|------|-------|-------------|
| User Input | `user_input` | 💬 | Purple | User sent a message |
| Starting | `starting` | 🚀 | Cyan | Agent initializing |
| Working | `working` | ⚡ | Amber | Actively working on task |
| Compacting | `compacting` | 📦 | Orange | Summarizing context |
| Needs Input | `needs_input` | ❓ | Purple | Waiting for user response |
| Ready for Review | `review` | 👁 | Cyan | Asking to mark complete |
| Completing | `completing` | ⏳ | Teal | Running /jat:complete steps |
| Completed | `completed` | ✅ | Green | Task finished |
| Auto-Proceed | `auto_proceed` | 🚀 | Green | Will auto-close and pick next |
| Idle | `idle` | 💤 | Gray | No active task |

### Timeline / EventStack

All signals are also written to a timeline JSONL file (`/tmp/jat-timeline-jat-{AgentName}.jsonl`) for historical tracking. The dashboard's **EventStack** component displays this timeline in a stacked card UI.

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
| `working` | `data.approach` (what agent plans to do) | `data.taskTitle` |
| `review` | First `data.summary` item or `data.reviewFocus` | `data.taskTitle` |
| `completing` | `data.currentStep` (e.g., "Committing...") | `data.taskTitle` |
| `completed` | `data.outcome` (e.g., "Task completed successfully") | `data.taskTitle` |
| `needs_input` | `data.question` (what agent is asking) | `data.taskTitle` |
| Others | Uppercase type + task ID (e.g., "STARTING jat-abc") | - |

**Click-to-Copy:**

In the expanded view, `user_input` message text is click-to-copy. Click the purple message box to copy the full prompt to clipboard. A brief "Copied!" badge confirms the action.

**Rich Event Views:**

Each event type has a custom UI in the expanded timeline:

| Event Type | Rich View |
|------------|-----------|
| `user_input` | User message in purple card, click-to-copy |
| `tasks` | Full SuggestedTasksSection with checkboxes, priority dropdowns, editable titles, "Create Tasks" button |
| `complete` | Summary bullets, quality badges (tests/build), human actions, suggested tasks, cross-agent intel |
| `action` | Title and description card |
| `working` | Task title, task ID, git SHA where work started |
| `review` | Summary items, files modified, tests status |
| `needs_input` | Question, question type, options if provided |
| `completing` | Current step (hidden once task completes) |
| `completed` | Green outcome badge, summary checklist, task ID |
| `starting` | Agent name, session ID (full UUID), task ID and title, project |
| `compacting` | Reason, context size before |
| `idle` | Ready for work status, session summary |
| `auto_proceed` | Current task ID, next task ID |

**Completing → Completed Transition:**

When a task completes, intermediate `completing` events are automatically hidden from the timeline. Only the final `completed` event is shown with:
- Green "✓ Task Completed Successfully" badge
- "WHAT WAS DONE" summary checklist
- Task ID reference

This keeps the timeline clean - you see the steps while completion is in progress, then just the final result once done.

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
| Running completion steps | `jat-signal completing '{"taskId":"...","currentStep":"..."}'` |
| Need user input | `jat-signal needs_input '{"taskId":"...","question":"...","questionType":"..."}'` |
| Done coding, awaiting review | `jat-signal review '{"taskId":"..."}'` |
| Task fully completed | `jat-signal completed '{"taskId":"...","outcome":"success"}'` |
| OK to auto-close session | `jat-signal auto_proceed '{"taskId":"..."}'` |
| Session idle | `jat-signal idle '{"readyForWork":true}'` |
| Suggesting follow-up work | `jat-signal tasks '[...]'` |
| Human action required | `jat-signal action '{...}'` |

**Critical:** Without signals, dashboard shows stale state. Always signal when:
- You start or finish substantial work
- You're waiting for user input
- You transition between states
- Context compaction begins

### Files Reference

**Signal Tool:**
- `signal/jat-signal` - Main signal command (symlinked to ~/bin/)
- `signal/jat-signal-validate` - JSON schema validation
- `signal/jat-signal-schema.json` - JSON schemas for all signal types

**Hooks:**
- `.claude/hooks/post-bash-jat-signal.sh` - PostToolUse hook

**Dashboard:**
- `dashboard/src/lib/stores/sessionEvents.ts` - SSE client store
- `dashboard/src/lib/components/work/EventStack.svelte` - Timeline UI component
- `dashboard/src/routes/api/sessions/events/+server.ts` - SSE endpoint
- `dashboard/src/routes/api/sessions/[name]/signal/+server.js` - Signal API
- `dashboard/src/routes/api/sessions/[name]/timeline/+server.ts` - Timeline API
- `dashboard/src/routes/api/signals/+server.js` - All signals API

**Signal Files:**
- `/tmp/jat-signal-{session_id}.json` - Current signal by Claude session ID
- `/tmp/jat-signal-tmux-{sessionName}.json` - Current signal by tmux session name
- `/tmp/jat-timeline-jat-{AgentName}.jsonl` - Timeline history (JSONL format)

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Dashboard shows wrong state | Signal not sent | Run appropriate `jat-signal` command |
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

# Agent suggests follow-up tasks
jat-signal tasks '[{"title":"Add tests","priority":2}]'

# User approves completion via /jat:complete
jat-signal completed '{"taskId":"jat-abc","outcome":"success"}'
```
