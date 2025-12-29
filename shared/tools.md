## Agent Tools: Lightweight bash tools for common operations

**Location:** Tools symlinked to `~/bin/` after running `./install.sh`

### Agent Mail (11 tools)

| Tool | Purpose | Key Options |
|------|---------|-------------|
| `am-register` | Create agent identity | `--name X --program claude-code` |
| `am-inbox` | Check messages | `--unread`, `--hide-acked`, `--thread X` |
| `am-send` | Send message | `--from X --to Y --thread Z` |
| `am-reply` | Reply to message | `am-reply MSG_ID "text" --agent X` |
| `am-ack` | Acknowledge message | `am-ack MSG_ID --agent X` |
| `am-reserve` | Lock files | `"glob/**" --agent X --ttl 3600 --reason "task-id"` |
| `am-release` | Unlock files | `"glob/**" --agent X` |
| `am-reservations` | List locks | `--agent X` |
| `am-search` | Search messages | `"query" --thread X` |
| `am-agents` | List agents | (no args) |
| `am-whoami` | Current identity | `--agent X` |

**Broadcast recipients:** `@active` (last 60min), `@recent` (24h), `@all`, `@project:name`

**Example:**
```bash
am-send "Subject" "Body" --from Me --to @active --importance high --thread task-123
```

### Database (3 tools)

| Tool | Purpose |
|------|---------|
| `db-query` | Run SQL, returns JSON |
| `db-sessions` | List connections |
| `db-schema` | Show table structure |

### Monitoring (5 tools)

| Tool | Purpose |
|------|---------|
| `edge-logs` | Stream edge function logs |
| `quota-check` | API usage stats |
| `error-log` | Error log entries |
| `job-monitor` | Job status |
| `perf-check` | Performance metrics |

### Development (7 tools)

| Tool | Purpose |
|------|---------|
| `type-check-fast` | TypeScript check |
| `lint-staged` | Lint staged files |
| `migration-status` | DB migration state |
| `component-deps` | Dependency tree |
| `route-list` | List routes |
| `build-size` | Bundle size |
| `env-check` | Validate env vars |

### Browser Automation (7 tools)

| Tool | Purpose | Example |
|------|---------|---------|
| `browser-start.js` | Launch Chrome | `--headless` |
| `browser-nav.js` | Navigate | `browser-nav.js URL` |
| `browser-eval.js` | Run JS in page | `"document.title"` |
| `browser-screenshot.js` | Capture screen | `--output /tmp/x.png` |
| `browser-pick.js` | Click selector | `--selector "button"` |
| `browser-cookies.js` | Get/set cookies | `--set "name=value"` |

**browser-eval quirk:** Supports multi-statement code with `return`:
```bash
browser-eval.js "const x = 5; const y = 10; return x + y"
```

### Media / Image Generation (3 tools)

| Tool | Purpose |
|------|---------|
| `gemini-image` | Generate image from prompt |
| `gemini-edit` | Edit existing image |
| `gemini-compose` | Combine 2-14 images |

**Requires:** `GEMINI_API_KEY` environment variable

### Beads Helper

`bd-epic-child` - Set epic→child dependency correctly

**Why it exists:** `bd dep add A B` means "A depends on B" - easy to get backwards!

```bash
bd-epic-child jat-epic jat-child  # Epic blocked until child completes
```

### JAT Completion

`jat-complete-bundle` - Generate CompletionBundle JSON via LLM

**Purpose:** Gathers git context and task info, calls Anthropic API to generate a structured completion bundle for the `jat-signal complete` command.

| Option | Description |
|--------|-------------|
| `--task <id>` | Task ID (required) |
| `--agent <name>` | Agent name (required) |
| `--mode <mode>` | `review_required` (default) or `auto_proceed` |
| `--next-task <id>` | Next task ID (for auto_proceed mode) |

**Requires:** `ANTHROPIC_API_KEY` environment variable

**Example:**
```bash
# Generate bundle and emit signal
BUNDLE=$(jat-complete-bundle --task jat-abc --agent FreeOcean)
jat-signal complete "$BUNDLE"

# Auto-proceed to next task
jat-complete-bundle --task jat-abc --agent FreeOcean --mode auto_proceed --next-task jat-def
```

**What it does:**
1. Fetches task details from Beads
2. Collects git status, diff stats, and recent commits
3. Sends context to LLM to generate structured summary
4. Outputs JSON suitable for `jat-signal complete`

### Quick Patterns

**Reserve → Work → Release:**
```bash
am-reserve "src/**/*.ts" --agent $AGENT_NAME --ttl 3600 --reason "task-123"
# ... work ...
am-release "src/**/*.ts" --agent $AGENT_NAME
```

**Broadcast to active agents:**
```bash
am-send "Alert" "Message" --from Me --to @active --importance high
```

**Check inbox:**
```bash
am-inbox $AGENT_NAME --unread --hide-acked
```

### More Info

Every tool has `--help`:
```bash
am-send --help
browser-eval.js --help
```
