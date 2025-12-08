## JAT Signal System

**Hook-based agent-to-dashboard communication for real-time state tracking.**

The jat-signal system replaces fragile terminal marker parsing with structured signals delivered via PostToolUse hooks. Agents emit signals, hooks capture them, and the dashboard receives real-time updates via SSE.

### Why Signals?

**Before (Terminal Markers):**
```
[JAT:WORKING task=jat-abc]    ← Parsed from tmux output
[JAT:NEEDS_REVIEW]            ← Fragile regex matching
[JAT:COMPLETED]               ← Breaks with output changes
```

**After (Hook-Based Signals):**
```bash
jat-signal working jat-abc    ← Structured command
jat-signal review             ← Hook captures reliably
jat-signal completed          ← JSON written to /tmp
```

**Benefits:**
- Reliable delivery (hooks fire on every command)
- Structured data (JSON, not regex parsing)
- Real-time SSE events to dashboard
- Extensible (tasks, actions, custom data)

### Signal Types

**State Signals** - Agent lifecycle states:

| Signal | Command | Description |
|--------|---------|-------------|
| `working` | `jat-signal working <task-id>` | Started working on task |
| `review` | `jat-signal review` | Ready for human review |
| `idle` | `jat-signal idle` | Session idle, no active task |
| `auto_proceed` | `jat-signal auto_proceed` | OK for dashboard to auto-close |
| `completed` | `jat-signal completed` | Task done |
| `needs_input` | `jat-signal needs_input` | Waiting for user input |

**Data Signals** - Structured payloads:

| Signal | Command | Description |
|--------|---------|-------------|
| `tasks` | `jat-signal tasks '[{...}]'` | Suggest follow-up tasks (JSON array) |
| `action` | `jat-signal action '{...}'` | Request human action (JSON object) |
| `complete` | `jat-signal complete '{...}'` | Full completion bundle (state + tasks + actions) |

### Usage

**Basic State Signals:**
```bash
# Starting work on a task
jat-signal working jat-abc

# Waiting for user input
jat-signal needs_input

# Ready for review
jat-signal review

# Task completed
jat-signal completed
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
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SIGNAL FLOW ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Agent runs jat-signal command                                          │
│     └─► jat-signal working jat-abc                                         │
│                                                                             │
│  2. Command outputs marker line                                            │
│     └─► [JAT-SIGNAL:STATE] working:jat-abc                                │
│                                                                             │
│  3. PostToolUse hook fires (post-bash-jat-signal.sh)                       │
│     └─► Parses output, extracts signal type and data                       │
│     └─► Writes JSON to /tmp/jat-signal-{session}.json                      │
│     └─► Also writes /tmp/jat-signal-tmux-{sessionName}.json                │
│                                                                             │
│  4. Dashboard SSE server watches signal files                              │
│     └─► /api/sessions/events endpoint                                      │
│     └─► Broadcasts session-signal event to all clients                     │
│                                                                             │
│  5. Dashboard UI updates in real-time                                      │
│     └─► SessionCard shows current state                                    │
│     └─► Suggested tasks appear in UI                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hook Architecture

**PostToolUse Hook:** `.claude/hooks/post-bash-jat-signal.sh`

The hook is triggered after every Bash tool call. It:
1. Checks if command was `jat-signal *`
2. Extracts `session_id` from hook input JSON
3. Parses `[JAT-SIGNAL:*]` marker from output
4. Looks up agent name from `.claude/sessions/agent-{session_id}.txt`
5. Writes structured JSON to `/tmp/jat-signal-{session}.json`

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
  "type": "state",
  "session_id": "abc123-def456",
  "tmux_session": "jat-FairBay",
  "timestamp": "2025-12-08T15:30:00Z",
  "state": "working",
  "task_id": "jat-abc"
}
```

### Dashboard Integration

**SSE Endpoint:** `/api/sessions/events`

Broadcasts real-time events to connected clients:
- `session-state` - State change (working, review, etc.)
- `session-signal` - Data signal (tasks, actions)

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

