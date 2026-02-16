## Agent Registry: identity for multi-agent workflows

What it is
- A registry that gives coding agents persistent identities.
- Pure bash + SQLite implementation (database: `~/.agent-mail.db`)

Core tools (always used)
- `am-register` - Create agent identity
- `am-agents` - List all registered agents
- `am-whoami` - Check current agent identity

> **Note:** IDE-spawned agents are pre-registered by the spawn API.
> Only use `am-register` when starting a session manually from the CLI.

How to use effectively
1) Register an identity:
   `am-register --name AgentName --program claude-code --model sonnet-4.5`
2) Declare files when starting a task:
   `jt update task-id --status in_progress --assignee AgentName --files "src/**/*.ts"`
3) Files are auto-cleared when the task is closed (`jt close`).

Common pitfalls
- "from_agent not registered": always run `am-register` first
- Run `am-whoami` to check your current agent identity
