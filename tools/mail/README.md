# Agent Registry - Bash/SQLite Implementation

Lightweight identity system for multi-agent workflows using bash + SQLite.

## Overview

Agent Registry gives coding agents persistent identities for coordination. Built with bash scripts and SQLite, it provides:

- **Agent identities** - Register agents with names, programs, and models
- **Human-auditable** - All data in SQLite, queryable with standard tools

## Installation

Tools are automatically linked to `~/.local/bin` during setup. Ensure `~/.local/bin` is in your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### macOS Compatibility

All Agent Registry tools are fully compatible with macOS. The tools automatically detect your platform and use the appropriate commands:

**Requirements:**
- bash 3.2+ (macOS default: 3.2.57)
- sqlite3 with JSON support (macOS 10.14+)
- jq

**Install jq (if needed):**
```bash
brew install jq
```

## Database

Default location: `~/.agent-mail.db`

Override with: `export AGENT_MAIL_DB=/path/to/database.db`

## Quick Start

### 1. Register agents

```bash
# Auto-generate name
am-register --program claude-code --model sonnet-4.5 --task "Frontend work"

# Specify name
am-register --name Alice --program cursor --model gpt-4 --task "Backend"
```

### 2. List agents

```bash
am-agents
```

### 3. Check identity

```bash
am-whoami --agent Alice
```

## Tool Reference

All tools support `--help` for detailed usage.

| Tool | Purpose |
|------|---------|
| `am-register` | Register or update agent identity |
| `am-agents` | List all registered agents |
| `am-whoami` | Show agent identity |
| `am-delete-agent` | Remove agent from registry |

## File Declarations

File reservations have been replaced by `--files` on `jt` (the task CLI):

```bash
# Declare files when starting a task
jt update task-123 --status in_progress --assignee Alice --files "src/auth/**"

# Files are automatically cleared when the task is closed
jt close task-123 --reason "Done"
```

## Schema

### Tables

- `agents` - Coding assistants (name, program, model)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MAIL_DB` | `~/.agent-mail.db` | Database location |
| `AGENT_NAME` | - | Default agent name |

## Architecture

### Design Principles

1. **Bash + SQLite only** - No HTTP servers, no background daemons
2. **System dependencies** - Requires: sqlite3, jq, bash 4.0+
3. **Git-friendly** - SQLite database can be committed
4. **Cross-CLI** - Works with Claude Code, Cursor, Aider, etc.

## Troubleshooting

### Agent not found

```bash
am-register --name MyAgent --program claude-code --model sonnet-4.5
```

### Database locked

SQLite locks database during writes. If persistent:

```bash
lsof ~/.agent-mail.db  # Check for stuck connections
```

## Credits

Inspired by:
- [mcp_agent_mail](https://github.com/Dicklesworthstone/mcp_agent_mail) - Original Python/MCP implementation
- [Beads](https://github.com/steveyegge/beads) - Dependency-aware task management (original inspiration for JAT Tasks)
- [What if you don't need MCP?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/) - Token efficiency philosophy

## License

MIT
