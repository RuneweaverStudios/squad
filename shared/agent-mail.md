## Agent Mail: coordination for multi-agent workflows

What it is
- A mail-like layer that lets coding agents coordinate asynchronously via lightweight bash tools.
- Provides identities, inbox/outbox, searchable threads, and advisory file reservations, with human-auditable artifacts in Git.
- Pure bash + SQLite implementation (database: `~/.agent-mail.db`)

Why it's useful
- Prevents agents from stepping on each other with explicit file reservations (leases) for files/globs.
- Keeps communication out of your token budget by storing messages in SQLite database.
- Simple bash commands with `--help` flags.
- 80x token savings vs MCP-based approach (saves ~32K tokens)

How to use effectively
1) Same repository
   - Register an identity: `am-register --name AgentName --program claude-code --model sonnet-4.5 && export AGENT_NAME=AgentName`
   - Reserve files before you edit: `am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --exclusive --reason "jat-123"`
   - Communicate with threads: `am-send "Subject" "Body" --from Agent1 --to Agent2 --thread jat-123`
   - Check inbox: `am-inbox AgentName --unread`
   - Acknowledge messages: `am-ack 5 --agent AgentName`

2) Across different repos in one project (e.g., Next.js frontend + FastAPI backend)
   - Register each agent with their respective project paths
   - Use shared `thread_id` (e.g., ticket key like "jat-123") across repos for clean communication
   - Keep reservation patterns specific (e.g., `frontend/**` vs `backend/**`)

Common pitfalls
- "from_agent not registered": always run `am-register` first
- "FILE_RESERVATION_CONFLICT": adjust patterns, wait for expiry, or use non-exclusive reservation
- Run `am-whoami` to check your current agent identity
