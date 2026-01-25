## Agent Programs: Agent-Agnostic Orchestration

JAT supports multiple AI coding assistants through a configurable agent program system. This allows routing tasks to different AI tools based on task attributes, cost considerations, or capability requirements.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AGENT-AGNOSTIC ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Task Arrives ──► Routing Rules ──► Agent Selection ──► Spawn Session      │
│                        │                   │                                │
│                        ▼                   ▼                                │
│               Match conditions      Select program + model                  │
│               (label, type, priority)       │                               │
│                        │                   │                                │
│                        ▼                   ▼                                │
│               First match wins      Build spawn command                     │
│               or use fallback       (command + flags + model)               │
│                                                                             │
│  Supported Agents:                                                          │
│  • Claude Code (claude)                                                     │
│  • OpenAI Codex CLI (codex)                                                 │
│  • Google Gemini (gemini)                                                   │
│  • Aider (aider)                                                            │
│  • OpenCode (opencode) - https://opencode.ai                                │
│  • Any CLI-based AI coding tool                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration File

**Location:** `~/.config/jat/agents.json`

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
        { "id": "claude-sonnet-4-20250514", "name": "Sonnet 4", "shortName": "sonnet", "costTier": "medium" },
        { "id": "claude-3-5-haiku-20241022", "name": "Haiku 3.5", "shortName": "haiku", "costTier": "low" }
      ],
      "defaultModel": "opus",
      "flags": ["--dangerously-skip-permissions"],
      "authType": "subscription",
      "enabled": true,
      "isDefault": true,
      "order": 0
    },
    "codex-cli": {
      "id": "codex-cli",
      "name": "Codex CLI",
      "command": "codex",
      "models": [
        { "id": "o3", "name": "O3", "shortName": "o3", "costTier": "high" },
        { "id": "o4-mini", "name": "O4 Mini", "shortName": "o4-mini", "costTier": "medium" }
      ],
      "defaultModel": "o4-mini",
      "authType": "api_key",
      "apiKeyProvider": "openai",
      "apiKeyEnvVar": "OPENAI_API_KEY",
      "enabled": true,
      "isDefault": false,
      "order": 1
    }
  },
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
  ],
  "defaults": {
    "fallbackAgent": "claude-code",
    "fallbackModel": "opus"
  }
}
```

### Agent Program Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (e.g., `claude-code`, `codex-cli`) |
| `name` | string | Yes | Display name (e.g., "Claude Code") |
| `command` | string | Yes | CLI command to execute (e.g., `claude`, `codex`) |
| `models` | array | Yes | Available models with id, name, shortName, costTier |
| `defaultModel` | string | Yes | shortName of default model |
| `flags` | string[] | Yes | Additional CLI flags (can be empty) |
| `authType` | enum | Yes | `subscription`, `api_key`, or `none` |
| `apiKeyProvider` | string | If api_key | Provider name in credentials vault |
| `apiKeyEnvVar` | string | If api_key | Environment variable for API key |
| `enabled` | boolean | Yes | Whether agent is available for use |
| `isDefault` | boolean | Yes | Whether this is the fallback agent |
| `order` | number | No | Sort order (lower = higher priority) |
| `instructionsFile` | string | No | Path to instructions file to inject |
| `startupPattern` | string | No | Custom command pattern |
| `taskInjection` | enum | No | How to send task: `stdin`, `prompt`, `argument` |

### Authentication Types

| Type | Description | Configuration |
|------|-------------|---------------|
| `subscription` | Uses CLI's built-in auth | Run `claude auth` or similar |
| `api_key` | Requires API key | Set in Settings → API Keys |
| `none` | No authentication | For local models |

**API Key Flow:**
1. Add API key to credentials vault (Settings → API Keys)
2. Set `apiKeyProvider` to match the key name (e.g., `openai`)
3. Set `apiKeyEnvVar` for injection (e.g., `OPENAI_API_KEY`)
4. IDE injects key as environment variable when spawning

### Routing Rules

Routing rules map task attributes to agent/model selection. Rules are evaluated in order; first match wins.

**Condition Types:**

| Type | Description | Example Values |
|------|-------------|----------------|
| `label` | Match task labels | `security`, `frontend`, `backend` |
| `type` | Match task type | `bug`, `feature`, `task`, `chore`, `epic` |
| `priority` | Match priority level | `0`, `1`, `2`, `3` |
| `project` | Match project name | `jat`, `chimaro` |
| `epic` | Match parent epic | `jat-abc` |

**Operators:**

| Operator | Description | Use With |
|----------|-------------|----------|
| `equals` | Exact match | All types |
| `contains` | Value contains string | `label` |
| `startsWith` | Value starts with | `label`, `project` |
| `regex` | Regular expression | All types |
| `lt`, `lte`, `gt`, `gte` | Numeric comparison | `priority` |

**Example Rules:**

```json
{
  "routingRules": [
    {
      "id": "high-priority-to-opus",
      "name": "High Priority Tasks",
      "description": "Use most capable model for urgent work",
      "conditions": [
        { "type": "priority", "operator": "lte", "value": "1" }
      ],
      "agentId": "claude-code",
      "modelOverride": "opus",
      "enabled": true,
      "order": 1
    },
    {
      "id": "frontend-to-sonnet",
      "name": "Frontend Work",
      "conditions": [
        { "type": "label", "operator": "contains", "value": "frontend" }
      ],
      "agentId": "claude-code",
      "modelOverride": "sonnet",
      "enabled": true,
      "order": 2
    },
    {
      "id": "docs-to-haiku",
      "name": "Documentation",
      "conditions": [
        { "type": "label", "operator": "contains", "value": "docs" }
      ],
      "agentId": "claude-code",
      "modelOverride": "haiku",
      "enabled": true,
      "order": 3
    }
  ]
}
```

### Spawn Flow

When spawning an agent for a task:

1. **Load Config** - Read `~/.config/jat/agents.json`
2. **Evaluate Rules** - Check each routing rule in order
3. **Select Agent** - Use matched rule or fallback
4. **Validate** - Check agent is enabled and auth is available
5. **Build Command** - Construct spawn command from config
6. **Create Session** - Start tmux session with agent

**Spawn API Request:**
```json
POST /api/work/spawn
{
  "taskId": "jat-abc",
  "agentId": "claude-code",    // Optional: override routing
  "model": "opus"               // Optional: override model
}
```

**Spawn API Response:**
```json
{
  "success": true,
  "session": {
    "sessionName": "jat-BrightCanyon",
    "agentName": "BrightCanyon",
    "agentProgram": "claude-code",
    "model": "opus",
    "matchedRule": "high-priority-to-opus"
  }
}
```

### Adding a New Agent Type

1. **Add to agents.json:**
   ```json
   {
     "programs": {
       "my-agent": {
         "id": "my-agent",
         "name": "My Agent",
         "command": "my-agent-cli",
         "models": [
           { "id": "model-v1", "name": "Model V1", "shortName": "v1" }
         ],
         "defaultModel": "v1",
         "flags": [],
         "authType": "api_key",
         "apiKeyProvider": "my-provider",
         "apiKeyEnvVar": "MY_AGENT_API_KEY",
         "enabled": true,
         "isDefault": false
       }
     }
   }
   ```

2. **Add API Key (if needed):**
   - Go to Settings → API Keys → Custom Keys
   - Add key with name matching `apiKeyProvider`

3. **Create Routing Rules (optional):**
   - Go to Settings → Agents → Routing Rules
   - Add rule to route specific tasks to this agent

### Migration from Legacy Config

The first access to `/api/config/agents` triggers migration:

1. **Read Legacy Config:**
   - `~/.config/jat/projects.json` → `defaults.model`, `defaults.claude_flags`

2. **Create Claude Code Entry:**
   ```json
   {
     "claude-code": {
       "id": "claude-code",
       "name": "Claude Code",
       "command": "claude",
       "defaultModel": "opus",  // from defaults.model
       "flags": ["--dangerously-skip-permissions"],  // from defaults.claude_flags
       "enabled": true,
       "isDefault": true
     }
   }
   ```

3. **Mark as Migrated:**
   - Set `migratedAt` timestamp
   - Original settings remain in projects.json (backward compatible)

### IDE Settings UI

**Settings → Agents tab:**

1. **Agent Programs Section:**
   - List of configured agents with status indicators
   - Enable/disable toggle per agent
   - Default agent star indicator
   - Configure button opens editor drawer

2. **Routing Rules Section:**
   - Visual rule editor (similar to ReviewRulesEditor)
   - Drag to reorder rules
   - Add/edit/delete rules
   - Test rules against sample tasks

3. **Quick Add:**
   - Preset templates for common agents
   - One-click setup with sensible defaults

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config/agents` | List all agent programs with status |
| `POST` | `/api/config/agents` | Add new agent program |
| `PUT` | `/api/config/agents/[id]` | Update agent program |
| `DELETE` | `/api/config/agents/[id]` | Remove agent program |
| `PUT` | `/api/config/agents/[id]/default` | Set as default agent |
| `GET` | `/api/config/agents/routing` | Get routing rules |
| `PUT` | `/api/config/agents/routing` | Update routing rules |
| `POST` | `/api/config/agents/evaluate` | Test which agent for a task |

