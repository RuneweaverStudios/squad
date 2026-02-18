# Agent programs

SQUAD supports multiple AI coding assistants through a configurable agent program system. You can route specific tasks to different tools based on type, priority, labels, or project.

## Supported agents

| Agent | Command | Auth Method | Default |
|-------|---------|-------------|---------|
| Claude Code | `claude` | Subscription (Pro/Max) | Yes |
| Codex CLI | `codex` | Subscription (Plus/Pro) | No |
| Gemini CLI | `gemini` | Google Account | No |
| OpenCode | `opencode` | OAuth | No |
| Aider | `aider` | API keys | No |
| Any CLI tool | Configurable | Varies | No |

## The agents.json file

Agent configuration lives at `~/.config/squad/agents.json`. Heres a trimmed example:

```json
{
  "version": 1,
  "programs": {
    "claude-code": {
      "id": "claude-code",
      "name": "Claude Code",
      "command": "claude",
      "models": [
        { "id": "claude-opus-4-5-20251101", "name": "Opus 4.5", "shortName": "opus", "costTier": "high" },
        { "id": "claude-sonnet-4-20250514", "name": "Sonnet 4", "shortName": "sonnet", "costTier": "medium" }
      ],
      "defaultModel": "opus",
      "flags": ["--dangerously-skip-permissions"],
      "authType": "subscription",
      "enabled": true,
      "isDefault": true
    }
  },
  "defaults": {
    "fallbackAgent": "claude-code",
    "fallbackModel": "opus"
  }
}
```

## Agent program fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Display name |
| `command` | string | Yes | CLI command to run |
| `models` | array | Yes | Available models with id, name, shortName, costTier |
| `defaultModel` | string | Yes | shortName of the default model |
| `flags` | string[] | Yes | Extra CLI flags (can be empty) |
| `authType` | enum | Yes | `subscription`, `api_key`, or `none` |
| `apiKeyProvider` | string | If api_key | Provider name in credentials vault |
| `apiKeyEnvVar` | string | If api_key | Environment variable for the key |
| `enabled` | boolean | Yes | Whether agent is available |
| `isDefault` | boolean | Yes | Fallback agent when no routing rule matches |

## Authentication types

| Type | How it works | Setup |
|------|-------------|-------|
| `subscription` | Uses the CLIs built-in auth | Run `claude auth` or equivalent |
| `api_key` | Needs an API key from the provider | Set in Settings > API Keys |
| `none` | No auth required | For local models |

For `api_key` agents, the IDE injects the key as an environment variable when spawning sessions.

## Routing rules

Routing rules map task attributes to specific agents and models. Rules are evaluated in order and the first match wins.

```json
{
  "routingRules": [
    {
      "id": "security-to-opus",
      "name": "Security tasks to Opus",
      "conditions": [
        { "type": "label", "operator": "contains", "value": "security" }
      ],
      "agentId": "claude-code",
      "modelOverride": "opus",
      "enabled": true,
      "order": 1
    },
    {
      "id": "chores-to-haiku",
      "name": "Chores to Haiku",
      "conditions": [
        { "type": "type", "operator": "equals", "value": "chore" }
      ],
      "agentId": "claude-code",
      "modelOverride": "haiku",
      "enabled": true,
      "order": 2
    }
  ]
}
```

| Condition Type | Operators | Example |
|---------------|-----------|---------|
| `label` | equals, contains, startsWith, regex | `security`, `frontend` |
| `type` | equals, regex | `bug`, `feature`, `chore` |
| `priority` | equals, lt, lte, gt, gte | `0`, `1` |
| `project` | equals, startsWith, regex | `squad`, `chimaro` |
| `epic` | equals | `squad-abc` |

## Adding a new agent type

1. Add the program to `~/.config/squad/agents.json` under `programs`
2. If it uses API keys, add the key in Settings > API Keys (match `apiKeyProvider` to the key name)
3. Optionally create routing rules to send specific tasks to it

## Spawn flow

When the IDE spawns an agent for a task:

1. Load agent config from `~/.config/squad/agents.json`
2. Evaluate routing rules against the task (first match wins)
3. Select agent and model from the matched rule (or use fallback)
4. Validate the agent is enabled and auth is available
5. Build the CLI command from config
6. Create tmux session and start the agent

You can also manually pick an agent and model from the IDE's spawn dialog, bypassing routing rules entirely.

## See also

- [Projects](/docs/projects/) - Project configuration
- [Credentials & Secrets](/docs/credentials/) - API key management
- [Multi-Agent Swarm](/docs/multi-agent/) - Running parallel agents
