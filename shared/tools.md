## Agent Tools: Lightweight bash tools for common operations

**Unified agent orchestration toolkit** from jat repo.

**Installation:** Clone `~/code/jat` and run `./install.sh`

**Location:** Tools are symlinked to `~/bin/` for system-wide access.

**Note:** When working in a specific project, check that project's `CLAUDE.md` for additional project-specific tools.

### All Available Tools (Generic)

Following Mario Zechner's "prompts are code" philosophy, each tool is documented with inputs, outputs, state changes, and examples to enable precise reasoning about tool composition and workflows.

**Agent Mail (11 tools)**

`am-register`
- Input: Agent name, program, model, optional task description
- Output: Registration confirmation or error
- State: Creates agent identity in SQLite database
- Example: `am-register --name AgentName --program claude-code --model sonnet-4.5 && export AGENT_NAME=AgentName --task "Frontend work"`

`am-inbox`
- Input: Agent name, optional flags (--unread, --hide-acked, --thread, --limit N, --json)
- Output: List of messages (text or JSON)
- State: Read-only
- Flag Combinations: Can combine --unread and --hide-acked for cleanest inbox view
- Examples:
  - Basic: `am-inbox AgentName --unread`
  - Clean view: `am-inbox AgentName --unread --hide-acked` (filters broadcasts you've acknowledged)
  - Thread-specific: `am-inbox AgentName --thread bd-123`

`am-send`
- Input: Subject, body, from-agent, to-agent(s), optional thread-id, flags
- Output: Message ID
- State: Creates message in agent mail archive
- Broadcast Support: @active, @recent, @all, @project:name
- Examples:
  - Basic: `am-send "Subject" "Body text" --from Agent1 --to Agent2 --thread bd-123`
  - Broadcast: `am-send "Update" "Status" --from Dev --to @active --importance high`
  - Custom window: `am-send "Urgent" "Need help" --from Dev --to @active --active-window 15 --importance urgent`
  - Project-scoped: `am-send "Team update" "Sprint done" --from Lead --to @project:jat`
  - Mixed: `am-send "Review needed" "PR ready" --from Dev --to @active,SeniorDev`
- Flags: --active-window N (minutes for @active, default: 60), --importance, --ack

`am-reply`
- Input: Message ID, reply body, agent name
- Output: Reply message ID
- State: Adds reply to thread, updates thread metadata
- Example: `am-reply 5 "Reply text" --agent AgentName`

`am-ack`
- Input: Message ID, agent name
- Output: Acknowledgment confirmation
- State: Marks message as acknowledged
- Example: `am-ack 5 --agent AgentName`

`am-reserve`
- Input: File patterns (globs), agent name, TTL seconds, optional --exclusive, --reason
- Output: Reservation ID or conflict error
- State: Creates file reservation, blocks conflicting reservations
- Example: `am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --exclusive --reason "bd-123"`

`am-release`
- Input: File patterns (globs), agent name
- Output: Release confirmation
- State: Removes file reservations
- Example: `am-release "src/**/*.ts" --agent AgentName`

`am-reservations`
- Input: Optional project path, optional --agent filter
- Output: List of active reservations with agent, files, expiry
- State: Read-only
- Example: `am-reservations --agent AgentName`

`am-search`
- Input: Search query, optional thread-id filter
- Output: Matching messages with context
- State: Read-only
- Example: `am-search "authentication bug" --thread bd-123`

`am-agents`
- Input: Optional project path
- Output: List of registered agents with last activity
- State: Read-only
- Example: `am-agents`

`am-whoami`
- Input: Agent name (optional, uses $AGENT_NAME env var)
- Output: Current agent identity and project
- State: Read-only
- Example: `am-whoami --agent AgentName`

**Database (3 tools)**

`db-query`
- Input: SQL query string
- Output: JSON array of rows (stdout)
- State: Read-only, auto-applies LIMIT if missing for safety
- Example: `db-query "SELECT * FROM users WHERE role='admin'"`

`db-sessions`
- Input: Optional --active flag
- Output: List of database connections with queries and duration
- State: Read-only
- Example: `db-sessions --active`

`db-schema`
- Input: Optional table name to filter
- Output: Table definitions, columns, indexes, constraints
- State: Read-only
- Example: `db-schema users`

**Monitoring (5 tools)**

`edge-logs`
- Input: Function name, optional --follow, --errors, --since
- Output: Log stream (stdout)
- State: Read-only
- Example: `edge-logs video-generator --follow --errors`

`quota-check`
- Input: Optional --model filter
- Output: API usage stats (requests, tokens, costs) by model
- State: Read-only
- Example: `quota-check --model openai-gpt4`

`error-log`
- Input: Optional --level, --since, --limit
- Output: Error log entries with stack traces
- State: Read-only
- Example: `error-log --level error --since 1h`

`job-monitor`
- Input: Optional job ID or --type filter
- Output: Job status (pending, running, failed, completed)
- State: Read-only
- Example: `job-monitor --type video-generation`

`perf-check`
- Input: Optional route or component name
- Output: Performance metrics (response time, memory, queries)
- State: Read-only
- Example: `perf-check /api/chat`

**Development (7 tools)**

`type-check-fast`
- Input: Optional file/directory paths
- Output: TypeScript errors (stderr) or success
- State: Read-only
- Example: `type-check-fast src/lib/components`

`lint-staged`
- Input: None (uses git staged files)
- Output: Lint errors and warnings
- State: Read-only, runs on git staged files only
- Example: `lint-staged`

`migration-status`
- Input: None
- Output: List of applied/pending migrations with timestamps
- State: Read-only
- Example: `migration-status`

`component-deps`
- Input: Component file path
- Output: Dependency tree (imports, used by)
- State: Read-only
- Example: `component-deps src/lib/components/MediaSelector.svelte`

`route-list`
- Input: Optional --api or --pages filter
- Output: All routes with methods, handlers, middleware
- State: Read-only
- Example: `route-list --api`

`build-size`
- Input: None
- Output: Build output size by chunk, total, comparison to previous
- State: Read-only
- Example: `build-size`

`env-check`
- Input: Optional environment name (dev/staging/prod)
- Output: Missing/invalid environment variables
- State: Read-only
- Example: `env-check production`

**Browser Automation (7 tools)**

`browser-start.js`
- Input: Optional --profile path, --headless flag
- Output: Browser PID and DevTools port
- State: Launches Chrome process
- Example: `browser-start.js --headless`

`browser-nav.js`
- Input: URL or --new-tab flag
- Output: Navigation confirmation
- State: Changes browser page
- Example: `browser-nav.js https://example.com`

`browser-eval.js`
- Input: JavaScript code string (supports both expressions and multi-statement code)
- Output: Evaluation result (JSON)
- State: Executes in browser context (may modify page)
- Examples:
  - Single expression: `browser-eval.js "document.title"`
  - Multi-statement: `browser-eval.js "const x = 5; const y = 10; return x + y"`
  - Complex setup: `browser-eval.js "window.__errors = []; console.error = (msg) => window.__errors.push(msg); return 'ready'"`

`browser-screenshot.js`
- Input: Optional --selector, --fullpage flags
- Output: Path to saved screenshot file
- State: Creates image file in /tmp
- Example: `browser-screenshot.js --fullpage`

`browser-pick.js`
- Input: None (interactive)
- Output: CSS selector for clicked element
- State: Read-only, waits for user click
- Example: `browser-pick.js`

`browser-cookies.js`
- Input: Optional cookie name or --set name=value
- Output: Cookie values (JSON)
- State: Gets or sets browser cookies
- Example: `browser-cookies.js --set "auth=token123"`

`browser-hn-scraper.js`
- Input: Optional --limit N
- Output: JSON array of Hacker News front page stories
- State: Read-only
- Example: `browser-hn-scraper.js --limit 10`

**Media / Image Generation (3 tools)**

`gemini-image`
- Input: Text prompt, optional output path, --model, --aspect, --size
- Output: Generated image file path
- State: Creates image file (default: /tmp/gemini-TIMESTAMP.png)
- Models: gemini-2.5-flash-image (fast, default), gemini-3-pro-image-preview (quality, 4K)
- Examples:
  - Basic: `gemini-image "A sunset over mountains"`
  - With options: `gemini-image "Product photo of a coffee mug" product.png --aspect 1:1`
  - High quality: `gemini-image "Detailed art" art.png --model gemini-3-pro-image-preview --size 2K`

`gemini-edit`
- Input: Input image path, instruction text, optional output path, --model
- Output: Edited image file path
- State: Creates new image file (default: /tmp/gemini-edit-TIMESTAMP.png)
- Examples:
  - Basic: `gemini-edit photo.png "Remove the background"`
  - With output: `gemini-edit portrait.jpg "Make it look like a Van Gogh painting" art.png`
  - Pro model: `gemini-edit product.png "Add a subtle shadow" --model gemini-3-pro-image-preview`

`gemini-compose`
- Input: 2-14 image files, instruction text, optional --output, --model
- Output: Composed image file path
- State: Creates new image file (default: /tmp/gemini-compose-TIMESTAMP.png)
- Detection: Arguments that exist as files are treated as images; first non-file argument is the instruction
- Examples:
  - Basic: `gemini-compose bg.png person.png "Place person on background"`
  - With output: `gemini-compose style.jpg photo.jpg "Apply art style" --output styled.png`
  - Multiple: `gemini-compose a.png b.png c.png "Combine into collage"`

**Environment:** All gemini-* tools require `GEMINI_API_KEY` environment variable.

### Tool Composition & Workflows

Following Mario's "prompts are code" philosophy, tools are designed to compose via pipes, redirects, and sequential execution:

**Query → Process → Act Pattern:**
```bash
# Find admin users, then get detailed activity for each
db-query "SELECT id FROM users WHERE role='admin'" | while read id; do
  user-activity $id --since 7d
done

# Check pending videos, then monitor their generation logs
video-status --all-pending --json | jq -r '.[] | .batch_id' | while read batch; do
  edge-logs video-generator --follow | grep $batch
done
```

**Reserve → Work → Release Pattern:**
```bash
# Reserve files, do work, then release (prevents conflicts)
am-reserve "src/lib/**/*.ts" --agent Builder --ttl 3600 --exclusive --reason "bd-123"
# ... make changes ...
am-release "src/lib/**/*.ts" --agent Builder

# Announce start via Agent Mail
am-send "[bd-123] Starting refactor" "Working on auth system" --from Builder --to Team --thread bd-123
```

**Parallel Data Gathering:**
```bash
# Gather multiple metrics simultaneously
{
  db-query "SELECT COUNT(*) FROM users" > /tmp/user-count.json &
  quota-check --model openai-gpt4 > /tmp/quota.json &
  edge-logs api-handler --since 1h --errors > /tmp/errors.log &
  wait
}
# Process combined results
```

**Conditional Execution:**
```bash
# Test database, proceed only if healthy
if db-connection-test; then
  db-seed-mini --clean
  test-route POST /api/users '{"email":"test@example.com"}'
else
  echo "Database unavailable" | am-send "DB Alert" --from Monitor --to Team
fi
```

### Integration with Agent Mail & Beads

Use together for maximum efficiency:
```bash
# 1. Pick work
bd ready --json

# 2. Reserve files
am-reserve src/**/*.ts --agent $AGENT_NAME --ttl 3600 --reason "bd-123"

# 3. Query database
db-query "SELECT COUNT(*) FROM invocations WHERE status='pending'"

# 4. Monitor edge function
edge-logs video-generator --errors

# 5. Complete and release
bd close bd-123 --reason "Completed"
am-release src/**/*.ts --agent $AGENT_NAME
```

### Broadcast Messaging: Examples and Best Practices

Agent Mail supports broadcast messaging to coordinate multiple agents simultaneously. Use broadcasts for time-sensitive announcements, deployments, incidents, and team coordination.

#### Broadcast Recipients

- **@active** - Agents active in last 60 minutes (configurable with --active-window)
- **@recent** - Agents active in last 24 hours
- **@all** - ALL registered agents (use sparingly)
- **@project:name** - All agents in specific project (e.g., @project:jat)
- **Mixed** - Combine broadcasts with specific agents (e.g., @active,SeniorDev)

#### Working Examples

**1. Basic broadcast to active agents:**
```bash
# Notify active agents about deployment
am-send "Deployment starting" \
  "Pausing work for 10min deployment to production. Will notify when complete." \
  --from DeployBot \
  --to @active \
  --importance high \
  --thread deploy-2025-01 \
  --ttl 3600
```

**2. Project-specific team update:**
```bash
# Update all agents working on jat project
am-send "Feature branch ready" \
  "New API endpoints available in feature/user-auth branch. Please pull latest changes." \
  --from Lead \
  --to @project:jat \
  --thread feature-user-auth \
  --importance normal
```

**3. Urgent all-hands alert:**
```bash
# Critical system-wide notification
am-send "URGENT: Production database down" \
  "Database outage detected. All agents pause work immediately. Incident response team notified." \
  --from Monitor \
  --to @all \
  --importance urgent \
  --ack-required \
  --thread incident-db-2025
```

**4. Custom active window (short-term coordination):**
```bash
# Notify only very recently active agents (last 15 min)
am-send "Standup in 5 minutes" \
  "Daily standup starting in 5min. Join video call: https://meet.example.com/daily" \
  --from ScrumMaster \
  --to @active \
  --active-window 15 \
  --importance high \
  --ttl 600
```

**5. Mixed recipients (broadcast + specific agents):**
```bash
# Notify active agents + ensure senior dev gets it even if not recently active
am-send "PR ready for review" \
  "Critical security fix ready. Need urgent review before deployment." \
  --from Dev \
  --to @active,SeniorDev,SecurityLead \
  --thread pr-1234 \
  --importance high \
  --ack-required
```

**6. Time-sensitive deployment coordination:**
```bash
# Before deployment
am-send "Deploy alert: 5 minutes" \
  "Production deployment starting in 5min. Complete current tasks and pause work." \
  --from DeployBot \
  --to @active \
  --active-window 30 \
  --importance urgent \
  --ttl 600 \
  --ack-required

# After deployment
am-send "Deploy complete: Resume work" \
  "Deployment successful. All systems normal. Resume work." \
  --from DeployBot \
  --to @active \
  --importance normal \
  --thread deploy-2025-01
```

**7. Checking broadcasts (filtering acknowledged messages):**
```bash
# View only unread broadcasts you haven't acknowledged yet
am-inbox AgentName --unread --hide-acked

# View all unread messages in specific thread
am-inbox AgentName --unread --thread deploy-2025-01

# View all messages (including acknowledged) for thread
am-inbox AgentName --thread incident-db-2025
```

**8. Acknowledging broadcast messages:**
```bash
# View unread messages and get message IDs
am-inbox AgentName --unread --json | jq -r '.[] | "\(.id): \(.subject)"'

# Acknowledge specific broadcast
am-ack 42 --agent AgentName

# Acknowledge all unread broadcasts in batch
am-inbox AgentName --unread --json | jq -r '.[].id' | xargs -I {} am-ack {} --agent AgentName
```

#### Best Practices

**When to use each broadcast type:**
- **@active** - Time-sensitive coordination (deployments, incidents, standups)
- **@project:name** - Project-specific announcements (feature updates, branch changes)
- **@all** - Critical system-wide alerts only (use sparingly to avoid noise)
- **@recent** - Broader awareness without urgency (weekly updates, documentation changes)

**Setting appropriate TTLs (time-to-live):**
- **Short (300-600s)** - Immediate actions (standups, imminent deployments)
- **Medium (1800-3600s)** - Same-day relevance (deployment windows, PR reviews)
- **Long (86400s+)** - Extended relevance (feature announcements, documentation)
- **No TTL** - Permanent record (incident reports, major decisions)

**Using --ack-required effectively:**
- **Always use for:** Critical alerts, deployment coordination, incident response
- **Consider for:** PR reviews, handoff requests, blocking decisions
- **Skip for:** Informational updates, status reports, non-urgent announcements

**Combining with thread_id:**
- Group related broadcasts in same thread for context
- Use meaningful thread names (deploy-YYYY-MM-DD, incident-NAME, feature-BRANCH)
- Makes it easier to review conversation history
- Helps track acknowledgments and responses

**Avoiding broadcast fatigue:**
- Use @active instead of @all whenever possible
- Set appropriate active windows (don't spam recently active agents)
- Use TTLs to auto-expire transient messages
- Reserve @all for genuine emergencies only
- Prefer threaded replies over new broadcasts when discussing existing topics

**Effective active window settings:**
- **5-15 min** - Immediate coordination (standups, breaks, urgent questions)
- **30-60 min** - Normal active window (deployments, PR reviews, handoffs)
- **120+ min** - Broader reach when urgency is moderate

#### Common Patterns

**Deployment coordination pattern:**
```bash
# 1. Pre-deployment warning
am-send "Deploy: T-5min" "..." --to @active --active-window 30 --ttl 600 --ack-required

# 2. During deployment
am-send "Deploy: In progress" "..." --to @active --importance urgent --thread deploy-X

# 3. Post-deployment
am-send "Deploy: Complete" "..." --to @active --thread deploy-X
```

**Incident response pattern:**
```bash
# 1. Alert
am-send "INCIDENT: Database outage" "..." --to @all --importance urgent --ack-required --thread incident-X

# 2. Updates (use replies to same thread)
am-reply MSG_ID "Update: Root cause identified" --agent IncidentLead

# 3. Resolution
am-send "RESOLVED: Database restored" "..." --to @all --thread incident-X
```

**Handoff pattern:**
```bash
# Notify active agents + specific expert
am-send "Handoff: Need frontend expertise" \
  "Task auth-ui-123 needs frontend work. Can someone take over?" \
  --from BackendDev \
  --to @active,FrontendLead \
  --thread auth-ui-123 \
  --importance high
```

### Getting More Information

Every tool has a `--help` flag with detailed usage, options, and examples:
```bash
am-send --help          # See all options for sending messages
db-query --help         # Learn about query safety and limits
browser-eval.js --help  # Browser automation options
```
