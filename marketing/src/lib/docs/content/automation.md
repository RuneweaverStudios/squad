# Automation Rules

JAT's automation system monitors agent session output and automatically executes actions when patterns match. This enables hands-off recovery from errors, auto-continuation prompts, and notification triggers.

## How It Works

```
Session Output → Pattern Matching → Action Execution → Activity Log
```

1. IDE polls tmux session output
2. The automation engine checks all enabled rules against the output
3. Matching rules trigger actions (with rate limiting)
4. Actions are executed: send keys, tmux commands, signals, or notifications
5. Activity is logged for audit trail

## Pattern Types

| Mode | Description | Example |
|------|-------------|---------|
| `regex` | Regular expression | `error.*timeout\|ECONNREFUSED` |
| `contains` | Substring match | `API rate limit` |
| `exact` | Exact string match | `Continue? [y/n]` |
| `startsWith` | Prefix match | `Error:` |
| `endsWith` | Suffix match | `failed.` |

Rules can have multiple patterns. **All patterns must match** (AND logic) for the rule to trigger.

### Pattern Options

- **caseSensitive** — Match case (default: false)
- **negate** — Invert result (match when pattern NOT found)

## Action Types

| Type | Description | Value Example |
|------|-------------|---------------|
| `send_text` | Send text + Enter to session | `y` |
| `send_keys` | Send raw tmux keys | `C-c` (Ctrl+C) |
| `tmux_command` | Run tmux command | `send-keys -t {session} q` |
| `signal` | Emit JAT signal | `working {"taskId":"{$1}"}` |
| `notify_only` | Log without action | `Detected stall` |

Actions can have a `delayMs` to wait before executing (useful for debouncing).

## Template Variables

All action payloads support variable substitution:

| Variable | Description | Example |
|----------|-------------|---------|
| `{session}` | Tmux session name | `jat-FairBay` |
| `{agent}` | Agent name | `FairBay` |
| `{timestamp}` | ISO timestamp | `2025-12-17T15:30:00.000Z` |
| `{match}` | Full matched text | `Working on task jat-abc` |
| `{$1}`, `{$2}` | Regex capture groups | `jat-abc` |

### Example: Dynamic Signal

Pattern (regex): `Working on task (jat-[a-z0-9]+)`

Signal action: `working {"taskId":"{$1}","agentName":"{agent}"}`

## Rate Limiting

**Per-rule limits:**
- `cooldownSeconds` — Minimum time between triggers for same rule
- `maxTriggersPerHour` — Maximum triggers per hour (optional)

**Global limits:**
- `globalCooldownSeconds` — Min time between ANY automation action
- `maxActionsPerMinute` — Max actions across all rules per minute

## Preset Library

JAT ships with pre-configured rules:

| Preset | Category | Pattern | Action |
|--------|----------|---------|--------|
| API Overloaded Recovery | recovery | `API is overloaded` | Wait, send Enter |
| Rate Limit Recovery | recovery | `rate limit\|429` | Wait 60s, retry |
| Network Error Recovery | recovery | `ECONNREFUSED\|ETIMEDOUT` | Wait, retry |
| Auto-Continue Prompts | prompt | `Continue?\|Press Enter` | Send Enter |
| Auto-Retry on Failure | prompt | `Retry?\|Try again?` | Send `y` |
| Error Detection | notification | `Error:\|FATAL` | Notify |

Install presets from the **Automation** page → **Presets** panel.

## Session State Filtering

Rules can be limited to trigger only in specific session states:

| State | When Active |
|-------|-------------|
| `starting` | Agent initializing |
| `working` | Agent actively coding |
| `needs-input` | Waiting for user response |
| `ready-for-review` | Agent asking to complete |
| `completing` | Running /jat:complete |
| `completed` | Task finished |

## Creating Rules

### Via UI

1. Navigate to `/automation` in the IDE
2. Click "Add Rule"
3. Configure name, description, category
4. Add patterns and actions
5. Set cooldown and rate limits
6. Save

### Editing Rules

Each rule row in the Rules List has action buttons:
- **Pencil** — Edit rule in the Rule Editor modal
- **Copy** — Clone rule
- **Trash** — Delete rule
- **Toggle** — Quick enable/disable

### Testing Patterns

Use the **Pattern Tester** panel to test patterns against sample text before deploying rules.

## See Also

- [Multi-Agent Swarm](/docs/multi-agent/) — Running parallel agents
- [Signals](/docs/signals/) — Agent state tracking
- [Work Sessions](/docs/work-sessions/) — Session monitoring
