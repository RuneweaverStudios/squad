# Plan: API Keys & Services Settings

## Overview

Add a centralized settings UI for managing API keys, service subscriptions, and coding agent configurations. This makes SQUAD installation more user-friendly and lays the foundation for agent-agnostic operation.

## Goals

1. **User-friendly API key management** - No more editing .bashrc or .env files
2. **Centralized credential storage** - `~/.config/squad/credentials.json`
3. **Agent-agnostic foundation** - Support Claude Code, Codex, OpenCode, Gemini Code, Aider, etc.
4. **Service tracking** - Track subscriptions and rate limits for various AI services

## Storage Design

### File: `~/.config/squad/credentials.json`

```json
{
  "apiKeys": {
    "anthropic": {
      "key": "sk-ant-api03-...",
      "addedAt": "2025-01-23T...",
      "lastVerified": "2025-01-23T..."
    },
    "google": {
      "key": "AIza...",
      "addedAt": "2025-01-23T..."
    },
    "openai": {
      "key": "sk-...",
      "addedAt": "2025-01-23T..."
    }
  },
  "services": {
    "claudeCode": {
      "tier": "max",
      "detected": true
    }
  },
  "codingAgents": {
    "default": "claude-code",
    "installed": ["claude-code", "aider"],
    "configs": {
      "claude-code": {
        "model": "opus",
        "flags": "--dangerously-skip-permissions"
      },
      "aider": {
        "model": "sonnet"
      }
    }
  }
}
```

**Security notes:**
- File permissions set to 600 (user read/write only)
- Keys masked in UI (show only last 4 chars)
- Never sent to browser in full (API returns masked versions)
- Fallback chain: credentials.json → .env → environment variables

## UI Design

### New Tab: "Credentials" in Settings category

Position: After "Defaults", before "Autopilot"

```
Settings: [Projects] [Defaults] [Credentials] [Autopilot] [Shortcuts] [Actions] [Commit]
```

### Component: `CredentialsEditor.svelte`

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  API Keys & Services                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  API KEYS                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Anthropic     sk-ant-...7x4k  [Verify] [Edit] [Delete]      │   │
│  │               ✓ Verified • Added Jan 23                      │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ Google/Gemini Not configured            [Add Key]           │   │
│  │               Required for: gemini-edit, avatar generation   │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ OpenAI        Not configured            [Add Key]           │   │
│  │               Required for: Codex integration (future)       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  CODING AGENTS                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Default Agent: [Claude Code ▼]                               │   │
│  │                                                              │   │
│  │ Installed:                                                   │   │
│  │   ✓ Claude Code (detected)    [Configure]                   │   │
│  │   ○ Aider                     [Configure]                   │   │
│  │   ○ OpenCode                  [Add]                         │   │
│  │   ○ Codex CLI                 [Add]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SUBSCRIPTIONS                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Claude Code: MAX tier (detected from ~/.claude/)            │   │
│  │ Anthropic API: Usage-based                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Phase 1: Core Infrastructure (This PR)

1. **Create credentials storage utility**
   - File: `ide/src/lib/utils/credentials.ts`
   - Functions: `getCredentials()`, `setApiKey()`, `deleteApiKey()`, `verifyApiKey()`
   - Security: File permissions, key masking

2. **Create API endpoint**
   - File: `ide/src/routes/api/config/credentials/+server.ts`
   - GET: Return credentials (keys masked)
   - PUT: Update a specific key
   - DELETE: Remove a key
   - POST /verify: Verify a key works

3. **Create CredentialsEditor component**
   - File: `ide/src/lib/components/config/CredentialsEditor.svelte`
   - API key list with add/edit/delete/verify
   - Masked key display
   - Verification status

4. **Add tab to ConfigTabs**
   - Add "Credentials" tab with key icon
   - Category: settings (after Defaults)

5. **Update config page**
   - Import and render CredentialsEditor when tab active

6. **Update suggest endpoint**
   - Read from credentials.json first
   - Fall back to .env and environment variables

### Phase 2: Coding Agent Support (Future)

7. **Agent detection utility**
   - Detect installed coding agents (claude, aider, opencode, etc.)
   - Read their configs

8. **Agent configuration UI**
   - Select default agent
   - Configure per-agent settings

### Phase 3: Service Integration (Future)

9. **Subscription detection**
   - Read Claude Code tier from ~/.claude/
   - Track API usage limits

10. **Usage dashboard**
    - Show remaining quota
    - Cost tracking

## API Key Providers

| Provider | Key Format | Used By |
|----------|-----------|---------|
| Anthropic | `sk-ant-api03-...` | Task suggestions, usage metrics |
| Google | `AIza...` | gemini-edit, gemini-image, avatar generation |
| OpenAI | `sk-...` | Future Codex integration |

## Verification Endpoints

| Provider | Verification Method |
|----------|-------------------|
| Anthropic | `POST https://api.anthropic.com/v1/messages` with minimal request |
| Google | `GET https://generativelanguage.googleapis.com/v1/models?key=...` |
| OpenAI | `GET https://api.openai.com/v1/models` with bearer token |

## Fallback Chain

When code needs an API key:
```
1. ~/.config/squad/credentials.json (new, preferred)
2. ide/.env file (legacy)
3. Environment variable (e.g., ANTHROPIC_API_KEY)
```

## Files to Create/Modify

### New Files
- `ide/src/lib/utils/credentials.ts` - Credential storage utility
- `ide/src/routes/api/config/credentials/+server.ts` - API endpoint
- `ide/src/lib/components/config/CredentialsEditor.svelte` - UI component

### Modified Files
- `ide/src/lib/components/config/ConfigTabs.svelte` - Add Credentials tab
- `ide/src/routes/config/+page.svelte` - Render CredentialsEditor
- `ide/src/routes/api/tasks/suggest/+server.js` - Use new credential source

## Security Considerations

1. **File permissions**: `credentials.json` created with mode 0600
2. **Never expose full keys**: API returns `sk-ant-...7x4k` format
3. **No keys in browser storage**: Keys stay server-side
4. **Gitignore**: `~/.config/squad/credentials.json` not in any repo
5. **Input validation**: Verify key format before storing

## Success Criteria

- [ ] Users can add API keys via Settings UI
- [ ] Keys are stored securely in ~/.config/squad/credentials.json
- [ ] Task suggestions work after adding Anthropic key
- [ ] Gemini tools work after adding Google key
- [ ] Keys display masked in UI (sk-ant-...7x4k)
- [ ] Verify button confirms key works
- [ ] Fallback to .env and env vars still works
