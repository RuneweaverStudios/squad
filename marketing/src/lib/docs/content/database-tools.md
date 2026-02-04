# Database tools

JAT ships four database tools for querying, inspecting schemas, and testing connections. They work with the Agent Mail SQLite database and can be configured for project-specific databases.

## Tools overview

| Tool | Purpose | Output |
|------|---------|--------|
| `db-query` | Run SQL queries | JSON array |
| `db-schema` | Show table structure | Table definitions |
| `db-sessions` | List active connections | Session details |
| `db-connection-test` | Verify database connectivity | Pass/fail status |

## db-query

Runs SQL against the database and returns results as JSON. This is the tool agents use most often.

```bash
# Count registered agents
db-query "SELECT COUNT(*) as agent_count FROM agents"
# Output: [{"agent_count": 14}]

# List recent messages
db-query "SELECT id, subject, from_agent, created_at FROM messages ORDER BY created_at DESC LIMIT 5"

# Find file reservations
db-query "SELECT pattern, agent_name, expires_at FROM file_reservations WHERE released_at IS NULL"
```

The output is always a JSON array, even for single-row results. This makes it easy to pipe into `jq` for further processing:

```bash
db-query "SELECT name FROM agents" | jq -r '.[].name'
```

## db-schema

Shows the structure of all tables in the database. Useful when you need to understand what columns are available before writing a query.

```bash
db-schema
```

This outputs CREATE TABLE statements for every table in the Agent Mail database, including `agents`, `messages`, `projects`, `file_reservations` and others.

## db-sessions

Lists active database connections. Helpful for debugging when you suspect connection leaks or want to see whats currently accessing the database.

```bash
db-sessions
```

## db-connection-test

Quick connectivity check. Returns a pass/fail result thats useful in setup scripts and health checks.

```bash
db-connection-test
```

If the Agent Mail database at `~/.agent-mail.db` is accessible and valid, this returns success. Otherwise it reports what went wrong.

## The Agent Mail database

The primary database is `~/.agent-mail.db`, a SQLite file created during installation. It stores:

- **agents** - Registered agent identities (name, program, model)
- **messages** - All agent-to-agent communication
- **projects** - Project registry
- **file_reservations** - Advisory file locks with TTL
- **acknowledgments** - Message read receipts

You can query it directly with standard `sqlite3` if you prefer:

```bash
sqlite3 ~/.agent-mail.db "SELECT name, program, model FROM agents LIMIT 5"
```

But `db-query` is recommended because it handles JSON formatting and works consistently across the toolchain.

## Project databases

If your project uses a database (Supabase, PostgreSQL, etc.), configure the connection string in `~/.config/jat/projects.json`:

```json
{
  "projects": {
    "my-project": {
      "database_url": "postgresql://user:pass@localhost:5432/mydb"
    }
  }
}
```

Or set project secrets in the IDE under Settings > Project Secrets.

## See also

- [Agent Mail](/docs/agent-mail/) - How the messaging system uses the database
- [CLI Reference](/docs/cli-reference/) - Full command reference
- [Credentials & Secrets](/docs/credentials/) - Database password management
