# File Explorer

The Files page (`/files`) gives you a built-in code editor with multi-tab support, a lazy-loading file tree, and quick file finding. It works across all your JAT projects without leaving the IDE.

## FileTree with lazy loading

The left sidebar shows a tree view of your project directories. Directories load their children on-demand when you expand them, keeping the initial render fast even for large codebases.

The tree respects your file watcher ignore list. Directories like `node_modules`, `.git`, `.svelte-kit`, and `dist` are hidden by default. Configure ignored directories in `~/.config/jat/projects.json`:

```json
{
  "defaults": {
    "file_watcher_ignored_dirs": [
      ".git", "node_modules", ".svelte-kit",
      "dist", "build", "__pycache__"
    ]
  }
}
```

Click a file to open it in a new tab. The tree highlights the currently active file so you can track where you are.

## Multi-file tabs with drag-drop reordering

Open files appear as tabs above the editor. You can have as many tabs open as you want.

Drag tabs to rearrange their order. The tab order persists across page navigations and browser refreshes through localStorage. Close a tab with the X button or the Alt+W shortcut.

When you have more tabs than the container width, horizontal scrolling kicks in. The active tab scrolls into view automatically.

## Monaco editor with syntax highlighting

Files open in a Monaco editor instance (the same editor engine that powers VS Code). It provides:

- Syntax highlighting for 50+ languages
- Line numbers and minimap
- Find and replace (Ctrl+F)
- Multiple cursors
- Bracket matching and auto-closing
- Configurable font size and theme

The editor theme adapts to your selected DaisyUI theme. Dark themes get a dark editor, light themes get a light editor.

Save changes with Ctrl+S. The save operation writes directly to disk through the API endpoint. Unsaved changes show a dot indicator on the tab.

## File operations

Right-click any file or directory in the tree to access the context menu:

| Operation | Target | What it does |
|-----------|--------|--------------|
| Create File | Directory | Creates new file with name prompt |
| Create Directory | Directory | Creates new subdirectory |
| Rename | File or Directory | Inline rename with validation |
| Delete | File or Directory | Deletes with confirmation dialog |
| Send to LLM | File | Opens file content in Claude prompt |
| Create Task | File | Pre-fills a new task referencing the file |
| Copy Path | File or Directory | Copies absolute path to clipboard |

The "Send to LLM" action opens a dialog where you can ask questions about the file. It uses the Claude API or falls back to the `claude -p` CLI.

"Create Task" opens the TaskCreationDrawer with the file path pre-filled in the description. Useful when you spot something that needs fixing while browsing code.

## Quick file finder

Press Alt+P to open the quick file finder. It works like VS Code's Ctrl+P with fuzzy matching.

Type part of a filename and results appear instantly. The finder searches across all projects in your `~/code/` directory. Results are ranked by match quality and recency of access.

Press Enter to open the top result. Arrow keys navigate the list. Escape closes the finder.

## Security protections

The file explorer includes two layers of protection:

**Path traversal prevention** blocks any attempt to read or write files outside your project directories. Requests with `../` segments or symlinks pointing outside `~/code/` are rejected by the API.

**Sensitive file blocking** prevents viewing files that commonly contain secrets:

- `.env`, `.env.local`, `.env.production`
- `credentials.json`, `secrets.json`
- `*.pem`, `*.key` files
- `~/.config/jat/credentials.json`

These files show a warning instead of their contents when you try to open them. The block list is configurable but defaults to common secret file patterns.

API endpoints validate all file paths server-side. Even if a malicious request bypasses the UI, the server rejects operations on protected paths.

## See also

- [IDE Overview](/docs/ide-overview/) for the full IDE layout
- [Keyboard Shortcuts](/docs/keyboard-shortcuts/) for file editor hotkeys
- [Task Views](/docs/task-views/) for creating tasks from file context
