# SvelteKit + Supabase Stack Tools

**11 specialized tools** for AI-assisted development with SvelteKit and Supabase projects.

## What's Included

**Database Schema Tools (3):**
- `error-log` - Query error logs (assumes `error_logs` table)
- `quota-check` - Check AI usage quotas (assumes `ai_usage_logs` table)
- `job-monitor` - Monitor background jobs

**SvelteKit-Specific (2):**
- `component-deps` - Analyze Svelte component dependencies
- `route-list` - List all SvelteKit routes

**Project Development (6):**
- `migration-status` - Check Supabase migration status
- `type-check-fast` - Fast TypeScript type checking
- `build-size` - Analyze bundle sizes
- `cache-clear` - Clear application caches
- `env-check` - Validate environment variables
- `perf-check` - Performance analysis

## Requirements

- SvelteKit project structure (`src/routes/`, `src/lib/`)
- Supabase project (for database tools)
- TypeScript (for type checking)
- Node.js and npm

## Installation

These tools are installed automatically when you select the "SvelteKit + Supabase" stack during squad installation.

Or install manually:
```bash
cd ~/code/squad/stacks/sveltekit-supabase
bash install.sh
```

Tools are installed to:
- `~/.local/bin/` - Globally available
- Or `.claude/tools/` - Project-specific (if run from project directory)

## Usage

All tools have `--help` flags:
```bash
component-deps --help
route-list --help
error-log --help
```

**Examples:**
```bash
# Analyze component dependencies
component-deps MediaSelector.svelte --used-by

# List all API routes
route-list --api

# Check recent errors
error-log --last 1h --pattern "timeout"

# Check database migrations
migration-status

# Fast type check
type-check-fast
```

## Customization

These tools assume certain database schemas (e.g., `error_logs`, `ai_usage_logs`). You can:
1. Use as examples and adapt to your schema
2. Create these tables in your project
3. Modify the tools in `.claude/tools/` for your needs

## Philosophy

Following [What if you don't need MCP?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/) - simple bash tools that save 30,000+ tokens while being more composable than MCP servers.
