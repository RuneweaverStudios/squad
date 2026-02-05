# CLI reference

Every JAT tool supports `--help` for detailed usage. This page covers the most-used commands across all tool categories.

## jat (IDE and project management)

```bash
jat                      # Launch IDE, check for updates
jat chimaro 4 --auto     # Spawn 4 agents on chimaro project
jat chimaro 4 --claude   # Claude-only (no npm/browser/IDE)
jat update               # Pull latest updates
jat update --check       # Check without installing
jat update --status      # Show installation path and version
```

## jt (JAT task management)

```bash
# Creating tasks
jt create "Fix login bug" --type bug --priority 1 --description "..." --labels security,auth
jt create "Add search" --type feature --priority 2 --deps jat-abc

# Listing and viewing
jt list --status open         # List open tasks
jt ready --json               # Get ready tasks (no blockers)
jt show jat-abc               # Show task details

# Updating tasks
jt update jat-abc --status in_progress --assignee AgentName
jt close jat-abc --reason "Completed"

# Dependencies
jt dep add jat-abc jat-xyz    # abc depends on xyz
jt dep remove jat-abc jat-xyz # Remove dependency
jt dep tree jat-abc           # Show dependency tree
jt dep tree jat-abc --reverse # Show what depends on abc
jt dep cycles                 # Find circular dependencies
```

## am-* (Agent Mail)

```bash
# Identity
am-register --name AgentName --program claude-code --model sonnet-4.5
am-whoami
am-agents

# Messaging
am-send "Subject" "Body" --from Agent1 --to Agent2 --thread jat-abc
am-reply MSG_ID "Reply text" --agent AgentName
am-inbox AgentName --unread --hide-acked
am-ack MSG_ID --agent AgentName
am-search "query" --thread jat-abc

# File reservations
am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --exclusive --reason "jat-abc"
am-release "src/**/*.ts" --agent AgentName
am-reservations --agent AgentName
```

Broadcast recipients: `@active` (last 60min), `@recent` (24h), `@all`, `@project:name`.

## jat-signal (state tracking)

```bash
jat-signal working '{"taskId":"jat-abc","taskTitle":"Fix bug"}'
jat-signal needs_input '{"taskId":"jat-abc","question":"Which approach?"}'
jat-signal review '{"taskId":"jat-abc","summary":["Added login"]}'
jat-signal complete '{"taskId":"jat-abc","agentName":"Agent",...}'
jat-signal-validate /tmp/jat-signal-tmux-session.json
```

Signal types: `starting`, `working`, `needs_input`, `review`, `completing`, `complete`.

## browser-* (browser automation)

```bash
browser-start.js             # Connect to Chrome via CDP
browser-nav.js URL           # Navigate to URL
browser-eval.js "JS code"   # Run JavaScript in page
browser-screenshot.js --output /tmp/screenshot.png
browser-pick.js --selector "button.submit"
browser-wait.js --text "loaded"
browser-cookies.js --set "name=value"
browser-console.js           # Stream console output
browser-network.js           # Monitor network requests
browser-snapshot.js          # Capture DOM snapshot
```

## db-* (database tools)

```bash
db-query "SELECT * FROM agents LIMIT 5"   # SQL query, JSON output
db-schema                                   # Show table structure
db-sessions                                 # List connections
db-connection-test                          # Verify connectivity
```

## Other tools

```bash
# Credentials
jat-secret stripe           # Get secret value
jat-secret --list            # List all secrets
jat-secret --export          # Output export statements

# Review rules
jt-review-rules                            # Show all rules
jt-review-rules --type bug --max-auto 1    # Set rule
jt-check-review jat-abc                    # Check single task
jt-check-review --batch                    # Check all tasks

# Utilities
jat-step committing --task jat-abc --title "Fix bug" --agent AgentName
jt-epic-child jat-abc jat-def              # Set epic->child dependency
```

## Quick reference table

| Category | Tool Count | Prefix |
|----------|-----------|--------|
| Agent Mail | 14 | `am-*` |
| Task CLI | 5 | `jt*` |
| Browser | 12 | `browser-*` |
| Database | 4 | `db-*` |
| Signal | 3 | `jat-signal*` |
| Media | 7 | `gemini-*`, `avatar-*` |
| Core/Review | 6 | `jt-check-*`, `jt-review-*`, `jat-secret` |

## See also

- [Browser Automation](/docs/browser-automation/) - Detailed browser tool guide
- [Database Tools](/docs/database-tools/) - Query and schema tools
- [Media Tools](/docs/media-tools/) - Image generation
- [Agent Mail](/docs/agent-mail/) - Messaging system