### TypeScript Types

```typescript
import type {
  AgentProgram,
  AgentModel,
  AgentAuthType,
  AgentRoutingRule,
  RoutingCondition,
  RoutingConditionType,
  AgentConfigFile,
  RoutingResult
} from '$lib/types/agentProgram';
```

See `ide/src/lib/types/agentProgram.ts` for complete type definitions.

### Best Practices

1. **Start Simple** - Use Claude Code as the only agent initially
2. **Add Routing Incrementally** - Start with one rule, test, then add more
3. **Use Cost Tiers** - Route low-priority tasks to cheaper models
4. **Test Rules** - Use the evaluate endpoint to verify routing
5. **Keep Fallback Reliable** - Default agent should always work

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Agent shows "unavailable" | Auth not configured | Check Settings → API Keys or run `claude auth` |
| Wrong agent selected | Rule order | Rules are first-match; check order |
| Spawn fails | Command not found | Install CLI: `npm install -g @anthropic/claude-code` |
| API key not found | Wrong provider name | Match `apiKeyProvider` to key name in vault |

### Files Reference

**Types:**
- `ide/src/lib/types/agentProgram.ts` - TypeScript interfaces

**API:**
- `ide/src/routes/api/config/agents/` - CRUD endpoints
- `ide/src/routes/api/work/spawn/` - Uses routing for agent selection

**UI:**
- `ide/src/lib/components/config/AgentProgramsEditor.svelte` - Programs UI
- `ide/src/lib/components/config/AgentRoutingRulesEditor.svelte` - Rules UI

**Config:**
- `~/.config/jat/agents.json` - Agent configuration
- `~/.config/jat/credentials.json` - API keys (referenced by `apiKeyProvider`)
