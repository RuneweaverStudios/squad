## Agent Tools: Lightweight bash tools for common operations

**Location:** Tools symlinked to `~/.local/bin/` after running `./install.sh`

### Directory Structure

```
tools/
├── core/         # Database, monitoring, credentials, task review, skills (18 tools)
├── mail/         # Agent Registry (identity)
├── browser/      # Browser automation via CDP (12 tools)
├── media/        # Image generation with Gemini (7 tools)
├── scheduler/    # Task scheduling daemon (cron + one-shot spawning)
├── search/       # Unified search (tasks, memory, files)
├── scripts/      # Installation and setup (33 scripts)
└── signal/       # JAT signal emission (3 tools)
```

---

### Agent Registry (4 tools)

| Tool | Purpose | Key Options |
|------|---------|-------------|
| `am-register` | Create agent identity | `--name X --program claude-code` |
| `am-agents` | List agents | (no args) |
| `am-whoami` | Current identity | `--agent X` |
| `am-delete-agent` | Remove agent | `AGENT_NAME [--force]` |

> **Note:** File declarations are managed via `jt update --files "glob/**"` on the task itself.
> Files are auto-cleared when the task is closed.

---

### Core Tools (tools/core/)

Database, monitoring, credentials, and task review tools.

| Tool | Purpose |
|------|---------|
| `jat-secret` | Retrieve secrets from credentials store |
| `db-query` | Run SQL, returns JSON |
| `db-sessions` | List database connections |
| `db-schema` | Show table structure |
| `db-connection-test` | Test database connectivity |
| `edge-logs` | Stream Supabase edge function logs |
| `lint-staged` | Lint staged git files |
| `jt-check-review` | Check if task needs human review |
| `jt-review-rules` | Display review rules for project |
| `jt-review-rules-loader` | Load/parse review rules from config |
| `jt-set-review-override` | Set review override for a task |
| `backup-jat.sh` | Backup task database |
| `rollback-jat.sh` | Rollback task database to backup |
| `jat-skills` | Skill catalog, installer, and local management |

**jat-secret usage:**
```bash
jat-secret <name>       # Get secret value
jat-secret --list       # List all secrets
jat-secret --export     # Output export statements
jat-secret --env <name> # Get env var name for a key
```

**jat-skills usage:**
```bash
# Catalog (browse remote skills)
jat-skills search <query>   # Search skills by keyword
jat-skills list-available    # List all catalog skills
jat-skills info <skill-id>   # Show skill details
jat-skills refresh           # Force refresh cache
jat-skills sources           # Show source status

# Install & manage (local skills)
jat-skills install <name-or-url>  # Install from catalog or URL
jat-skills list                   # List installed skills
jat-skills enable <name>          # Enable an installed skill
jat-skills disable <name>         # Disable an installed skill
jat-skills uninstall <name>       # Remove an installed skill
jat-skills update <name>          # Re-fetch from source
jat-skills sync                   # Manually sync agent links

jat-skills --json            # JSON output (combine with any command)
```

**Agent link syncing:**

When you install, enable, disable, uninstall, or update a skill, `jat-skills` automatically syncs agent links so all supported agent programs can discover the skill:

| Agent | Discovery Method | Link Location |
|-------|-----------------|---------------|
| Claude Code | Symlink to SKILL.md | `~/.claude/commands/{name}.md` |
| Pi | Directory symlink | `~/.pi/agent/skills/{id}/` |
| Codex, Gemini, OpenCode, Aider | Prompt injection at spawn | Skill summary injected into bootstrap prompt |

- Orphan symlinks (from uninstalled/disabled skills) are cleaned up automatically
- Existing user commands/skills are never overwritten (conflict safety)
- Run `jat-skills sync` to manually repair links if needed

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

JAT signal emission for IDE state updates.

| Tool | Purpose |
|------|---------|
| `jat-signal` | Emit status signals to IDE |
| `jat-signal-validate` | Validate signal JSON against schema |
| `jat-signal-schema.json` | JSON schema for signal payloads |

**Signal types:** `starting`, `working`, `needs_input`, `review`, `completing`, `complete`

**Example:**
```bash
jat-signal working '{"taskId":"jat-abc","taskTitle":"Add feature","approach":"..."}'
```

---

### Search Tools (tools/search/)

Unified search across tasks, memory, and files.

| Tool | Purpose |
|------|---------|
| `jat-search` | Meta search or per-source subcommands |

**Usage:**
```bash
jat-search "query"                     # Meta search (all sources)
jat-search tasks "query" [--json]      # FTS5 task search
jat-search memory "query"              # FTS5 + vector memory search
jat-search files "query"               # ripgrep + filename search
jat-search "query" --summarize         # Meta search with LLM synthesis
```

**Options:** `--project PATH`, `--limit N`, `--json`, `--summarize`, `--verbose`

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
| `setup-tmux.sh` | Configure tmux for JAT |
| `setup-global-claude-md.sh` | Setup global CLAUDE.md |
| `install-agent-mail.sh` | Initialize Agent Registry database |
| `install-hooks.sh` | Install Claude Code hooks |
| `install-whisper.sh` | Install whisper.cpp for voice input |

**JAT Workflow:**
| Script | Purpose |
|--------|---------|
| `jat-step` | Execute completion step with signal emission |
| `jat-complete-bundle` | Generate structured completion bundle via LLM |
| `jat-doctor` | Diagnose JAT installation issues |
| `jt-epic-child` | Set epic→child dependency correctly |

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
| `migrate-jomarchy-agent-tools-to-jat.sh` | Migration helper |
| `migrate-task-images.sh` | Migrate task image paths |

**jat-step usage:**
```bash
jat-step <step> --task <id> --title <title> --agent <name> [--type <type>]
```

| Step | Action | Signal |
|------|--------|--------|
| `verifying` | Emit only (agent does verification) | completing (0%) |
| `committing` | git add + commit | completing (25%) |
| `closing` | jt close | completing (50%) |
| `releasing` | Capture session log | completing (75%) |
| `complete` | Generate bundle + emit complete signal | complete (100%) |

**Requires:** `ANTHROPIC_API_KEY` environment variable (for `complete` step)

---

### Quick Patterns

**Declare files → Work → Close (auto-clears):**
```bash
jt update task-123 --status in_progress --assignee $AGENT_NAME --files "src/**/*.ts"
# ... work ...
jt close task-123 --reason "Completed"  # files auto-cleared
```

### More Info

Every tool has `--help`:
```bash
am-register --help
browser-eval.js --help
```
