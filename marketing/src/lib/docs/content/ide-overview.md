# IDE Overview

The JAT IDE is a SvelteKit 5 application that gives you a real-time control panel for every agent session running across your projects. Built with Tailwind CSS v4 and DaisyUI, it runs locally on `http://127.0.0.1:5174`.

## Starting the IDE

The fastest way to launch is the `jat` command with no arguments.

```bash
jat
```

This single command checks dependencies, starts the dev server, opens your browser, and checks for updates (throttled to once per 24 hours). If updates are available you get a prompt before anything installs.

For manual control:

```bash
cd ~/code/jat/ide
npm install
npm run dev
```

The IDE discovers projects automatically by scanning `~/code/` for directories with a `.beads/` folder. No configuration file needed for basic use.

## Main pages

| Page | URL | What it shows |
|------|-----|---------------|
| Work | `/work` | Live agent sessions with terminal output, signals, questions |
| Tasks | `/tasks` | Task table with sorting, filtering, grouping, and bulk actions |
| Kanban | `/kanban` | Drag-and-drop board grouped by status or priority |
| Agents | `/agents` | Agent registry with token usage, activity sparklines |
| Files | `/files` | Multi-tab file editor with Monaco, quick finder |
| Source | `/source` | Git timeline showing commits per project |
| Settings | `/settings` | API keys, agent programs, review rules, shortcuts |

Every page supports multi-project filtering through URL parameters. Bookmark `/tasks?project=jat` and it always opens filtered to JAT tasks.

## Tech stack

The IDE uses **SvelteKit 5** with runes syntax (`$state`, `$derived`, `$props`, `$effect`). Styling runs on **Tailwind CSS v4** which requires different syntax than v3.

```css
/* src/app.css - Tailwind v4 syntax */
@import "tailwindcss";

@plugin "daisyui" {
  themes: light, dark, nord --default, sunset, cyberpunk, ...;
}
```

If themes stop working, the most common fix is clearing the build cache:

```bash
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

## Theme switching

The IDE ships with 32 DaisyUI themes. Access the theme picker through the user avatar dropdown in the top navigation bar.

Theme selection persists via `localStorage`. The system uses three components working together:

- **Layout** (`+layout.svelte`) initializes the `theme-change` library on mount
- **Theme Manager** (`themeManager.ts`) handles `data-theme` attribute and storage
- **Theme Selector** (`ThemeSelector.svelte`) renders the picker UI with color previews

The default theme is `nord`. Every DaisyUI color token (`base-100`, `primary`, `secondary`, `accent`, etc.) adapts automatically when you switch.

## Sound effects

The IDE plays subtle audio cues for state transitions. These are configurable through Settings and stored in the preferences store.

| Event | Sound | When it plays |
|-------|-------|---------------|
| Task created | Chime | New task added to Beads |
| Session complete | Success tone | Agent finishes task |
| Question asked | Alert | Agent needs input |
| Error | Warning tone | Session crash or failure |

Sounds can be muted globally or per-event type in Settings. The implementation lives in `src/lib/utils/soundEffects.ts` with volume controlled through `src/lib/stores/preferences.svelte.ts`.

## Auto-update mechanism

When you launch with `jat` (no arguments), the CLI checks for updates against the git remote.

```bash
jat update            # Pull latest changes
jat update --check    # Check without installing
jat update --disable  # Turn off auto-check
jat update --status   # Show install path and version
```

Updates run `git pull origin master` behind the scenes. Local changes get stashed and restored. Symlinks in `~/.local/bin/` refresh automatically after each update.

To disable the launch-time check permanently, add to `~/.config/jat/projects.json`:

```json
{
  "defaults": {
    "auto_update": false
  }
}
```

## See also

- [Work Sessions](/docs/work-sessions/) for live session monitoring
- [Task Views](/docs/task-views/) for task management pages
- [Keyboard Shortcuts](/docs/keyboard-shortcuts/) for navigation hotkeys
- [File Explorer](/docs/file-explorer/) for the built-in editor
