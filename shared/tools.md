## Agent Tools: Lightweight bash tools for common operations

**Location:** Tools symlinked to `~/.local/bin/` after running `./install.sh`

### Directory Structure

```
tools/
├── core/         # Database, monitoring, credentials, task review, skills (18 tools)
├── agents/       # Agent Registry (identity)
├── browser/      # Browser automation via CDP (12 tools)
├── media/        # Image generation with Gemini (7 tools)
├── scheduler/    # Task scheduling daemon (cron + one-shot spawning)
├── search/       # Unified search (tasks, memory, files)
├── scripts/      # Installation and setup (33 scripts)
└── signal/       # SQUAD signal emission (3 tools)
```

---

### Agent Registry (4 tools)

| Tool | Purpose | Key Options |
|------|---------|-------------|
| `am-register` | Create agent identity | `--name X --program claude-code` |
| `am-agents` | List agents | (no args) |
| `am-whoami` | Current identity | `--agent X` |
| `am-delete-agent` | Remove agent | `AGENT_NAME [--force]` |

> **Note:** File declarations are managed via `st update --files "glob/**"` on the task itself.
> Files are auto-cleared when the task is closed.

---

### Core Tools (tools/core/)

Database, monitoring, credentials, and task review tools.

| Tool | Purpose |
|------|---------|
| `squad-secret` | Retrieve secrets from credentials store |
| `db-query` | Run SQL, returns JSON |
| `db-sessions` | List database connections |
| `db-schema` | Show table structure |
| `db-connection-test` | Test database connectivity |
| `edge-logs` | Stream Supabase edge function logs |
| `lint-staged` | Lint staged git files |
| `st-check-review` | Check if task needs human review |
| `st-review-rules` | Display review rules for project |
| `st-review-rules-loader` | Load/parse review rules from config |
| `st-set-review-override` | Set review override for a task |
| `backup-squad.sh` | Backup task database |
| `rollback-squad.sh` | Rollback task database to backup |
| `squad-skills` | Skill catalog, installer, and local management |

**squad-secret usage:**
```bash
squad-secret <name>       # Get secret value
squad-secret --list       # List all secrets
squad-secret --export     # Output export statements
squad-secret --env <name> # Get env var name for a key
```

**squad-skills usage:**
```bash
# Catalog (browse remote skills)
squad-skills search <query>   # Search skills by keyword
squad-skills list-available    # List all catalog skills
squad-skills info <skill-id>   # Show skill details
squad-skills refresh           # Force refresh cache
squad-skills sources           # Show source status

# Install & manage (local skills)
squad-skills install <name-or-url>  # Install from catalog or URL
squad-skills list                   # List installed skills
squad-skills enable <name>          # Enable an installed skill
squad-skills disable <name>         # Disable an installed skill
squad-skills uninstall <name>       # Remove an installed skill
squad-skills update <name>          # Re-fetch from source
squad-skills sync                   # Manually sync agent links

squad-skills --json            # JSON output (combine with any command)
```

**Agent link syncing:**

When you install, enable, disable, uninstall, or update a skill, `squad-skills` automatically syncs agent links so all supported agent programs can discover the skill:

| Agent | Discovery Method | Link Location |
|-------|-----------------|---------------|
| Claude Code | Symlink to SKILL.md | `~/.claude/commands/{name}.md` |
| Pi | Directory symlink | `~/.pi/agent/skills/{id}/` |
| Codex, Gemini, OpenCode, Aider | Prompt injection at spawn | Skill summary injected into bootstrap prompt |

- Orphan symlinks (from uninstalled/disabled skills) are cleaned up automatically
- Existing user commands/skills are never overwritten (conflict safety)
- Run `squad-skills sync` to manually repair links if needed

---

### Browser Automation (tools/browser/)

Chrome DevTools Protocol (CDP) based browser control via Node.js.

| Tool | Purpose | Example |
|------|---------|---------|
| `browser-start.js` | Launch Chrome with CDP | `--headless` |
| `browser-nav.js` | Navigate to URL | `browser-nav.js URL` |
| `browser-eval.js` | Execute JS in page | `"document.title"` |
| `browser-screenshot.js` | Capture screenshot | `--output /tmp/x.png` |
| `browser-pick.js` | Click element by selector | `--selector "button"` |
| `browser-cookies.js` | Get/set cookies | `--set "name=value"` |
| `browser-wait.js` | Wait for condition | `--text "loaded"` |
| `browser-console.js` | Capture console logs | (streams output) |
| `browser-network.js` | Monitor network requests | (streams output) |
| `browser-snapshot.js` | Capture DOM snapshot | (returns HTML) |
| `browser-hn-scraper.js` | Hacker News scraper example | (demo) |

**browser-eval quirk:** Supports multi-statement code with `return`:
```bash
browser-eval.js "const x = 5; const y = 10; return x + y"
```

---

### Media / Image Generation (tools/media/)

AI image generation via Google Gemini API.

| Tool | Purpose |
|------|---------|
| `gemini-image` | Generate image from text prompt |
| `gemini-edit` | Edit existing image with prompt |
| `gemini-compose` | Combine 2-14 images into one |
| `avatar-generate` | Generate agent avatar image |
| `avatar-to-ansi` | Convert avatar to terminal ANSI art |
| `gemini-lib.sh` | Shared Gemini API helper functions |