| State | Signal | Dashboard Color | Description |
|-------|--------|-----------------|-------------|
| Starting | (none) | Cyan | Agent initializing |
| Working | `working` | Amber | Actively working on task |
| Needs Input | `needs_input` | Purple | Waiting for user response |
| Ready for Review | `review` | Cyan | Asking to mark complete |
| Completing | - | Teal | Running /jat:complete |
| Completed | `completed` | Green | Task finished |
| Idle | `idle` | Gray | No active task |

### When to Signal

**Always signal these transitions:**

| Situation | Signal |
|-----------|--------|
| Starting work on task | `jat-signal working <task-id>` |
| Need user input | `jat-signal needs_input` |
| Done coding, awaiting review | `jat-signal review` |
| Task fully completed | `jat-signal completed` |
| Suggesting follow-up work | `jat-signal tasks '[...]'` |

**Critical:** Without signals, dashboard shows stale state. Always signal when:
- You finish substantial work
- You're waiting for user input
- You transition between states

### Migration from Markers

**Old Marker System:**
```
[JAT:WORKING task=xxx]     → jat-signal working xxx
[JAT:NEEDS_REVIEW]         → jat-signal review
[JAT:IDLE]                 → jat-signal idle
[JAT:AUTO_PROCEED]         → jat-signal auto_proceed
[JAT:COMPLETED]            → jat-signal completed
[JAT:NEEDS_INPUT]          → jat-signal needs_input
[JAT:SUGGESTED_TASKS {...}] → jat-signal tasks '[...]'
[JAT:HUMAN_ACTION {...}]   → jat-signal action '{...}'
```

**Migration Steps:**
1. Replace marker output with `jat-signal` command
2. Ensure hook is installed (check `.claude/settings.json`)
3. Verify signal files appear in `/tmp/`

### Files Reference

**Signal Tool:**
- `tools/jat-signal` - Main signal command

**Hooks:**
- `.claude/hooks/post-bash-jat-signal.sh` - PostToolUse hook

**Dashboard:**
- `dashboard/src/lib/stores/sessionEvents.ts` - SSE client store
- `dashboard/src/routes/api/sessions/events/+server.ts` - SSE endpoint
- `dashboard/src/routes/api/sessions/[name]/signal/+server.js` - Signal API
- `dashboard/src/routes/api/signals/+server.js` - All signals API

**Signal Files:**
- `/tmp/jat-signal-{session_id}.json` - By Claude session ID
- `/tmp/jat-signal-tmux-{sessionName}.json` - By tmux session name

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Dashboard shows wrong state | Signal not sent | Run appropriate `jat-signal` command |
| "No signal file found" | Hook not firing | Check `.claude/settings.json` has PostToolUse hook |
| Signal file not written | Agent file missing | Ensure `.claude/sessions/agent-{id}.txt` exists |
| SSE not updating | Connection dropped | Refresh page, check `/api/sessions/events` |

**Debug Steps:**
```bash
# Check signal files
ls /tmp/jat-signal-*.json

# Read a signal file
cat /tmp/jat-signal-tmux-jat-FairBay.json

# Test signal command
jat-signal working test-123
cat /tmp/jat-signal-debug.log

# Verify hook is installed
grep -A5 'PostToolUse' .claude/settings.json
```

### Best Practices

1. **Signal immediately** when state changes (don't batch)
2. **Use task ID** with `working` signal for dashboard tracking
3. **Signal `review`** before saying "I'm done" to user
4. **Include context** in suggested tasks (priority, description)
5. **Clear old signals** when starting new work

### Example Workflow

```bash
# Agent starts working
/jat:start jat-abc
# Internally runs: jat-signal working jat-abc

# Agent needs clarification
jat-signal needs_input
# User provides answer
jat-signal working jat-abc

# Agent finishes coding
jat-signal review
# Shows summary, waits for user

# Agent suggests follow-up tasks
jat-signal tasks '[{"title":"Add tests","priority":2}]'

# User approves completion
/jat:complete
# Internally runs: jat-signal completed
```
