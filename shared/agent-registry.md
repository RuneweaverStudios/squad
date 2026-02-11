## Agent Registry: identity and file locks for multi-agent workflows

What it is
- A registry that gives coding agents persistent identities and advisory file locks.
- Prevents agents from stepping on each other with explicit file reservations (leases) for files/globs.
- Pure bash + SQLite implementation (database: `~/.agent-mail.db`)

Core tools (always used)
- `am-register` - Create agent identity
- `am-agents` - List all registered agents
- `am-whoami` - Check current agent identity
- `am-reserve` - Lock files before editing
- `am-release` - Unlock files when done
- `am-reservations` - List active file locks

How to use effectively
1) Register an identity:
   `am-register --name AgentName --program claude-code --model sonnet-4.5`
2) Reserve files before you edit:
   `am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --exclusive --reason "jat-123"`
3) Release when done:
   `am-release "src/**/*.ts" --agent AgentName`

Messaging tools (available but not required in workflows)
- `am-send`, `am-inbox`, `am-reply`, `am-ack`, `am-search` - available for rare manual coordination
- These are NOT used in `/jat:start` or `/jat:complete` workflows
- Agent memory (`.jat/memory/`) replaces messaging for cross-session context

Common pitfalls
- "from_agent not registered": always run `am-register` first
- "FILE_RESERVATION_CONFLICT": adjust patterns, wait for expiry, or use non-exclusive reservation
- Run `am-whoami` to check your current agent identity
