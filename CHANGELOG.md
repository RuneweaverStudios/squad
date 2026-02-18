# Changelog

All notable changes to SQUAD (Joe's Agent Tools) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`squad-search` unified search CLI** - Meta search across tasks (FTS5), memory (FTS5 + vector), and files (ripgrep) with subcommands, project filtering, and optional LLM synthesis (`--summarize`)
- **Skill agent syncing** - Skills installed via `squad-skills install` are automatically discovered by all agent programs. Claude Code gets symlinks in `~/.claude/commands/`, Pi gets directory symlinks in `~/.pi/agent/skills/`, and non-native agents (Codex, Gemini, OpenCode, Aider) receive skill info via prompt injection at spawn time. New `squad-skills sync` command for manual repair.
- **Task scheduling fields** - Command dropdown (default `/squad:start`), agent/model selector, schedule section (one-shot/recurring/cron), and due date picker in TaskCreationDrawer
- **Ingest feed system** - New `/ingest` page for managing RSS, Slack, and Telegram feed sources with guided setup wizard, poll history, manual poll trigger, last-polled timestamps, inline error indicators, and thread reply counts
- **Ingest daemon** - Background Node.js service (`squad-ingest`) that polls configured feed sources on schedule, with adapter architecture for RSS/Slack/Telegram
- **Slack channel detection** - Guided wizard flow for Slack source setup that auto-detects available channels via `conversations.list` API
- **Ingest server management** - Start/stop/restart ingest daemon from IDE Servers page with auto-start config option
- **Monaco context menu actions** - "Send to LLM" (Alt+L) and "Create Task from Selection" (Alt+T) available in all Monaco editors: FileEditor, MigrationViewer, and DiffViewer
- **Styled Monaco context menu** - Custom dark theme matching SQUAD FileTree style with rounded corners, oklch colors, and keybinding badges
- **Task context menus** - Right-click context menus on `/tasks` page for both open tasks (Launch, View Details, Change Status, Assign to Epic, Duplicate) and active tasks (View Details, Attach Terminal, Change Status, Duplicate, Interrupt, Pause, Complete, Close & Kill)
- Task Summary tab in task detail pane showing completion report, suggested tasks, and cross-agent intel
- Add/Add & Start buttons for creating follow-up tasks directly from Summary tab
- **Settings UI for API Keys** - Configure Anthropic, Google, OpenAI keys via IDE instead of editing .bashrc
- **Per-project secrets** - Store Supabase credentials, database passwords per project
- **Custom API keys** - Define your own API keys with custom env var names for hooks/scripts
- **`squad-secret` bash tool** - Retrieve secrets in scripts: `squad-secret stripe`, `eval $(squad-secret --export)`
- Supabase panel integration with credentials system (checks credentials.json before .env)
- Initial public release of SQUAD
- SQUAD Task IDE (SvelteKit 5)
- Agent Mail coordination system
- Browser automation tools (11 tools)
- Media generation tools (avatar, image generation)
- SQUAD workflow commands (start, complete, verify, etc.)
- Multi-project support with automatic detection
- Epic task management with dependency tracking
- Token usage tracking per agent
- Session automation rules system
- Voice-to-text support (local whisper.cpp)
- File explorer with Monaco editor
- Real-time WebSocket/SSE updates
- Swarm attack mode for parallel agent execution

### Changed
- `get-current-session-id` supports `--wait` flag for fresh startup retry
- Activity state polling is more resilient to transient network errors (Content-Length mismatches)
- Sidebar badge positions adjusted for collapsed nav icons
- Server restart endpoint supports ingest daemon
- Migrated from jomarchy-agent-tools to SQUAD branding
- Upgraded to Tailwind CSS v4
- Improved theme system with 32 DaisyUI themes

### Security
- **Secure credential storage** - API keys stored in `~/.config/squad/credentials.json` with 0600 permissions
- Credentials fallback chain: credentials.json → environment variables → .env files
- Path traversal protection in file operations
- Sensitive file patterns blocked

## [0.9.0] - 2024-12-15 (Pre-release)

### Added
- Initial dashboard implementation
- Basic Agent Mail functionality
- Core browser tools
- SQUAD task tracking

## Notes

SQUAD evolved from a collection of bash scripts and Claude commands into a comprehensive
IDE for agent orchestration. This v1.0.0 release represents the first public version
of the integrated platform.