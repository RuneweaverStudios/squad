# Changelog

All notable changes to JAT (Joe's Agent Tools) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Task Summary tab in task detail pane showing completion report, suggested tasks, and cross-agent intel
- Add/Add & Start buttons for creating follow-up tasks directly from Summary tab
- **Settings UI for API Keys** - Configure Anthropic, Google, OpenAI keys via IDE instead of editing .bashrc
- **Per-project secrets** - Store Supabase credentials, database passwords per project
- **Custom API keys** - Define your own API keys with custom env var names for hooks/scripts
- **`jat-secret` bash tool** - Retrieve secrets in scripts: `jat-secret stripe`, `eval $(jat-secret --export)`
- Supabase panel integration with credentials system (checks credentials.json before .env)
- Initial public release of JAT
- Beads Task IDE (SvelteKit 5)
- Agent Mail coordination system
- Browser automation tools (11 tools)
- Media generation tools (avatar, image generation)
- JAT workflow commands (start, complete, verify, etc.)
- Multi-project support with automatic detection
- Epic task management with dependency tracking
- Token usage tracking per agent
- Session automation rules system
- Voice-to-text support (local whisper.cpp)
- File explorer with Monaco editor
- Real-time WebSocket/SSE updates
- Swarm attack mode for parallel agent execution

### Changed
- Migrated from jomarchy-agent-tools to JAT branding
- Upgraded to Tailwind CSS v4
- Improved theme system with 32 DaisyUI themes

### Security
- **Secure credential storage** - API keys stored in `~/.config/jat/credentials.json` with 0600 permissions
- Credentials fallback chain: credentials.json → environment variables → .env files
- Path traversal protection in file operations
- Sensitive file patterns blocked

## [0.9.0] - 2024-12-15 (Pre-release)

### Added
- Initial dashboard implementation
- Basic Agent Mail functionality
- Core browser tools
- Beads task tracking

## Notes

JAT evolved from a collection of bash scripts and Claude commands into a comprehensive
IDE for agent orchestration. This v1.0.0 release represents the first public version
of the integrated platform.