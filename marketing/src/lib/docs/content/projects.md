# Projects configuration

SQUAD discovers projects automatically. Any git repository under `~/code/` that has a `.squad/` directory shows up in the IDE. No config file needed for the basics.

## Auto-discovery

The IDE scans `~/code/` for directories containing `.squad/`. When it finds one, that project appears in the sidebar, task views and agent routing.

To make any repo a SQUAD project:

```bash
cd ~/code/my-project
st init
```

The `st init` command creates a `.squad/` directory with the task database. The SQLite database stays local.

After initialization, refresh the IDE to see your project.

You can also add projects from the IDE. Go to the Tasks page and click "Add Project." This runs `st init` for you and adds the project to the IDE automatically.

## What gets committed

The `.squad/` directory contains both committed and ignored files:

| Path | Committed | Purpose |
|------|-----------|---------|
| `.squad/.gitignore` | Yes | Ignore rules for SQLite files |
| `.squad/tasks.db*` | No | Local SQLite task database |

Do not add `.squad/` to your root `.gitignore`. The `.squad/.gitignore` file handles ignoring the SQLite files.

## The projects.json file

For projects that need custom ports, colors, or database URLs, edit `~/.config/squad/projects.json`:

```json
{
  "projects": {
    "my-project": {
      "name": "MY-PROJECT",
      "path": "~/code/my-project",
      "port": 3000,
      "server_path": "~/code/my-project/frontend",
      "description": "Customer-facing web app",
      "active_color": "#22c55e",
      "inactive_color": "#6b7280"
    }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `path` | Yes | Project directory path |
| `port` | No | Dev server port (enables server controls in IDE) |
| `server_path` | No | Where to run `npm run dev` (defaults to `path`) |
| `description` | No | Shown in the IDE sidebar |
| `active_color` | No | Badge color when agents are working |
| `inactive_color` | No | Badge color when idle |
| `database_url` | No | Connection string for database tools |

## Global defaults

The `defaults` section controls settings that apply across all projects:

```json
{
  "defaults": {
    "terminal": "alacritty",
    "editor": "code",
    "tools_path": "~/.local/bin",
    "claude_flags": "--dangerously-skip-permissions",
    "model": "opus",
    "agent_stagger": 15,
    "claude_startup_timeout": 20,
    "file_watcher_ignored_dirs": [".git", "node_modules", ".svelte-kit"]
  },
  "projects": {}
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `terminal` | alacritty | Terminal emulator for new sessions |
| `editor` | code | Code editor command |
| `model` | opus | Default Claude model (opus, sonnet, haiku) |
| `agent_stagger` | 15 | Seconds between agent spawns in batch mode |
| `claude_startup_timeout` | 20 | Seconds to wait for Claude TUI to start |
| `claude_flags` | --dangerously-skip-permissions | CLI flags passed to Claude |
| `file_watcher_ignored_dirs` | [".git", "node_modules", ...] | Directories that wont trigger change detection badges |

## File watcher ignored directories

The IDE watches for file changes in your projects and shows a "changes detected" badge in the sidebar. The `file_watcher_ignored_dirs` setting prevents noisy directories from triggering false positives.

Default ignored directories: `.git`, `node_modules`, `.svelte-kit`, `.next`, `.nuxt`, `.vite`, `.cache`, `dist`, `build`, `.turbo`, `.parcel-cache`, `__pycache__`, `.pytest_cache`, `target`, `vendor`.

## Supported terminals

The `terminal` setting controls which terminal emulator the IDE opens for new sessions:

| Terminal | Value |
|----------|-------|
| Alacritty | `alacritty` |
| Kitty | `kitty` |
| GNOME Terminal | `gnome-terminal` |
| Konsole | `konsole` |
| xterm (fallback) | `xterm` |

## Multi-project aggregation

The IDE aggregates tasks from all projects into a single view. Task IDs are prefixed with the project name (like `squad-abc` or `chimaro-xyz`) so there are never collisions.

You can filter by project using the dropdown in the navigation bar. The URL updates with a `?project=chimaro` parameter so filtered views are bookmarkable.

The `st` CLI works within whatever project directory youre in. Run `st ready` in `~/code/squad` and you see only SQUAD tasks. Run it in `~/code/chimaro` and you see Chimaro tasks. The IDE shows everything.

## See also

- [Installation](/docs/installation/) - First-time setup
- [Agent Programs](/docs/agent-programs/) - Configure which AI agents to use
- [Credentials & Secrets](/docs/credentials/) - API keys and per-project secrets
