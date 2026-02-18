# Automation Rules

The automation system watches agent session output and executes actions when patterns match. It runs API-overloaded recovery, auto-continues prompts, and fires notifications without human intervention.

## How it works

```
Session output --> Pattern matching --> Rate limit check --> Action execution --> Activity log
```

The IDE polls tmux session output and passes it through `automationEngine.processSessionOutput()`. Every enabled rule is checked against the output text. When all patterns in a rule match, its actions fire (subject to cooldown and rate limits).

## Pattern matching

Each rule has one or more patterns. All patterns in a rule must match for the rule to trigger (AND logic).

| Mode | Description | Example value |
|------|-------------|---------------|
| `regex` | Regular expression | `error.*timeout\|ECONNREFUSED` |
| `contains` | Substring match | `API rate limit` |
| `exact` | Exact string match | `Continue? [y/n]` |
| `startsWith` | Prefix match | `Error:` |
| `endsWith` | Suffix match | `failed.` |

**Pattern options:**

- `caseSensitive` defaults to false. Most rules work case-insensitive
- `negate` inverts the result. The pattern matches when the text does NOT contain it

```typescript
// A rule with two patterns (both must match)
patterns: [
  { mode: 'contains', value: 'Error', caseSensitive: false },
  { mode: 'regex', value: 'timeout|ECONNREFUSED' }
]
```

## Action types

When a rule triggers, its actions execute in order.

| Type | What it does | Value example |
|------|-------------|---------------|
| `send_text` | Sends text + Enter to session | `y` |
| `send_keys` | Sends raw tmux key sequence | `C-c` (Ctrl+C) |
| `tmux_command` | Runs arbitrary tmux command | `send-keys -t {session} q` |
| `signal` | Emits a SQUAD signal | `working {"taskId":"{$1}"}` |
| `notify_only` | Logs the match without acting | `Detected stall pattern` |

Actions support an optional `delayMs` field. Set `delayMs: 5000` to wait 5 seconds before executing. Useful for debouncing flaky error recovery.

## Template variables

Action payloads support variable substitution at runtime.

| Variable | Resolves to | Example |
|----------|-------------|---------|
| `{session}` | Tmux session name | `squad-FairBay` |
| `{agent}` | Agent name | `FairBay` |
| `{timestamp}` | ISO timestamp | `2025-12-17T15:30:00.000Z` |
| `{match}` | Full matched text | `Working on task squad-abc` |
| `{$0}` | Same as `{match}` | `Working on task squad-abc` |
| `{$1}`, `{$2}` | Regex capture groups | `squad-abc` |

Capture groups come from regex patterns. Use parentheses to capture, then reference with `{$1}` in the action value.

```
Pattern (regex): Working on task (squad-[a-z0-9]+)
Action (signal): working {"taskId":"{$1}","agentName":"{agent}"}
```

If the output contains "Working on task squad-xyz" and the session is `squad-FairBay`, the signal payload becomes `working {"taskId":"squad-xyz","agentName":"FairBay"}`.

## Rate limiting and cooldowns

Rules have two rate limit controls:

- **`cooldownSeconds`** sets the minimum time between triggers for the same rule. If set to 30, the rule fires at most once per 30 seconds
- **`maxTriggersPerHour`** caps total triggers per hour. Set to 0 for unlimited

Global limits apply across all rules:

- `config.globalCooldownSeconds` sets minimum time between ANY automation action
- `config.maxActionsPerMinute` caps total actions across all rules per minute

## Preset library

SQUAD ships with pre-built rules you can install from the Presets panel.

| Preset | Category | Trigger | Action |
|--------|----------|---------|--------|
| API Overloaded Recovery | recovery | `API is overloaded` | Wait, send Enter |
| Rate Limit Recovery | recovery | `rate limit\|429\|too many requests` | Wait 60s, retry |
| Network Error Recovery | recovery | `ECONNREFUSED\|ETIMEDOUT` | Wait, retry |
| YOLO Auto-Accept | recovery | `Do you wish to proceed?` | Send Enter |
| Auto-Continue Prompts | prompt | `Continue\?\|Press Enter` | Send Enter |
| Auto-Retry on Failure | prompt | `Retry\?\|Try again\?` | Send `y` |
| Waiting for Input Detection | stall | `waiting for.*input` | Notify only |
| Task Completion Notification | notification | `Task completed\|squad:complete` | Notify |
| Error Detection | notification | `Error:\|Exception:\|FATAL` | Notify |

Install presets with one click from the Presets picker. Installed presets can be customized after installation.

## Session state filtering

Rules can be restricted to fire only in specific session states:

```typescript
{
  sessionStates: ['working', 'needs-input'],
  // Rule only triggers when agent is working or waiting for input
}
```

Available states: `starting`, `working`, `needs-input`, `ready-for-review`, `completing`, `completed`, `idle`.

This prevents recovery rules from firing during completion (when error messages might appear in normal output) or notification rules from spamming during startup.

## Creating and editing rules

Navigate to `/automation` in the IDE. The page has five panels:

- **Rules List** on the left shows all rules grouped by category with enable/disable toggles
- **Rule Editor** modal opens for creating or editing rules
- **Presets Picker** lets you browse and install built-in rules
- **Pattern Tester** checks patterns against sample text
- **Activity Log** shows recent rule triggers with timestamps

To create a new rule, click "Add Rule" and fill in the form:

1. Name and description
2. Category (recovery, prompt, stall, notification, custom)
3. One or more patterns with mode and value
4. One or more actions with type and value
5. Cooldown and rate limit settings
6. Optional session state filter

Edit existing rules by clicking the pencil icon on any rule row. Clone a rule with the copy icon to experiment without affecting the original. Drag rules to reorder priority (lower position = higher priority).

**Import and export** rules as JSON for sharing across machines:

```typescript
const json = exportRules();
importRules(json, true);  // true = merge with existing
```

## See also

- [Work Sessions](/docs/work-sessions/) for session monitoring
- [Signals](/docs/signals/) for signal-based state tracking
- [Multi-Agent Swarm](/docs/multi-agent/) for hands-off agent operation