**Requires:** `GEMINI_API_KEY` environment variable

---

### Signal Tools (tools/signal/)

SQUAD signal emission for IDE state updates.

| Tool | Purpose |
|------|---------|
| `squad-signal` | Emit status signals to IDE |
| `squad-signal-validate` | Validate signal JSON against schema |
| `squad-signal-schema.json` | JSON schema for signal payloads |

**Signal types:** `starting`, `working`, `needs_input`, `review`, `completing`, `complete`

**Example:**
```bash
squad-signal working '{"taskId":"squad-abc","taskTitle":"Add feature","approach":"..."}'
```

---

### Search Tools (tools/search/)

Unified search across tasks, memory, and files. Use `squad-search` as your primary context retrieval tool before starting work.

| Tool | Purpose |
|------|---------|
| `squad-search` | Meta search or per-source subcommands |

**Subcommands:**
```bash
squad-search "query"                     # Meta search (all sources in parallel)
squad-search tasks "query" [--json]      # Deep task search (FTS5)
squad-search memory "query"              # Memory search (FTS5 + vector hybrid)
squad-search files "query"               # File search (ripgrep + filename)
squad-search "query" --summarize         # Meta search with LLM synthesis
```

**Options:** `--project PATH`, `--limit N`, `--json`, `--summarize`, `--verbose`

**Context retrieval funnel pattern:**
```bash
# 1. Broad meta search to find relevant context
squad-search "auth middleware" --json
# Returns grouped results from tasks, memory, and files

# 2. Drill into memory for lessons learned
squad-search memory "auth race condition"
# Shows past session context with gotchas and patterns

# 3. Drill into tasks for history
squad-search tasks "OAuth timeout" --json
# Shows related/duplicate tasks with status and priority

# 4. Drill into files for code references
squad-search files "refreshToken"
# Shows file paths and matching lines via ripgrep
```

**How agents should use search:**
- Run `squad-search` at task start to gather context before writing code
- Check memory for lessons from past sessions working on similar areas
- Check tasks for duplicates or related in-progress work
- Use `--summarize` for LLM-synthesized context when results are noisy

---

### Scripts (tools/scripts/)

Installation, setup, and utility scripts.

**Installation:**
| Script | Purpose |
|--------|---------|
| `symlink-tools.sh` | Create symlinks in ~/.local/bin/ |
| `setup-repos.sh` | Initialize project repositories |
| `setup-bash-functions.sh` | Generate shell launcher functions |
| `setup-statusline-and-hooks.sh` | Install Claude Code hooks |
| `setup-tmux.sh` | Configure tmux for SQUAD |
| `setup-global-claude-md.sh` | Setup global CLAUDE.md |
| `install-agent-mail.sh` | Initialize Agent Registry database |
| `install-hooks.sh` | Install Claude Code hooks |
| `install-whisper.sh` | Install whisper.cpp for voice input |

**SQUAD Workflow:**
| Script | Purpose |
|--------|---------|
| `squad-step` | Execute completion step with signal emission |
| `squad-complete-bundle` | Generate structured completion bundle via LLM |
| `squad-doctor` | Diagnose SQUAD installation issues |
| `st-epic-child` | Set epic→child dependency correctly |

**Agent Management:**
| Script | Purpose |
|--------|---------|
| `get-current-session-id` | Get Claude Code session ID |
| `get-agents-by-state` | List agents by status |
| `get-recent-agents` | List recently active agents |
| `get-agent-task.sh` | Get agent's current task |
| `check-agent-active` | Check if agent is active |
| `list-agents-simple` | Simple agent list |
| `log-agent-activity` | Log agent activity events |

**Utilities:**
| Script | Purpose |
|--------|---------|
| `time-ago` | Format timestamp as "X minutes ago" |
| `record-gif` | Record terminal session as GIF |
| `cleanup-jsonl.sh` | Clean up old JSONL files |
| `cleanup-jsonl-cron.sh` | Cron wrapper for cleanup |
| `extract-har-timings.sh` | Extract timings from HAR files |
| `test-statusline.sh` | Test statusline display |
| `test-themes.sh` | Test IDE themes |
| `fix-hook-stdin.sh` | Fix hook stdin issues |
| `update-signal-hooks.sh` | Update signal hook scripts |
| `import-bashrc-config.sh` | Import bashrc configuration |
| `migrate-jomarchy-agent-tools-to-squad.sh` | Migration helper |
| `migrate-task-images.sh` | Migrate task image paths |

**squad-step usage:**
```bash
squad-step <step> --task <id> --title <title> --agent <name> [--type <type>]
```

| Step | Action | Signal |
|------|--------|--------|
| `verifying` | Emit only (agent does verification) | completing (0%) |
| `committing` | git add + commit | completing (25%) |
| `closing` | st close | completing (50%) |
| `releasing` | Capture session log | completing (75%) |
| `complete` | Generate bundle + emit complete signal | complete (100%) |

**Requires:** `ANTHROPIC_API_KEY` environment variable (for `complete` step)

---

### Quick Patterns

**Declare files → Work → Close (auto-clears):**
```bash
st update task-123 --status in_progress --assignee $AGENT_NAME --files "src/**/*.ts"
# ... work ...
st close task-123 --reason "Completed"  # files auto-cleared
```

### More Info

Every tool has `--help`:
```bash
am-register --help
browser-eval.js --help
```
