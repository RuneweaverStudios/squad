# CLI reference

Every SQUAD tool supports `--help` for detailed usage. This page covers the most-used commands across all tool categories.

## squad (IDE and project management)

```bash
squad                      # Launch IDE, check for updates
squad chimaro 4 --auto     # Spawn 4 agents on chimaro project
squad chimaro 4 --claude   # Claude-only (no npm/browser/IDE)
squad update               # Pull latest updates
squad update --check       # Check without installing
squad update --status      # Show installation path and version
```

## st (SQUAD task management)

```bash
# Creating tasks
st create "Fix login bug" --type bug --priority 1 --description "..." --labels security,auth
st create "Add search" --type feature --priority 2 --deps squad-abc

# Listing and viewing
st list --status open         # List open tasks
st ready --json               # Get ready tasks (no blockers)
st show squad-abc               # Show task details

# Updating tasks
st update squad-abc --status in_progress --assignee AgentName
st close squad-abc --reason "Completed"

# Dependencies
st dep add squad-abc squad-xyz    # abc depends on xyz
st dep remove squad-abc squad-xyz # Remove dependency
st dep tree squad-abc           # Show dependency tree
st dep tree squad-abc --reverse # Show what depends on abc
st dep cycles                 # Find circular dependencies
```

## am-* (Agent Registry)

```bash
# Identity
am-register --name AgentName --program claude-code --model sonnet-4.5
am-whoami
am-agents

# File declarations (via task system)
st update squad-abc --status in_progress --assignee AgentName --files "src/**/*.ts"
```

Cross-session context is handled by agent memory (`.squad/memory/`), not messaging.

## squad-signal (state tracking)

```bash
squad-signal working '{"taskId":"squad-abc","taskTitle":"Fix bug"}'
squad-signal needs_input '{"taskId":"squad-abc","question":"Which approach?"}'
squad-signal review '{"taskId":"squad-abc","summary":["Added login"]}'
squad-signal complete '{"taskId":"squad-abc","agentName":"Agent",...}'
squad-signal-validate /tmp/squad-signal-tmux-session.json
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
squad-secret stripe           # Get secret value
squad-secret --list            # List all secrets
squad-secret --export          # Output export statements

# Review rules
st-review-rules                            # Show all rules
st-review-rules --type bug --max-auto 1    # Set rule
st-check-review squad-abc                    # Check single task
st-check-review --batch                    # Check all tasks

# Utilities
squad-step committing --task squad-abc --title "Fix bug" --agent AgentName
st-epic-child squad-abc squad-def              # Set epic->child dependency
```

## Quick reference table

| Category | Tool Count | Prefix |
|----------|-----------|--------|
| Agent Registry | 4 | `am-*` |
| Task CLI | 5 | `st*` |
| Browser | 12 | `browser-*` |
| Database | 4 | `db-*` |
| Signal | 3 | `squad-signal*` |
| Media | 7 | `gemini-*`, `avatar-*` |
| Core/Review | 6 | `st-check-*`, `st-review-*`, `squad-secret` |

## See also

- [Browser Automation](/docs/browser-automation/) - Detailed browser tool guide
- [Database Tools](/docs/database-tools/) - Query and schema tools
- [Media Tools](/docs/media-tools/) - Image generation
- [Agent Registry](/docs/agent-registry/) - Agent identity management
