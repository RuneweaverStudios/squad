# Signals

Signals are the communication protocol between agents and the IDE. An agent emits a signal by running the `squad-signal` CLI tool, which writes a JSON file to `/tmp/`. The IDE reads these files via SSE and updates the UI in real time.

## Signal types

SQUAD defines seven signal states. Each represents a phase in the agent's work lifecycle.

| Signal | State | When emitted | Required fields |
|--------|-------|--------------|-----------------|
| `starting` | Agent booting | After registration, before task work | `agentName`, `sessionId`, `project`, `model`, `gitBranch`, `gitStatus` |
| `working` | Active coding | After reading task, before first edit | `taskId`, `taskTitle`, `approach` |
| `needs_input` | Blocked on question | Before calling AskUserQuestion | `taskId`, `question`, `questionType` |
| `review` | Work complete | After coding, before /squad:complete | `taskId`, `taskTitle`, `summary` |
| `completing` | Closing out task | During /squad:complete steps | `taskId`, `currentStep`, `progress` |
| `complete` | Task finished | After all completion steps pass | `taskId`, `completionMode`, `summary`, `quality` |
| `compacting` | Context shrinking | During context compaction | `reason`, `contextSizeBefore`, `estimatedAfter` |

Signals must be emitted in order as the agent progresses. The IDE uses the most recent signal to determine session state and render the appropriate badge, colors, and actions.

## Signal payloads

Each signal type has its own JSON schema. Here are the most commonly used payloads.

**Starting signal:**

```bash
squad-signal starting '{
  "agentName": "FairBay",
  "sessionId": "a019c84c-7b54-45cc-9eee-dd6a70dea1a3",
  "project": "squad",
  "model": "claude-opus-4-5-20251101",
  "gitBranch": "master",
  "gitStatus": "clean",
  "tools": ["Bash", "Read", "Write", "Edit"],
  "uncommittedFiles": []
}'
```

**Working signal:**

```bash
squad-signal working '{
  "taskId": "squad-abc",
  "taskTitle": "Add caching layer",
  "approach": "Use Redis for session cache, add TTL config",
  "expectedFiles": ["src/lib/cache/*", "src/routes/api/*"],
  "estimatedScope": "medium"
}'
```

**Needs input signal:**

```bash
squad-signal needs_input '{
  "taskId": "squad-abc",
  "question": "Should expired cache entries return stale data or null?",
  "questionType": "choice",
  "options": [
    {"label": "Return stale data", "value": "stale", "description": "Better UX, risk of outdated info"},
    {"label": "Return null", "value": "null", "description": "Forces refresh, slower UX"}
  ]
}'
```

**Complete signal (full bundle):**

```bash
squad-signal complete '{
  "taskId": "squad-abc",
  "agentName": "FairBay",
  "completionMode": "review_required",
  "summary": ["Added Redis cache layer", "Configured TTL per route"],
  "quality": {"tests": "passing", "build": "clean"},
  "humanActions": [{"title": "Deploy Redis to production"}],
  "suggestedTasks": [{"title": "Add cache monitoring dashboard", "priority": 3}],
  "crossAgentIntel": {
    "files": ["src/lib/cache/redis.ts"],
    "patterns": ["Use $lib/cache for all caching"],
    "gotchas": ["Cache TTL must match session duration"]
  }
}'
```

## squad-signal CLI tool

The `squad-signal` bash tool validates payloads against the JSON schema and writes the signal file.

```bash
squad-signal <signal_type> '<json_payload>'
```

Signal types must be one of: `starting`, `working`, `needs_input`, `review`, `completing`, `complete`, `compacting`.

The tool also accepts a `question` type for structured question signals that integrate with the Smart Question UI.

Validation runs via `squad-signal-validate` which checks the payload against `squad-signal-schema.json`. Invalid payloads are rejected with a descriptive error.

## Signal file locations

Signals write to temp files in `/tmp/` using two naming patterns:

```
/tmp/squad-signal-{sessionId}.json        # By Claude session ID
/tmp/squad-signal-tmux-{tmuxSession}.json  # By tmux session name
```

Both files contain the same data. The dual-write enables flexible lookup since some contexts have the session ID and others have the tmux session name.

Signal files are ephemeral. They get cleared on system reboot (since `/tmp/` is a tmpfs on most Linux systems). The `completing` signal is special in that it includes a `progress` percentage that the IDE renders as a progress bar.

## IDE consumption via SSE

The IDE reads signals through Server-Sent Events (SSE). The SSE endpoint polls signal files and broadcasts `session-signal` events to connected browser clients.

```
Agent emits signal
  --> PostToolUse hook captures squad-signal call
  --> Hook writes JSON to /tmp/squad-signal-*.json
  --> SSE server detects new/changed file
  --> SSE broadcasts session-signal event
  --> Browser receives event, updates SessionCard state
```

The Work page connects to SSE on mount and reconnects automatically on disconnection. Each `session-signal` event carries the session name and full signal payload.

SessionCard components use the `sseState` field from signals to determine which badge, color, and actions to display. The state mapping is defined in `src/lib/config/statusColors.ts`.

## IDE-initiated signals (instant signal pattern)

When the IDE triggers an action that will cause a state change it writes the signal file immediately, before the agent processes the command. This eliminates the perceived delay between clicking a button and seeing the UI update.

For example, when you click "Complete" on a session:

1. IDE writes `completing` signal to `/tmp/` with `progress: 0`
2. UI updates instantly to show "COMPLETING" badge
3. IDE sends `/squad:complete` via tmux keys
4. Agent processes the command and emits its own signals
5. Agent's real signals overwrite the pre-written file with richer data

This pattern is safe because signal files are idempotent. The agent's eventual signal always has more detail than the IDE's placeholder. No data loss occurs from the overwrite.

## Completing signal with progress

The `completing` signal is unique in that it tracks progress through multiple steps:

| Step | Progress | Signal emitted by |
|------|----------|-------------------|
| Verifying | 0% | `squad-step verifying` |
| Committing | 25% | `squad-step committing` |
| Closing | 50% | `squad-step closing` |
| Releasing | 75% | `squad-step releasing` |
| Complete | 100% | `squad-step complete` |

Each `squad-step` call emits the signal automatically. The agent doesn't need to call `squad-signal` manually during the completion flow.

## See also

- [Workflow Commands](/docs/workflow-commands/) for when signals are emitted
- [Work Sessions](/docs/work-sessions/) for how the IDE renders signal state
- [Automation](/docs/automation/) for auto-responding to needs_input signals
