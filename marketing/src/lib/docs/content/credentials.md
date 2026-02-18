# Credentials and secrets

SQUAD stores API keys and project secrets securely in `~/.config/squad/credentials.json` with `0600` permissions (user read/write only). You can manage them through the Settings UI or the `squad-secret` CLI tool.

## Built-in API keys

Three providers are supported out of the box. Configure them in Settings > API Keys.

| Provider | Used For | Environment Variable |
|----------|----------|---------------------|
| Anthropic | Task suggestions, AI features | `ANTHROPIC_API_KEY` |
| Google | Gemini image generation, avatars | `GEMINI_API_KEY` |
| OpenAI | Future Codex integration | `OPENAI_API_KEY` |

Each key shows a masked value in the UI (like `sk-ant-...7x4k`), the date it was added, and when it was last verified.

## Custom API keys

For services beyond the big three, add custom keys in Settings > API Keys > Custom Keys.

Each custom key needs:
- A name (e.g. `stripe`)
- The key value
- An environment variable name (e.g. `STRIPE_API_KEY`)
- An optional description

Custom keys work identically to built-in keys. They show up in `squad-secret --list` and get injected as environment variables when spawning agent sessions.

## Per-project secrets

Some projects need their own credentials. Configure these in Settings > Project Secrets.

| Secret Type | Description | Environment Variable |
|-------------|-------------|---------------------|
| `supabase_url` | Supabase project URL | `SUPABASE_URL` |
| `supabase_anon_key` | Public anonymous key | `SUPABASE_ANON_KEY` |
| `supabase_service_role_key` | Server-side key | `SUPABASE_SERVICE_ROLE_KEY` |
| `supabase_db_password` | Database password | `SUPABASE_DB_PASSWORD` |
| `database_url` | PostgreSQL connection string | `DATABASE_URL` |

## The squad-secret CLI tool

Access credentials from bash scripts and hooks:

```bash
# Get a secret value
squad-secret stripe              # Outputs: sk_live_xxx...

# Get the env var name for a key
squad-secret --env stripe        # Outputs: STRIPE_API_KEY

# List all available keys
squad-secret --list

# Export all keys as environment variables
eval $(squad-secret --export)

# Use in a script
MY_KEY=$(squad-secret my-service)
curl -H "Authorization: Bearer $MY_KEY" https://api.example.com
```

## Fallback chain

When SQUAD needs a credential, it checks these locations in order:

1. `~/.config/squad/credentials.json` (Settings UI)
2. Environment variables (shell exports)
3. `.env` files in the project directory

This means you can set keys in whichever way fits your workflow. The Settings UI is simplest for most people, but environment variables work fine if you prefer.

## Data structure

The credentials file follows this schema:

```json
{
  "apiKeys": {
    "anthropic": { "key": "sk-ant-...", "addedAt": "2025-01-15T..." }
  },
  "customApiKeys": {
    "stripe": {
      "value": "sk_live_...",
      "envVar": "STRIPE_API_KEY",
      "description": "Payment processing",
      "addedAt": "2025-01-20T..."
    }
  },
  "projectSecrets": {
    "my-project": {
      "supabase_db_password": { "value": "...", "addedAt": "..." }
    }
  }
}
```

The file permissions are set to `0600` on creation. SQUAD never sends full key values to the browser. Only masked versions appear in the Settings UI.

## See also

- [Agent Programs](/docs/agent-programs/) - How agents use API keys
- [Projects](/docs/projects/) - Per-project configuration
- [CLI Reference](/docs/cli-reference/) - squad-secret command details
