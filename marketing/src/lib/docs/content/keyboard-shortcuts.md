# Keyboard Shortcuts

JAT uses keyboard shortcuts for fast navigation and common actions. All shortcuts use the Alt key as the primary modifier since its less likely to conflict with browser defaults.

## Global shortcuts

These work from any page in the IDE.

| Shortcut | Action | Description |
|----------|--------|-------------|
| Alt+N | Create New Task | Opens TaskCreationDrawer |
| Alt+E | Epic Swarm | Opens Epic Swarm modal for batch agent launch |
| Alt+S | Start Next | Opens dropdown to spawn agent on next ready task |
| Alt+Shift+P | Add Project | Opens project creation drawer |
| Ctrl+` | Toggle Terminal | Opens/closes the terminal output drawer |
| Ctrl+Shift+F | Global Search | Opens file search across all projects |

## Session shortcuts

These target the currently hovered session on the Work page. Hover over a SessionCard first, then press the shortcut.

| Shortcut | Action | Description |
|----------|--------|-------------|
| Alt+A | Attach Terminal | Opens a terminal window attached to the session |
| Alt+K | Kill Session | Terminates the tmux session |
| Alt+I | Interrupt | Sends Ctrl+C to the session |
| Alt+P | Pause Session | Pauses the agent's current work |
| Alt+R | Restart | Restarts a stopped session |
| Alt+Shift+C | Copy Contents | Copies session output to clipboard |

The hovered session is tracked through mouse events on SessionCard components. If no session is hovered when you press a session shortcut, nothing happens.

## Files page shortcuts

These are active when the Files page editor is focused.

| Shortcut | Action | Description |
|----------|--------|-------------|
| Ctrl+S | Save File | Writes current file to disk |
| Alt+W | Close Tab | Closes the active editor tab |
| Alt+P | Quick Finder | Opens fuzzy file search |
| Ctrl+F | Find in File | Opens Monaco's find dialog |
| Ctrl+H | Find and Replace | Opens Monaco's replace dialog |

## System shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| Escape | Close | Closes open drawers, modals, and dropdowns |
| Alt+1 through Alt+9 | Jump to Session | Focuses the Nth visible session card |

## How shortcuts work

The shortcut system uses a Svelte 5 store (`keyboardShortcuts.svelte.ts`) that manages two maps:

- **Global shortcuts** for IDE-wide actions with factory defaults
- **Command shortcuts** for user-assigned slash command bindings

Both maps persist in `localStorage`. The store initializes on layout mount and registers a global `keydown` listener.

```typescript
// Matching a keyboard event to a shortcut
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parsed = parseShortcut(shortcut);
    if (parsed.alt !== event.altKey) return false;
    if (parsed.ctrl !== event.ctrlKey) return false;
    if (parsed.shift !== event.shiftKey) return false;
    return event.key.toLowerCase() === parsed.key.toLowerCase();
}
```

The system handles platform differences. On macOS, Alt maps to Option and the display format uses symbols (the option glyph for Alt, the command symbol for Meta). On Linux and Windows, shortcuts display as text labels like `Alt+N`.

## Customizing shortcuts

Open Settings and navigate to the Shortcuts tab. Every global shortcut shows its current binding with a "Record" button to capture a new key combination.

**Requirements for custom shortcuts:**

- Must include at least one modifier (Alt, Ctrl, or Meta)
- Must include a main key (letter, number, or special key like Escape)
- Cannot duplicate an existing shortcut

The Settings UI shows conflict warnings in real-time. If you try to assign Alt+K to a new action but it already maps to "Kill Session," you'll see a warning with the conflicting action name.

```typescript
// Conflict detection
const conflict = findGlobalShortcutConflict('Alt+K', 'my-new-action');
if (conflict) {
    console.log(`Conflicts with: ${conflict}`);
}
```

Reset any shortcut to its default with the reset button. "Reset All" restores every shortcut to factory defaults.

## Browser conflict avoidance

The shortcut system deliberately uses Alt as the primary modifier because standard browser shortcuts use Ctrl (Ctrl+C, Ctrl+V, Ctrl+T, etc.). This avoids most conflicts.

Shortcuts that do use Ctrl (like Ctrl+S for save and Ctrl+` for terminal) call `event.preventDefault()` to override the browser default. The validation system warns if you try to assign a shortcut that conflicts with a known browser binding.

| Blocked pattern | Browser action | Alternative |
|-----------------|----------------|-------------|
| Ctrl+C | Copy | Alt+Shift+C |
| Ctrl+V | Paste | (not overridable) |
| Ctrl+T | New tab | Alt+T |
| Ctrl+W | Close tab | Alt+W (files only) |

## See also

- [IDE Overview](/docs/ide-overview/) for page navigation
- [Work Sessions](/docs/work-sessions/) for session controls
- [File Explorer](/docs/file-explorer/) for editor shortcuts
