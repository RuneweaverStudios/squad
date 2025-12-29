# Beads Task Dashboard - Development Guide

## Project Overview

Multi-project task management dashboard powered by Beads + Agent Mail. Built with SvelteKit 5, Tailwind CSS v4, and DaisyUI.

## Tech Stack

- **Framework**: SvelteKit 5 (Svelte 5 runes: `$state`, `$derived`, `$props`)
- **Styling**: Tailwind CSS v4 + DaisyUI
- **Theme Management**: `theme-change` library + custom utilities
- **Build Tool**: Vite

## Theme Switching Implementation

### Critical: Tailwind v4 Syntax

**IMPORTANT**: This project uses Tailwind CSS v4, which requires completely different configuration syntax than v3.

#### ❌ Wrong (Tailwind v3 syntax - will NOT work):
```css
/* app.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### ✅ Correct (Tailwind v4 syntax):
```css
/* src/app.css */
@import "tailwindcss";

@plugin "daisyui" {
  themes:
    light,
    dark,
    cupcake,
    bumblebee,
    emerald,
    corporate,
    synthwave,
    retro,
    cyberpunk,
    valentine,
    halloween,
    garden,
    forest,
    aqua,
    lofi,
    pastel,
    fantasy,
    wireframe,
    black,
    luxury,
    dracula,
    cmyk,
    autumn,
    business,
    acid,
    lemonade,
    night,
    coffee,
    winter,
    dim,
    nord --default,
    sunset;
}
```

### Theme Switching Architecture

The theme system consists of three components:

**1. Layout Initialization** (`src/routes/+layout.svelte`):
```typescript
import { themeChange } from 'theme-change';

onMount(() => {
  themeChange(false);
});
```

**2. Theme Manager Utility** (`src/lib/utils/themeManager.ts`):
```typescript
export function setTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

export function initializeTheme() {
  const localTheme = localStorage.getItem('theme');
  if (localTheme) {
    setTheme(localTheme);
  } else {
    setTheme('nord'); // default
  }
}
```

**3. Theme Selector Component** (`src/lib/components/ThemeSelector.svelte`):
```svelte
<script lang="ts">
  import { setTheme } from '$lib/utils/themeManager';

  let currentTheme = $state('nord');

  function handleThemeChange(themeName: string) {
    currentTheme = themeName;
    setTheme(themeName);
  }
</script>

<button onclick={() => handleThemeChange(theme.name)}>
  {theme.label}
</button>
```

### Theme Selector Location

**As of November 2024**: The ThemeSelector is integrated into the **UserProfile dropdown** in the top navigation bar, not in the sidebar.

**Location**: `src/lib/components/UserProfile.svelte`

**How to access**:
1. Click the user avatar icon in the top-right corner of the navigation bar
2. The dropdown menu contains the theme picker with all 32 DaisyUI themes
3. Theme selection persists via localStorage

**Implementation**:
```svelte
<!-- src/lib/components/UserProfile.svelte -->
<script lang="ts">
  import ThemeSelector from './ThemeSelector.svelte';
</script>

<div class="dropdown dropdown-end">
  <button class="btn btn-ghost btn-circle avatar">
    <!-- User avatar icon -->
  </button>

  <ul class="menu dropdown-content">
    <!-- User Info -->
    <li class="menu-title">
      <span>{user.name}</span>
      <span>{user.email}</span>
    </li>

    <!-- Theme Selector -->
    <li>
      <ThemeSelector compact={false} />
    </li>
  </ul>
</div>
```

**Why this location**:
- ✅ Logical grouping: User preferences consolidated in user menu
- ✅ Cleaner sidebar: Frees up space for navigation items
- ✅ Better discoverability: Theme switching associated with user settings
- ✅ Full labels: `compact={false}` allows showing theme names with color previews

**Historical note**: Previously, the ThemeSelector was located in the Sidebar bottom utilities section. It was migrated to UserProfile in November 2024 to improve UX and reduce sidebar clutter.

### Troubleshooting Themes

**Symptoms**: Theme selector works (data-theme attribute changes) but colors don't change.

**Diagnosis**:
1. Check if `app.css` uses Tailwind v4 syntax (`@import "tailwindcss"`)
2. Verify `@plugin "daisyui"` block exists with theme list
3. Check browser DevTools → Elements → `<html data-theme="...">` changes
4. Inspect stylesheet count: `Array.from(document.styleSheets).length` (should be > 1)

**Solution**: Update `app.css` to Tailwind v4 syntax with proper `@plugin "daisyui"` configuration.

## DaisyUI Common Patterns

### ⚠️ CRITICAL: Drawer Overlay Pattern

**Problem:** Drawer overlay with BOTH `for="drawer-id"` and `onclick={handleClose}` creates double-toggle bug.

```svelte
<!-- ❌ WRONG - Causes drawer to refresh instead of close -->
<div class="drawer-side">
  <label
    for="task-detail-drawer"
    class="drawer-overlay"
    onclick={handleClose}
  ></label>
</div>

<!-- ✅ CORRECT - Remove 'for' when using custom onclick -->
<div class="drawer-side">
  <label
    class="drawer-overlay"
    onclick={handleClose}
  ></label>
</div>

<!-- ✅ ALSO CORRECT - Use 'for' WITHOUT custom onclick (default DaisyUI) -->
<div class="drawer-side">
  <label
    for="task-detail-drawer"
    class="drawer-overlay"
  ></label>
</div>
```

**Why this happens:**
1. Custom `onclick` handler sets `isOpen = false`
2. `for` attribute triggers checkbox toggle (flips back to `true`)
3. Reactive `$effect` sees state change, triggers `fetchTask()` → spinner shows
4. Drawer appears to "refresh" instead of closing

**Rule:** Choose ONE approach - custom handler OR checkbox toggle, never both.

**When to use each:**
- **Custom `onclick` handler** - When you need cleanup logic (clear forms, reset state)
- **Default `for` toggle** - Simple drawers with no custom close behavior

**Fixed in (November 2024):**
- `TaskDetailDrawer.svelte` (line 467)
- `TaskCreationDrawer.svelte` (line 222)
- `AddAsset.svelte` in Chimaro project

**See also:** `/home/jw/code/chimaro/src/lib/knowl/daisyui-drawer.md` for full DaisyUI drawer documentation.

## DaisyUI Configuration

### Tailwind Config (`tailwind.config.js`)

This file exists but is **MOSTLY IGNORED** in Tailwind v4. Theme configuration must be in `app.css` using `@plugin` syntax.

```javascript
// This is here for compatibility but themes are loaded from app.css
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light', 'dark', ...] // ⚠️ This is ignored in v4!
  }
};
```

### Proper Theme Loading (v4)

Themes MUST be declared in CSS using `@plugin` syntax (see app.css above).

## Key Files

```
dashboard/
├── src/
│   ├── app.css                          # Tailwind v4 config + DaisyUI themes
│   ├── routes/
│   │   └── +layout.svelte              # Initialize theme-change library
│   ├── lib/
│   │   ├── components/
│   │   │   └── ThemeSelector.svelte    # Theme picker dropdown
│   │   └── utils/
│   │       └── themeManager.ts         # Theme utilities
│   └── ...
├── tailwind.config.js                  # Legacy config (mostly ignored in v4)
└── package.json
```

## Common Pitfalls

### 1. Using Old Tailwind Syntax
**Problem**: Using `@tailwind` directives in Tailwind v4 prevents DaisyUI themes from loading.
**Solution**: Use `@import "tailwindcss"` and `@plugin "daisyui"` syntax.

### 2. Forgetting theme-change Library
**Problem**: Themes don't persist or don't switch properly.
**Solution**: Install `theme-change` and initialize in layout: `themeChange(false)`.

### 3. Missing Theme Declaration
**Problem**: Only black/white colors, no theme colors.
**Solution**: Ensure all themes are listed in `@plugin "daisyui"` block in `app.css`.

### 4. Cache Issues
**Problem**: Changes to `app.css` don't reflect in browser.
**Solution**:
```bash
rm -rf .svelte-kit node_modules/.vite
npm run dev
```
Then hard refresh browser (Ctrl+Shift+R).

### 5. Double Curly Braces in Attributes
**Problem**: Using `{{variable}}` in HTML attributes causes "variable is not defined" error.
```svelte
<!-- ❌ WRONG - Svelte interprets {{variableName}} as JavaScript -->
<input placeholder="Use {{variableName}} for templates" />
<!-- Error: variableName is not defined -->
```

**Solution**: Use template literal syntax to escape double curlies:
```svelte
<!-- ✅ CORRECT - Template literal makes it a string -->
<input placeholder={`Use {{variableName}} for templates`} />

<!-- ✅ ALSO CORRECT - For inline text content -->
<span>Use {`{{variableName}}`} for templates</span>
```

**Why**: Svelte uses `{expression}` for JavaScript interpolation. When it sees `{{`, it interprets the inner `{variableName}` as an expression. Using backticks inside `{}` creates a string literal that renders the curly braces literally.

### 6. Inline Styles Override Tailwind Classes (Hover Visibility Bug)
**Problem**: Elements with both inline `style="opacity: 0;"` AND Tailwind classes like `opacity-0 group-hover:opacity-100` will NEVER become visible on hover.

```svelte
<!-- ❌ WRONG - Inline style always overrides Tailwind classes -->
<div class="opacity-0 group-hover:opacity-100" style="opacity: 0;">
  <button>Edit</button>  <!-- Never visible! -->
</div>

<!-- ❌ ALSO WRONG - group-hover requires parent with 'group' class -->
<div class="some-parent">  <!-- Missing 'group' class! -->
  <div class="opacity-0 group-hover:opacity-100">
    <button>Edit</button>  <!-- Never visible! -->
  </div>
</div>
```

**Solution**: Use EITHER inline styles OR Tailwind classes, not both. For hover visibility, ensure parent has `group` class:

```svelte
<!-- ✅ CORRECT - Tailwind only, parent has 'group' -->
<div class="group">
  <div class="opacity-0 group-hover:opacity-100 transition-opacity">
    <button>Edit</button>  <!-- Visible on hover! -->
  </div>
</div>

<!-- ✅ ALSO CORRECT - Just remove opacity entirely if always visible -->
<div class="flex items-center gap-1.5">
  <button>Edit</button>  <!-- Always visible -->
</div>
```

**Why this happens**:
1. Inline styles have highest CSS specificity - they ALWAYS win over classes
2. `group-hover:` variants require a parent element with `class="group"` to work
3. Both issues together = completely invisible elements

**Fixed in (December 2024):**
- `RulesList.svelte` (line 449) - Automation rule action buttons (Edit, Clone, Delete)

**Detection**: If hover effects don't work, search for elements with BOTH `style="opacity` AND `class="...opacity..."` - this is always a bug.

## Z-Index Stacking Order

This project uses a consistent z-index hierarchy to manage layer stacking across components.

### Z-Index Hierarchy

| Level | z-index | Purpose | Components |
|-------|---------|---------|------------|
| 1 | z-10 | Local stacking | Sticky table headers, relative elements within components |
| 2 | z-20 | Higher sticky | Main sticky headers, session card color bars |
| 3 | z-30 | Page headers | Page-level sticky headers (e.g., projects page) |
| 4 | **z-40** | **Dropdowns** | FilterDropdown, DateRangePicker, StatusActionBadge, ServerStatusBadge, TaskActionButton |
| 5 | **z-50** | **Drawers/Modals** | TaskCreationDrawer, TaskDetailDrawer, CommandEditor, OutputDrawer, RuleEditor, PresetsPicker, TopBar dropdowns, toasts |
| 6 | z-[55] | Special layering | SessionCard input section (layers above EventStack z-50) |
| 7 | z-100/101 | Editor overlays | CodeMirror autocomplete, tooltips in McpConfigEditor, DefaultsEditor, TemplatesEditor |
| 8 | z-998/999 | Stacked drawers | TaskHistoryDrawer (opens on top of TaskDetailDrawer) |
| 9 | z-1000 | Tooltips | Sparkline tooltip, StreakCalendar tooltip |

### Key Conventions

**Dropdowns (z-40):**
- Standard dropdown menus, filters, date pickers
- Status action badges, server status badges
- Use `z-40` to layer above page content but below modals

**Drawers/Modals (z-50):**
- All drawers: TaskCreation, TaskDetail, Command, Output
- All modals: RuleEditor, PresetsPicker, UserProfile
- TopBar navigation dropdowns (also z-50 since they're part of navigation chrome)
- Toast notifications

**Editor Overlays (z-100+):**
- CodeMirror autocomplete and tooltip overlays
- Need to appear above everything including modals when editing

**Stacked Drawers (z-998/999):**
- TaskHistoryDrawer uses high z-index because it opens ON TOP of TaskDetailDrawer
- z-998 for overlay, z-999 for panel

**Tooltips (z-1000):**
- Highest z-index for ephemeral tooltip content
- Sparklines, calendars, informational popovers

### Why TopBar Uses z-50 (Not z-40)

TopBar dropdowns use z-50 (same as drawers) rather than z-40:
- TopBar is part of the navigation chrome, not page content
- Its dropdowns should remain visible even when drawers are partially visible
- Keeps navigation layer consistent

### When to Use Each Level

```svelte
<!-- Dropdown inside page content -->
<div class="dropdown-content z-40 menu ...">

<!-- Modal/Drawer overlay and panel -->
<div class="drawer drawer-end z-50">

<!-- Drawer that stacks on another drawer -->
<style>
.history-overlay { z-index: 998; }
.history-drawer { z-index: 999; }
</style>

<!-- Tooltip that must appear above everything -->
<div class="tooltip z-1000">
```

### Avoiding Z-Index Conflicts

1. **Don't invent new z-index values** - Use the established levels
2. **Use relative z-index within components** (z-10, z-20) for internal layering
3. **If a dropdown appears behind a modal**, it should probably be z-50 or the modal needs redesigning
4. **Stacked drawers** - Only use z-998/999 when genuinely stacking on another drawer/modal

## Svelte 5 Runes

This project uses Svelte 5 runes syntax:

```typescript
// State
let count = $state(0);

// Derived
const doubled = $derived(count * 2);

// Props
let { name, age = 18 } = $props();

// Effects
$effect(() => {
  console.log('count changed:', count);
});
```

## UI Patterns: TaskDetailDrawer Component

### Overview

The **TaskDetailDrawer** component (`src/lib/components/TaskDetailDrawer.svelte`) provides a unified interface for viewing and editing task details using a side drawer pattern. It replaces modal dialogs with a less intrusive, more modern UX.

### Key Features

- **Dual Mode Support:** Seamlessly switch between view (read-only) and edit (form) modes
- **Drawer Pattern:** Right-side panel that doesn't block the main content
- **Auto-Fetch:** Loads task data from `/api/tasks/{id}` on mount
- **Inline Editing:** Edit mode with full form validation
- **Success/Error Handling:** Visual feedback for all operations

### Component Props

```typescript
let {
  taskId = $bindable(null),      // Task ID to display
  mode = $bindable('view'),       // 'view' or 'edit'
  isOpen = $bindable(false)       // Drawer open state
} = $props();
```

**All props are bindable** - parent components can read and write them reactively.

### Usage Example

```svelte
<script>
  import TaskDetailDrawer from '$lib/components/TaskDetailDrawer.svelte';

  let drawerOpen = $state(false);
  let selectedTaskId = $state(null);
  let drawerMode = $state('view');

  function openTaskDetails(taskId) {
    selectedTaskId = taskId;
    drawerMode = 'view';
    drawerOpen = true;
  }
</script>

<button onclick={() => openTaskDetails('jat-abc')}>
  View Task Details
</button>

<TaskDetailDrawer
  bind:taskId={selectedTaskId}
  bind:mode={drawerMode}
  bind:isOpen={drawerOpen}
/>
```

### View Mode

**Default mode** - displays task information in read-only format.

**Displays:**
- Task title (prominent heading)
- Task ID badge
- Status, priority, type badges (color-coded)
- Project badge (if assigned)
- Labels (badge list)
- Description (whitespace preserved)
- Dependencies (depends_on) - with status/priority for each
- Dependents (blocked_by) - tasks this task blocks
- Metadata: created date, updated date, assignee

**Actions:**
- Edit button (switches to edit mode)
- Close button

### Edit Mode

**Activated by clicking Edit button** - provides full form editing capabilities.

**Editable Fields:**
- Title (required, validated)
- Description (optional, textarea)
- Status (dropdown: open, in_progress, blocked, closed)
- Priority (dropdown: P0-P4)
- Type (dropdown: task, bug, feature, epic, chore)
- Project (dropdown with predefined projects)
- Labels (comma-separated text input)
- Assignee (text input)

**Form Behavior:**
- Client-side validation (title required, type required)
- PUT request to `/api/tasks/{id}` on save
- Success: Shows success message, refetches task, switches to view mode
- Error: Shows inline error message, stays in edit mode
- Cancel: Discards changes, switches to view mode

**Actions:**
- Cancel button (discards changes, back to view)
- Save Changes button (submits form)

### Mode Toggle Pattern

**View Mode → Edit Mode:**
1. User clicks "Edit" button in header
2. Component switches mode to 'edit'
3. Form is populated with current task data
4. Footer shows Cancel + Save buttons

**Edit Mode → View Mode:**
1. User clicks "Cancel" or "View" button
2. Component resets form to original task data
3. Switches mode to 'view'
4. Footer shows Close button

**After Save:**
1. User clicks "Save Changes"
2. Form validates, submits PUT request
3. On success: Shows success message for 1.5s
4. Auto-refetches task data
5. Automatically switches back to view mode

### Visual States

| State | View | Description |
|-------|------|-------------|
| **Loading** | Spinner | Fetching task data from API |
| **Error** | Error alert + Retry button | Failed to load task |
| **View Mode** | Read-only content | Displaying task details |
| **Edit Mode** | Form fields | Editing task details |
| **Submitting** | Disabled form + spinner | Saving changes |
| **Success** | Success alert | Changes saved successfully |
| **Submit Error** | Error alert | Failed to save changes |

### Drawer Layout

**Structure:**
```
┌─ Drawer Panel (max-w-2xl) ────────────────────┐
│ Header                                         │
│  • Title: "Task Details" or "Edit Task"        │
│  • Task ID badge (view mode only)             │
│  • Mode toggle button (Edit ↔ View)           │
│  • Close button (✕)                            │
├────────────────────────────────────────────────┤
│ Content (scrollable)                           │
│  • View: Sections with task data              │
│  • Edit: Form with input fields               │
│                                                │
│  (flexible height, overflow-y-auto)            │
├────────────────────────────────────────────────┤
│ Footer (bg-base-200)                           │
│  • View: Close button                          │
│  • Edit: Cancel + Save Changes buttons        │
└────────────────────────────────────────────────┘
```

**Drawer Properties:**
- Side: Right (drawer-end)
- Width: max-w-2xl (responsive)
- Overlay: Click to close
- Z-index: z-50 (appears above most content)
- Shadow: shadow-2xl (prominent depth)

### API Integration

**Fetch Task:**
```javascript
GET /api/tasks/{taskId}
Response: { task: { id, title, description, ... } }
```

**Update Task:**
```javascript
PUT /api/tasks/{taskId}
Body: { title, description, priority, type, status, project, labels, assignee }
Response: { task: { ... } }
```

**Error Handling:**
- Network errors: Shows error alert with retry button
- Validation errors: Inline field-level error messages
- API errors: Shows error message from server
- 404 Not Found: "Failed to fetch task" error

### Badge Color Coding

**Status Badges:**
- `open` → info (blue)
- `in_progress` → warning (yellow)
- `closed` → success (green)
- `blocked` → error (red)

**Priority Badges:**
- P0 → error (red, Critical)
- P1 → warning (yellow, High)
- P2 → info (blue, Medium)
- P3-P4 → ghost (gray, Low)

**Project Badge:**
- primary (brand color)

**Labels:**
- outline badges (neutral)

### Comparison: Drawer vs Modal

**Why Drawer Pattern?**

| Feature | Drawer (TaskDetailDrawer) | Modal (TaskDetailModal) |
|---------|---------------------------|-------------------------|
| **View Blocking** | No - side panel | Yes - overlay blocks view |
| **Context Preservation** | Keep main view visible | Main view obscured |
| **Multi-tasking** | Can reference other tasks | Must close to see other content |
| **Screen Real Estate** | Efficient use of width | Centers, wastes edges |
| **Mobile UX** | Full-width, native feel | Often awkward on mobile |
| **Modern UX** | Contemporary pattern | Traditional pattern |

**When to Use Each:**
- **Drawer:** Task details, editing workflows, reference panels
- **Modal:** Critical confirmations, alerts, focused single actions

### Best Practices

**Do:**
- ✅ Use bindable props for reactive parent-child communication
- ✅ Validate form fields before submission
- ✅ Show inline error messages (not toasts)
- ✅ Provide visual feedback for all state changes
- ✅ Auto-refetch data after successful updates
- ✅ Reset form when switching from edit → view

**Don't:**
- ❌ Modify task data without saving
- ❌ Allow submission with invalid data
- ❌ Close drawer during API requests
- ❌ Use generic error messages
- ❌ Forget to handle loading/error states

### Extending the Component

**Add New Field:**
1. Add field to formData state
2. Add field to view mode display
3. Add input to edit mode form
4. Include in PUT request body

**Example - Adding "Due Date":**
```svelte
// 1. Add to formData
let formData = $state({
  // ... existing fields
  dueDate: ''
});

// 2. View mode display
{#if task.due_date}
  <div>
    <h4 class="text-sm font-semibold mb-2">Due Date</h4>
    <p>{formatDate(task.due_date)}</p>
  </div>
{/if}

// 3. Edit mode form
<div class="form-control">
  <label class="label">
    <span class="label-text font-semibold">Due Date</span>
  </label>
  <input type="date" class="input input-bordered" bind:value={formData.dueDate} />
</div>

// 4. Include in PUT request
const requestBody = {
  // ... existing fields
  due_date: formData.dueDate || undefined
};
```

### Files

**Component:** `src/lib/components/TaskDetailDrawer.svelte` (701 lines)

**Related Components:**
- `TaskCreationDrawer.svelte` - Similar drawer pattern for task creation

**API Routes:**
- `src/routes/api/tasks/[id]/+server.js` - GET/PUT task endpoint

**Task Reference:**
- jat-25i: Create TaskDetailDrawer base component (completed)
- jat-lli: Implement auto-save edit mode (planned)
- jat-dtq: Add quick actions to view mode (planned)

## Multi-Project Filtering

### Overview

The dashboard supports multi-project task management with intelligent project detection and filtering. Projects are automatically detected from task ID prefixes (e.g., `chimaro-abc`, `jat-xyz`, `jomarchy-123`).

### How It Works

**Project Detection:**
- Task IDs follow format: `{project}-{hash}` (e.g., `jat-xkp`, `chimaro-42a`)
- Project name is extracted from the prefix before the first hyphen
- Projects are auto-discovered from all loaded tasks
- No manual project configuration needed

**Implementation:** `src/lib/utils/projectUtils.ts`

```typescript
// Extract project from task ID
getProjectFromTaskId("chimaro-abc")  // → "chimaro"
getProjectFromTaskId("jat-xyz")      // → "jat"
getProjectFromTaskId("jomarchy-123") // → "jomarchy"

// Get all unique projects from tasks
getProjectsFromTasks(tasks)
// → ["All Projects", "chimaro", "jat", "jomarchy"]

// Filter tasks by project
filterTasksByProject(tasks, "chimaro")
// → Only chimaro tasks
```

### Where Filters Appear

**1. Navbar (/agents page)**
- Dropdown selector in top navigation bar
- Shows all detected projects
- Displays task count per project
- Example: "jat (8) | chimaro (12) | All Projects (20)"

**2. TaskQueue Sidebar**
- Project filter integrated with task queue
- Filters tasks in sidebar by selected project
- Syncs with navbar selection

**3. URL Parameter**
- Project selection updates URL: `?project=chimaro`
- Bookmarkable URLs (copy/paste preserves selection)
- Page reload preserves last selected project
- Example URLs:
  - `/agents` - All projects
  - `/agents?project=chimaro` - Only chimaro tasks
  - `/agents?project=jat` - Only jat tasks

### Features

**Automatic Detection:**
- No configuration files needed
- Projects discovered from task IDs automatically
- Works with any project naming convention (alphanumeric, hyphens, underscores)
- Handles projects in `~/code/*` structure

**Task Count Display:**
- Shows number of tasks per project
- Updates reactively as tasks change
- Example: "chimaro (15)" means 15 chimaro tasks

**URL Integration:**
- `?project=X` parameter filters view
- Direct links work: Share filtered URLs with team
- Browser back/forward preserves filter state
- Bookmarks remember project selection

**Filter Persistence:**
- Selected project stored in URL (not localStorage)
- Page refresh maintains selection
- Multiple tabs can show different projects
- No cleanup needed (stateless)

### Use Cases

**1. View Single Project:**
```
Navigate to: /agents?project=chimaro
Result: Shows only chimaro-* tasks
```

**2. Switch Projects:**
```
1. Select "jat" from dropdown
2. URL updates to: /agents?project=jat
3. Tasks refresh to show only jat-* tasks
4. Share URL with team for same view
```

**3. View All Projects:**
```
Select "All Projects" from dropdown
URL: /agents (no project param)
Result: Shows all tasks from all projects
```

**4. Bookmarkable Views:**
```
Bookmark: /agents?project=chimaro
Result: Always opens to chimaro tasks
Use case: Dedicated bookmark per project
```

### Integration with Other Filters

Project filter works seamlessly with existing filters:

```
/agents?project=jat&priority=P0&status=open
→ Shows P0 open tasks from jat project only

/agents?project=chimaro&search=authentication
→ Shows chimaro tasks matching "authentication"
```

**Filter precedence:** All filters are AND-ed together (narrow down results).

### Supported Task ID Formats

The project filter handles various task ID formats:

| Format | Project Extracted | Example |
|--------|-------------------|---------|
| `project-hash` | `project` | `jat-abc` → "jat" |
| `multi-word-hash` | `multi-word` | `my-app-xyz` → "my-app" |
| `CAPS-hash` | `caps` | `JAT-123` → "jat" (lowercased) |
| `under_score-hash` | `under_score` | `my_proj-abc` → "my_proj" |

**Invalid formats (no project extracted):**
- `nodashhash` - No hyphen separator
- `-abc` - Empty project prefix
- `abc-` - Empty hash suffix

### Performance

**Optimized for large task lists:**
- Project list computed once per data load
- Filter operation is O(n) on tasks array
- Uses Svelte 5 `$derived` for reactive updates
- No unnecessary re-renders

**Typical performance:**
- 100 tasks: <1ms filter time
- 1000 tasks: <5ms filter time
- 10,000 tasks: <50ms filter time

### For Developers

**Adding project-aware features:**

1. **Get current project:**
```typescript
// From URL
const projectParam = $page.url.searchParams.get('project');

// From selected state
let selectedProject = $state('All Projects');
```

2. **Filter data by project:**
```typescript
import { filterTasksByProject } from '$lib/utils/projectUtils';

const filteredTasks = $derived(
  filterTasksByProject(allTasks, selectedProject)
);
```

3. **Update URL with project:**
```typescript
function handleProjectChange(project: string) {
  const url = new URL(window.location.href);

  if (project === 'All Projects') {
    url.searchParams.delete('project');
  } else {
    url.searchParams.set('project', project);
  }

  goto(url.pathname + url.search);
}
```

**Testing project filter:**
```typescript
// Unit tests in projectUtils.test.ts
test('extracts project from task ID', () => {
  expect(getProjectFromTaskId('chimaro-abc')).toBe('chimaro');
  expect(getProjectFromTaskId('jat-xyz')).toBe('jat');
  expect(getProjectFromTaskId('invalid')).toBeNull();
});
```

### Common Issues

**Project dropdown is empty:**
- Check that tasks have valid ID format: `project-hash`
- Verify tasks are loaded: console.log(tasks)
- Ensure projectUtils is imported correctly

**Filter not working:**
- Verify URL param matches project name exactly
- Check case sensitivity (should be lowercase)
- Ensure $derived is used for reactivity

**Projects not detected:**
- Task IDs must follow `{prefix}-{hash}` format
- Prefix must be non-empty and contain valid characters
- Hash must be non-empty (at least 1 character)

### Files

**Core utilities:**
- `src/lib/utils/projectUtils.ts` - Project detection and filtering logic
- `src/lib/components/ProjectBadgeFilter.svelte` - Project filter dropdown
- `src/routes/agents/+page.svelte` - Integration and URL handling

**Related:**
- `src/lib/components/agents/TaskQueue.svelte` - Sidebar filtering
- `src/routes/api/agents/+server.js` - API endpoint (supports ?project param)

### Architectural Decision: Agent Inbox Filtering

**Decision:** Agent inbox is **GLOBAL** (not project-filtered)

**Rationale:**
- Agents are globally unique (one agent name across all projects)
- Cross-project coordination is common (deployments, infrastructure, team broadcasts)
- Splitting inbox by project would make agents miss important messages
- Thread filtering (--thread) provides sufficient focus when needed

**Implementation:**
```javascript
// API: dashboard/src/routes/api/agents/[name]/inbox/+server.js
const command = `am-inbox "${agentName}" --json`;  // No --project flag
```

**For developers:**
- Do NOT add project filtering to agent inbox API
- Agents see ALL messages regardless of project context
- Use thread filtering (`--thread task-id`) for focused message view
- See `dashboard/docs/inbox-filtering-decision.md` for full analysis

**Task:** jat-xkr - Resolved 2025-11-21 by SharpIsle

## Claude API Usage Metrics

The dashboard includes a **Claude API Usage Bar** component that displays real-time metrics about Claude API usage, replacing the previous hour-based capacity estimation system.

**Location:** Fixed bottom-right of screen (hover to expand)

**What it shows:**
- Subscription tier (FREE, BUILD, MAX) with rate limits
- Optional: Real-time session context from API headers
- Agent activity metrics (working/idle/sleeping agents)

**Key Features:**
- Hover-to-expand stats widget
- 30-second auto-refresh polling
- Multi-layer caching (30s for session context, 60s for agent metrics)
- Graceful degradation when data unavailable

**Quick Start:**
```bash
# Component automatically fetches tier from ~/.claude/.credentials.json
# No configuration needed for basic tier display

# Optional: Enable real-time session context
export ANTHROPIC_API_KEY=sk-ant-api03-...  # Get from console.anthropic.com
npm run dev
```

**Files:**
- `src/lib/components/ClaudeUsageBar.svelte` - UI component
- `src/lib/utils/claudeUsageMetrics.ts` - Data fetching utility
- `src/routes/api/claude/usage/+server.js` - API endpoint

**📖 Full Documentation:** See [`docs/claude-api-usage-metrics-guide.md`](docs/claude-api-usage-metrics-guide.md) for:
- Complete metrics breakdown
- Data sourcing architecture
- Troubleshooting guide
- Future enhancements

**Task References:**
- jat-sk1: Claude API usage data fetching (completed)
- jat-1ux: Replace SystemCapacityBar with ClaudeUsageBar (completed)
- jat-ozq: Document Claude API usage metrics (completed)

## Per-Agent Token Tracking

### Overview

The dashboard tracks token usage per agent by parsing Claude Code session files (JSONL format) and displaying usage metrics on agent cards and system-wide summaries.

**Key Features:**
- Per-agent token usage (today/week)
- Cost tracking with Sonnet 4.5 pricing
- Color-coded thresholds (configurable)
- System-wide usage overview
- Top consumers ranking
- Session count tracking

### How It Works

**Data Flow:**
```
Claude Code Sessions → JSONL Files → tokenUsage.ts → API Endpoints → UI Components
```

**1. JSONL Session Files:**
- Location: `~/.claude/projects/{project-slug}/*.jsonl`
- Contains: API responses with token usage per request
- Format: One JSON object per line with `.message.usage` field

**2. Session-Agent Mapping:**
- Location: `.claude/agent-{session_id}.txt`
- Contains: Agent name for that session
- Created by: Agent workflow commands (`/jat:start`, etc.)

**3. Token Aggregation:**
- `tokenUsage.ts` parses JSONL files
- Sums tokens across all sessions for each agent
- Filters by time range (today/week/all)
- Calculates costs using Sonnet 4.5 pricing

**4. API Endpoints:**
- `/api/agents?usage=true` - All agents with usage data
- `/api/agents/[name]/usage?range=today|week|all` - Single agent usage

**5. UI Display:**
- AgentCard: Individual agent usage
- Agents page: System-wide summary and top consumers

### Architecture

**Core Files:**
- `src/lib/utils/tokenUsage.ts` - JSONL parsing and aggregation (460 lines)
- `src/routes/api/agents/[name]/usage/+server.js` - Single agent API (147 lines)
- `src/routes/api/agents/+server.js` - Orchestration API with ?usage=true (modified)
- `src/lib/components/work/SessionCard.svelte` - Per-session display
- `src/lib/config/tokenUsageConfig.ts` - Configurable thresholds

**Key Functions:**

```typescript
// Build session → agent mapping
buildSessionAgentMap(projectPath): Promise<Map<string, string>>

// Parse single session JSONL file
parseSessionUsage(sessionId, projectPath): Promise<SessionUsage | null>

// Get usage for specific agent
getAgentUsage(agentName, timeRange, projectPath): Promise<TokenUsage>

// Get all agents' usage
getAllAgentUsage(timeRange, projectPath): Promise<Map<string, TokenUsage>>

// Calculate costs (Sonnet 4.5 pricing)
calculateCost(usage): number
```

### Configuration

**Thresholds:** `src/lib/config/tokenUsageConfig.ts`

```typescript
export const TOKEN_THRESHOLDS = {
  low: 100_000_000,      // Green: < 100M tokens/day (~$300/day)
  medium: 250_000_000,   // Yellow: 100M-250M tokens/day
  high: 500_000_000      // Orange: 250M-500M tokens/day
  // Red: > 500M tokens/day
};

export const HIGH_USAGE_WARNING_THRESHOLD = TOKEN_THRESHOLDS.high;
```

**To Customize:**
1. Edit `tokenUsageConfig.ts` with your preferred thresholds
2. Reload dashboard (no restart needed)
3. Colors update automatically

**Example (smaller budget):**
```typescript
export const TOKEN_THRESHOLDS = {
  low: 100_000,      // Green: < 100K tokens/day (~$0.30/day)
  medium: 500_000,   // Yellow: 100K-500K tokens/day
  high: 1_000_000    // Orange: 500K-1M tokens/day
};
```

### UI Components

**1. AgentCard Token Usage Section:**

Location: After File Locks, before Recent Activity Feed

**Displays:**
- **Today's Usage:**
  - Total tokens (color-coded by threshold)
  - Cost in USD
  - High usage warning badge (if > threshold)
- **Week's Usage:**
  - Total tokens (K/M formatted)
  - Cost in USD
  - Session count

**States:**
- Loading: Skeleton loader
- Error: Inline error with retry button (3 attempts max)
- Empty: "No usage data yet" message
- Success: Usage metrics with color coding

**Color Coding:**
- Gray: 0 tokens
- Green: < low threshold (normal usage)
- Yellow: low - medium threshold (elevated usage)
- Orange: medium - high threshold (high usage)
- Red: > high threshold (critical usage)

**2. System Usage Overview (Agents Page):**

Collapsible panel showing:
- **System Stats:**
  - Total tokens today (all agents)
  - Total spend today
  - Active agent count
- **Top Agents:**
  - Top 3 agents by token usage today
  - Tokens and cost per agent

### Pricing Reference

**Claude Sonnet 4.5 Pricing (per million tokens):**
- Input: $3.00
- Cache creation: $3.75
- Cache read: $0.30 (90% savings!)
- Output: $15.00

**Cost Examples:**
- 100K tokens/day ≈ $0.30/day ≈ $9/month
- 1M tokens/day ≈ $3/day ≈ $90/month
- 10M tokens/day ≈ $30/day ≈ $900/month
- 100M tokens/day ≈ $300/day ≈ $9,000/month

**Note:** Actual costs vary based on cache hit rate and input/output ratio.

### Data Sources

**Session Files Location:**
```
~/.claude/projects/{project-slug}/{session-id}.jsonl
```

**Project Slug Format:**
- Path: `/home/user/code/project` → `-home-user-code-project`
- Leading `-` is important (don't strip it!)

**Session-Agent Mapping:**
```
.claude/agent-{session_id}.txt → "AgentName"
```

**Example:**
```bash
# Session file
~/.claude/projects/-home-jw-code-jat/abc123-def456.jsonl

# Agent mapping
.claude/agent-abc123-def456.txt → "WisePrairie"

# Result: All tokens from abc123-def456.jsonl count toward WisePrairie
```

### API Usage

**Fetch all agents with usage data:**
```bash
curl 'http://localhost:5173/api/agents?full=true&usage=true'
```

**Response:**
```json
{
  "agents": [
    {
      "name": "WisePrairie",
      "usage": {
        "today": {
          "total_tokens": 45000,
          "cost": 0.15,
          "sessionCount": 1
        },
        "week": {
          "total_tokens": 2500000,
          "cost": 8.50,
          "sessionCount": 7
        }
      }
    }
  ]
}
```

**Fetch single agent usage:**
```bash
curl 'http://localhost:5173/api/agents/WisePrairie/usage?range=week'
```

**Response:**
```json
{
  "agent": "WisePrairie",
  "range": "week",
  "usage": {
    "input_tokens": 500000,
    "cache_creation_input_tokens": 100000,
    "cache_read_input_tokens": 1500000,
    "output_tokens": 400000,
    "total_tokens": 2500000,
    "cost": 8.50,
    "sessionCount": 7
  },
  "cached": false,
  "timestamp": "2025-11-21T15:45:00.000Z"
}
```

### Caching Strategy

**API Caching:**
- Single agent endpoint: 60-second TTL
- All agents endpoint: No caching (parent page handles polling)

**Benefits:**
- Reduces JSONL parsing overhead
- Faster response times
- Lower CPU usage on dashboard server

### Troubleshooting

**Usage data shows zeros or is missing:**

1. **Check session files exist:**
   ```bash
   # Find project slug
   pwd | sed 's/\//\-/g'
   # Example: /home/jw/code/jat → -home-jw-code-jat

   # Check for JSONL files
   ls ~/.claude/projects/-home-jw-code-jat/*.jsonl
   ```

2. **Check agent mapping files:**
   ```bash
   ls .claude/agent-*.txt
   cat .claude/agent-{session-id}.txt
   ```

3. **Verify project path in API:**
   - Dashboard uses `process.cwd().replace('/dashboard', '')`
   - Should resolve to parent project directory
   - Check server logs for path transformation

4. **Run test script:**
   ```bash
   cd dashboard
   npx tsx test-token-usage.ts
   ```

**"No usage data yet" on all agents:**

Possible causes:
- Agents haven't made any API calls yet
- Session files not in expected location
- Project path slug mismatch

**High usage warning always shows:**

Adjust threshold in `tokenUsageConfig.ts`:
```typescript
export const HIGH_USAGE_WARNING_THRESHOLD = 10_000_000; // 10M tokens
```

**Colors don't match expectations:**

Check thresholds in `tokenUsageConfig.ts` and adjust to your budget.

### Performance Considerations

**JSONL Parsing:**
- Each file read: ~50-200ms (depends on size)
- Caching reduces repeat parses
- Runs server-side (not blocking UI)

**Typical Performance:**
- 10 agents, 50 sessions: ~1-2 seconds first load
- Subsequent loads: <100ms (cached)
- Page load: Async, doesn't block agent cards

**Optimization Tips:**
- Keep session file count reasonable (archive old sessions)
- Use caching (already enabled)
- Filter by time range to reduce parsing

### Future Enhancements

**Planned (Not Yet Implemented):**

1. **Real-time Usage Tracking:**
   - WebSocket updates for live token counting
   - Progress bars showing current session usage

2. **Cost Budgets:**
   - Per-agent daily/weekly budgets
   - Alerts when approaching limits
   - Budget remaining indicators

3. **Historical Trends:**
   - Usage charts (daily/weekly/monthly)
   - Cost projections based on trends
   - Peak usage identification

4. **Export & Reporting:**
   - CSV export of usage data
   - Monthly cost reports
   - Per-project cost breakdown

5. **Cache Efficiency Analysis:**
   - Cache hit rate display
   - Cost savings from caching
   - Cache optimization recommendations

### Files Reference

**Core Implementation:**
- `src/lib/utils/tokenUsage.ts` - Token aggregation logic (460 lines)
- `src/lib/config/tokenUsageConfig.ts` - Configurable thresholds (60 lines)
- `src/routes/api/agents/[name]/usage/+server.js` - Single agent API (147 lines)
- `src/routes/api/agents/+server.js` - Orchestration API (modified)
- `src/lib/components/work/SessionCard.svelte` - Per-session display (modified)
- `src/routes/agents/+page.svelte` - System summary (modified)

**Testing:**
- `test-token-usage.ts` - Manual test script (95 lines)

**Documentation:**
- `dashboard/CLAUDE.md` - This section

**Task References:**
- jat-naq: Create tokenUsage.ts utility module (completed)
- jat-v0w: Create usage API endpoint (completed)
- jat-1n0: Enhance API orchestration (completed)
- jat-oig: Display token usage on AgentCard (completed)
- jat-1q7: Document per-agent token tracking (this section)

## Two-Phase Loading Pattern

### Overview

Pages that display expensive-to-calculate data (like token usage, sparklines) use a **two-phase loading pattern** to provide fast initial page loads while lazily fetching expensive data in the background.

**Problem Solved:** The `/dash` page was taking 10+ seconds to load because it fetched token usage for all 458 agents on every request. Token usage calculation requires parsing JSONL files, which is I/O intensive.

**Solution:** Split data fetching into two phases:
1. **Phase 1 (Fast):** Fetch essential data immediately (agents, tasks, output)
2. **Phase 2 (Lazy):** Fetch expensive data after UI renders (token usage, sparklines)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TWO-PHASE LOADING FLOW                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Phase 1: Fast Initial Load (~100ms)                                   │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ onMount() {                                                       │ │
│  │   await fetchData();  // No usage=true, fast path                │ │
│  │   // UI renders immediately with skeleton loaders                │ │
│  │ }                                                                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Phase 2: Lazy Load Expensive Data (~200ms delay, then ~1-2s fetch)   │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ setTimeout(() => fetchUsageData(), 200);  // Background           │ │
│  │ // Merges into existing state, skeletons replaced with data      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Phase 3: Periodic Refresh (ongoing)                                   │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ setInterval(() => fetchData(true), 15000);    // Full refresh    │ │
│  │ setInterval(() => fetchUsageData(), 30000);   // Usage only      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Examples

#### `/dash` Page Pattern

```typescript
// State
let agents = $state<any[]>([]);

// Phase 1: Fast fetch (no usage data)
async function fetchData(includeUsage = false) {
  let url = `/api/agents?full=true&activities=true`;
  if (includeUsage) url += '&usage=true';

  const response = await fetch(url);
  const data = await response.json();
  agents = data.agents || [];
}

// Phase 2: Lazy load usage data
async function fetchUsageData() {
  const response = await fetch('/api/agents?full=true&usage=true');
  const data = await response.json();

  // Merge usage into existing agents
  const usageMap = new Map(data.agents.map(a => [a.name, a.usage]));
  agents = agents.map(agent => ({
    ...agent,
    usage: usageMap.get(agent.name) || agent.usage
  }));
}

onMount(async () => {
  await fetchData();                          // Phase 1: Fast
  setTimeout(() => fetchUsageData(), 100);    // Phase 2: Lazy
});
```

#### `/work` Page Pattern

```typescript
import {
  fetch as fetchSessions,
  fetchUsage as fetchSessionUsage
} from '$lib/stores/workSessions.svelte.js';

onMount(() => {
  fetchTaskData();                            // Phase 1: Fast task data
  startPolling(500);                          // Fast polling (no usage)
  setTimeout(() => fetchSessionUsage(), 200); // Phase 2: Lazy usage
});

// Slow refresh for usage (separate from 500ms output polling)
$effect(() => {
  const interval = setInterval(() => fetchSessionUsage(), 30000);
  return () => clearInterval(interval);
});
```

### API Query Parameters

| Endpoint | Parameter | Effect | Response Time |
|----------|-----------|--------|---------------|
| `/api/agents` | (default) | Basic agent info | ~100ms |
| `/api/agents?usage=true` | Token usage + sparklines | ~1.9s |
| `/api/agents?full=true` | Full agent data (no usage) | ~120ms |
| `/api/agents?full=true&usage=true` | Everything | ~2s |
| `/api/work` | (default) | Sessions without usage | ~90ms |
| `/api/work?usage=true` | Sessions with token usage | ~160ms |

### Skeleton Loading States

While Phase 2 data loads, show DaisyUI skeleton loaders:

```svelte
<!-- Cost badge skeleton -->
{#if agent.usage}
  <TokenUsageBadge usage={agent.usage} />
{:else}
  <div class="skeleton h-4 w-10 ml-auto rounded"></div>
{/if}

<!-- Sparkline skeleton with deterministic heights -->
{#if sparklineData.length > 0}
  <Sparkline data={sparklineData} />
{:else}
  <div class="h-10 flex items-end gap-0.5 px-1">
    {#each [30, 45, 35, 60, 50, 40, 55, 70, 45, 35, 50, 65] as height, i}
      <div
        class="skeleton flex-1 rounded-sm"
        style="height: {height}%; animation-delay: {i * 30}ms;"
      ></div>
    {/each}
  </div>
{/if}
```

**Important:** Use deterministic heights for skeleton bars (not `Math.random()`) to avoid re-render flicker.

### Performance Impact

| Page | Before | After (Phase 1) | Improvement |
|------|--------|-----------------|-------------|
| `/dash` | ~10s | ~120ms | **83x faster** |
| `/api/agents` | 1.9s | 105ms | **18x faster** |
| `/work` | ~200ms | ~90ms | **2x faster** |
| `/api/work` | 161ms | 91ms | **1.8x faster** |

### When to Use This Pattern

**Use two-phase loading when:**
- Data requires expensive I/O (parsing files, database aggregations)
- Data is supplementary (nice to have, not critical for initial render)
- Users benefit from seeing partial results quickly
- The expensive operation can be parallelized with other work

**Don't use when:**
- All data is needed before any UI can render
- Data fetches are already fast (<200ms)
- The extra complexity isn't justified

### Files Implementing This Pattern

**Pages:**
- `src/routes/dash/+page.svelte` - Agent dashboard with usage lazy loading
- `src/routes/work/+page.svelte` - Work sessions with usage lazy loading

**Stores:**
- `src/lib/stores/workSessions.svelte.ts` - `fetch()` and `fetchUsage()` functions

**API Endpoints:**
- `src/routes/api/agents/+server.js` - Supports `?usage=true` parameter
- `src/routes/api/work/+server.js` - Supports `?usage=true` parameter

### Troubleshooting

**Skeletons never resolve to real data:**
- Check browser Network tab for Phase 2 fetch
- Verify `fetchUsageData()` is called after mount
- Check console for errors in usage fetch

**Data loads twice (visible flicker):**
- Ensure Phase 1 doesn't include usage data
- Check that merge function preserves existing data correctly
- Verify skeleton conditional checks `agent.usage` existence

**Background refresh causing UI jumps:**
- Use merge pattern (update existing objects) not replace pattern
- Preserve object references where possible
- Consider debouncing rapid updates

**Task References:**
- jat-aydj: Fix long loading time on /dash (completed)

### Skeleton Component Library

The dashboard includes a library of skeleton loading components for consistent loading states across all pages.

**Import Pattern:**

```svelte
import { TaskTableSkeleton, AgentGridSkeleton, TaskDetailSkeleton } from '$lib/components/skeleton';
```

**Available Components:**

| Component | Use Case | Props |
|-----------|----------|-------|
| `TaskTableSkeleton` | Task list tables | `rows?: number`, `showFilters?: boolean` |
| `SessionCardSkeleton` | Work session cards | - |
| `SessionPanelSkeleton` | Work session panels | - |
| `AgentGridSkeleton` | Agent grid on /agents | `cards?: number` |
| `KanbanSkeleton` | Kanban board view | `columns?: number` |
| `ProjectsTableSkeleton` | Projects table | `rows?: number` |
| `GraphSkeleton` | Dependency graph view | - |
| `TimelineSkeleton` | Timeline/Gantt view | `tasks?: number` |
| `TriageSkeleton` | Triage page | - |
| `TaskDetailSkeleton` | Task detail drawer content | - |

**Usage Example:**

```svelte
<script lang="ts">
  import { AgentGridSkeleton } from '$lib/components/skeleton';

  let loading = $state(true);
  let agents = $state([]);
</script>

{#if loading}
  <AgentGridSkeleton cards={4} />
{:else}
  <AgentGrid {agents} />
{/if}
```

**Inline Token Usage Skeleton:**

SessionCard supports a `usageLoading` prop for skeleton display while usage data loads:

```svelte
<SessionCard
  mode="compact"
  sessionName={session.name}
  agentName={session.agent}
  tokens={agent.usage?.today?.total_tokens || 0}
  cost={agent.usage?.today?.cost || 0}
  usageLoading={!agent.usage}  <!-- Show skeleton while loading -->
/>
```

**Files:**
- `src/lib/components/skeleton/index.ts` - Export barrel file
- `src/lib/components/skeleton/*.svelte` - Individual skeleton components

## SessionCard State Lifecycle

### Overview

The **SessionCard** component (`src/lib/components/work/SessionCard.svelte`) tracks agent session states through a complete lifecycle. States are detected by pattern-matching the tmux session output.

### State Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SESSION STATE LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STARTING ──► WORKING ◄──► NEEDS INPUT ──► REVIEW ──► COMPLETING ──► IDLE  │
│     │            │              │             │            │           │    │
│     │            │              │             │            │           │    │
│     ▼            ▼              ▼             ▼            ▼           ▼    │
│  Agent       Agent is       Agent asks    Agent asks   /jat:complete  Task  │
│  booting     working on     a question    if ready     is running    done   │
│              task           (tool use)    to complete                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Session States

| State | Badge | Color | Description | Detection Source |
|-------|-------|-------|-------------|------------------|
| `starting` | 🚀 STARTING | Blue | Agent initializing | No SSE state yet, task not in_progress |
| `working` | ⚡ WORKING | Amber | Agent actively working | SSE `sseState='working'` OR task.status === 'in_progress' |
| `needs-input` | ❓ NEEDS INPUT | Purple | Waiting for user response | SSE `sseState='needs_input'` OR `⎿` prompt in output |
| `ready-for-review` | 👁 REVIEW | Cyan | Agent asking to complete | SSE `sseState='review'` |
| `completing` | ⏳ COMPLETING | Teal | Running /jat:complete | "jat:complete is running" in output |
| `completed` | ✓ COMPLETED | Green | Task finished | SSE `sseState='completed'` |
| `idle` | 💤 IDLE | Gray | No active task | SSE `sseState='idle'` OR agent registered but no task |

### State Detection via Signals API

Session state is detected via SSE (Server-Sent Events) from the signals API. Agents emit state changes using `jat-signal` with JSON payloads:

```bash
# Agent signals working state (requires JSON)
jat-signal working '{"taskId":"jat-abc","taskTitle":"Add auth"}'

# Agent signals needs input (requires JSON)
jat-signal needs_input '{"taskId":"jat-abc","question":"Which lib?","questionType":"choice"}'

# Agent signals ready for review (requires JSON)
jat-signal review '{"taskId":"jat-abc","summary":["Added login"]}'

# Agent signals completion (requires JSON - full bundle)
jat-signal complete '{"taskId":"jat-abc","agentName":"Agent","completionMode":"review_required","summary":["Added login"],"quality":{"tests":"passing","build":"clean"},"suggestedTasks":[]}'
```

The PostToolUse hook captures these signals and writes them to `/tmp/jat-signal-{session}.json`. The SSE server reads these files and broadcasts state changes to connected dashboard clients via `session-signal` events.

**See:** `shared/signals.md` for the complete signal system documentation.

### State Transitions

**STARTING → WORKING:**
- Agent runs `jat-signal working '{"taskId":"...","taskTitle":"..."}'`
- Or inferred from `task.status === 'in_progress'` in Beads

**WORKING → NEEDS INPUT:**
- Agent calls AskUserQuestion tool
- `⎿` prompt appears in output

**NEEDS INPUT → WORKING:**
- User provides input
- Agent continues processing

**WORKING → REVIEW:**
- Agent asks about completion: "ready to mark complete?", "shall I mark", etc.

**REVIEW → COMPLETING:**
- User runs `/jat:complete` command
- Pattern: "jat:complete is running"

**COMPLETING → COMPLETED → IDLE:**
- Task marked closed in Beads
- Agent becomes idle

### Visual Configuration

Session state visuals are centralized in `src/lib/config/statusColors.ts` under `SESSION_STATE_VISUALS`. Each state has both accent bar styling (for SessionCard) and badge styling (for StatusActionBadge):

```typescript
// src/lib/config/statusColors.ts
export interface SessionStateVisual {
    // Display
    label: string;                 // Display label with emoji (e.g., "✅ DONE")
    shortLabel: string;            // Short label without emoji (e.g., "Complete")
    iconType: SessionStateIconType; // Icon identifier ('rocket' | 'gear' | 'question' | 'eye' | 'check' | 'circle')

    // StatusActionBadge colors (dropdown badges)
    bgColor: string;               // Background color (oklch with alpha)
    textColor: string;             // Text color (oklch)
    borderColor: string;           // Border color (oklch with alpha)
    pulse?: boolean;               // Whether to animate with pulse

    // SessionCard accent bar colors (left accent bar and agent badge)
    accent: string;                // Vibrant accent color for bars/highlights
    bgTint: string;                // Subtle background tint
    glow: string;                  // Glow effect color (for active states)

    // SVG path for StatusActionBadge icon
    icon: string;
}

export const SESSION_STATE_VISUALS: Record<string, SessionStateVisual> = {
    starting: {
        label: '🚀 STARTING',
        shortLabel: 'Starting',
        iconType: 'rocket',
        // StatusActionBadge colors
        bgColor: 'oklch(0.60 0.15 200 / 0.3)',
        textColor: 'oklch(0.90 0.12 200)',
        borderColor: 'oklch(0.60 0.15 200 / 0.5)',
        // SessionCard accent colors
        accent: 'oklch(0.75 0.15 200)',
        bgTint: 'oklch(0.75 0.15 200 / 0.10)',
        glow: 'oklch(0.75 0.15 200 / 0.5)',
        icon: '...'  // SVG path
    },
    // ... other states (working, needs-input, ready-for-review, completing, completed, idle)
};
```

**Session State Actions** are also defined in `statusColors.ts` under `SESSION_STATE_ACTIONS`. These define the dropdown menu actions for each state:

```typescript
export const SESSION_STATE_ACTIONS: Record<string, SessionStateAction[]> = {
    completed: [
        { id: 'cleanup', label: 'Cleanup Session', variant: 'success', ... },
        { id: 'view-task', label: 'View Task', variant: 'default', ... },
        { id: 'attach', label: 'Attach Terminal', variant: 'info', ... }
    ],
    'ready-for-review': [
        { id: 'complete', label: 'Mark Done', variant: 'success', ... },
        { id: 'attach', label: 'Attach Terminal', variant: 'info', ... }
    ],
    // ... other states
};
```

### Files

- `src/lib/config/statusColors.ts` - Centralized visual config (SESSION_STATE_VISUALS, SESSION_STATE_ACTIONS)
- `src/lib/components/work/SessionCard.svelte` - Main component with state detection (imports from statusColors.ts)
- `src/lib/components/work/StatusActionBadge.svelte` - Clickable status badge with dropdown actions

## SessionCard Architecture

### Overview

The **SessionCard** component (`src/lib/components/work/SessionCard.svelte`) is the unified component for displaying agent sessions across the dashboard. It supports three display modes optimized for different contexts.

**Design Philosophy:** One task : One agent : One session. The dashboard follows a simplified model where each agent works on a single task at a time, eliminating the need for task queues, drag-drop assignment, and multi-task conflict detection.

### Display Modes

| Mode | Use Case | Features |
|------|----------|----------|
| `agent` | Work sessions panel | Full terminal output, input field, resize, session controls |
| `server` | Dev server sessions | Process output, start/stop controls |
| `compact` | Kanban cards, Agent grid | Minimal card: agent name, task, tokens, state |

### Usage Examples

**Work Sessions Panel (agent mode):**
```svelte
<SessionCard
  mode="agent"
  sessionName={session.sessionName}
  agentName={session.agentName}
  task={session.task}
  output={session.output}
  tokens={session.tokens}
  cost={session.cost}
  onKillSession={handleKill}
  onSendInput={handleSendInput}
  onTaskClick={handleTaskClick}
/>
```

**Agent Kanban Board (compact mode):**
```svelte
<SessionCard
  mode="compact"
  sessionName={session.sessionName}
  agentName={session.agentName}
  task={session.task}
  tokens={session.tokens}
  cost={session.cost}
  onTaskClick={handleTaskClick}
/>
```

**Agent Grid (compact mode):**
```svelte
<SessionCard
  mode="compact"
  sessionName={`jat-${agent.name}`}
  agentName={agent.name}
  task={agentTask}
  tokens={agent.usage?.today?.total_tokens || 0}
  cost={agent.usage?.today?.cost || 0}
  onTaskClick={handleTaskClick}
/>
```

### State Detection

SessionCard receives agent activity state via SSE from the signals API:

| State | Signal Source | Description |
|-------|---------------|-------------|
| `starting` | No SSE state yet, has task | Agent initializing |
| `working` | `sseState='working'` | Actively coding |
| `needs-input` | `sseState='needs_input'` OR question UI patterns | Waiting for user |
| `ready-for-review` | `sseState='review'` | Asking to complete |
| `completing` | `jat:complete is running` in output | Running completion |
| `completed` | `sseState='completed'` | Task finished |
| `idle` | `sseState='idle'` OR no task assigned | No active work |

**See:** `shared/signals.md` for the complete signal system documentation.

### Files

**Core Component:**
- `src/lib/components/work/SessionCard.svelte` - Main component (~2700 lines)

**Related Components:**
- `src/lib/components/work/WorkPanel.svelte` - Container for agent mode cards
- `src/lib/components/agent/kanban/AgentKanbanBoard.svelte` - Kanban board using compact mode
- `src/lib/components/agent/kanban/AgentKanbanColumn.svelte` - Kanban column wrapper
- `src/lib/components/agents/AgentGrid.svelte` - Agent grid using compact mode

**Configuration:**
- `src/lib/config/statusColors.ts` - Visual state definitions (SESSION_STATE_VISUALS)

**Types:**
- `src/lib/types/agent.ts` - Agent, Task, ActivityState types
- `src/lib/types/signals.ts` - SuggestedTask, HumanAction, SignalState types

### Pages Using SessionCard

| Page | Route | Mode | Component |
|------|-------|------|-----------|
| Work | `/work` | agent | WorkPanel.svelte |
| Kanban | `/kanban` | compact | AgentKanbanBoard.svelte |
| Agents | `/agents` | compact | AgentGrid.svelte |

### Migration from UnifiedAgentCard

The UnifiedAgentCard component tree was removed and consolidated into SessionCard:

**Deleted components:**
- `UnifiedAgentCard.svelte` and all sub-components (header/, task/, queue/, terminal/, metrics/, feed/, actions/, modals/)
- `agentCardConfig.ts`, `unifiedAgentState.ts`, `sessionStateDetection.ts`, `conflictDetection.ts`

**Migration mapping:**
- `UnifiedAgentCard mode="expanded"` → `SessionCard mode="agent"`
- `UnifiedAgentCard mode="compact"` → `SessionCard mode="compact"`
- `UnifiedAgentCard mode="standard"` → `SessionCard mode="compact"` (simplified, no task queue)

## Smart Question UI

### Overview

When an agent uses the `AskUserQuestion` tool, SessionCard displays the question options as clickable buttons instead of requiring manual text input.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SMART QUESTION UI FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Agent calls AskUserQuestion tool                                        │
│     └─► PreToolUse hook fires BEFORE user sees question                     │
│                                                                             │
│  2. Hook writes question data to /tmp/claude-question-tmux-{session}.json   │
│     └─► Contains: questions[], options[], multiSelect flag                  │
│                                                                             │
│  3. Dashboard polls /api/work/{sessionId}/question                          │
│     └─► Returns parsed question data                                        │
│                                                                             │
│  4. SessionCard renders options as buttons                                  │
│     └─► Single-select: Click sends option number immediately               │
│     └─► Multi-select: Click toggles selection, Done button submits         │
│                                                                             │
│  5. Button click sends tmux keys: "1" or "1 2 3" (multi-select)            │
│     └─► Claude Code receives selection, continues workflow                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### PreToolUse Hook

**File:** `.claude/hooks/pre-ask-user-question.sh`

The hook captures question data BEFORE the user answers:

```bash
#!/bin/bash
# Triggered by Claude Code PreToolUse event for AskUserQuestion

# Get tmux session name
tmux_session=$(tmux display-message -p '#S' 2>/dev/null)

# Read JSON from stdin (Claude Code passes tool input)
json_input=$(cat)

# Write to temp file for dashboard to read
echo "$json_input" > "/tmp/claude-question-tmux-${tmux_session}.json"
```

**Hook Configuration:** `.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/pre-ask-user-question.sh"
          }
        ]
      }
    ]
  }
}
```

### Question Data Format

```typescript
interface QuestionData {
    questions: Array<{
        question: string;      // "Which approach should we use?"
        header: string;        // "Approach"
        multiSelect: boolean;  // true = checkboxes, false = radio
        options: Array<{
            label: string;     // "Option A"
            description: string;
        }>;
    }>;
}
```

### Multi-Select Behavior

**Single-Select (multiSelect: false):**
- Click option → sends number immediately
- Example: Click "Option 2" → sends "2" to tmux

**Multi-Select (multiSelect: true):**
- Click options → toggles selection (visual feedback)
- Click "Done" → sends all selected numbers
- Example: Select 1, 3, 4 → Done → sends "1 3 4" + Enter

### tmux Key Sequence

For multi-select with Submit button:

```typescript
// Navigate to Submit option (options.length + 1 because of "Type something" option)
const submitIndex = options.length + 1;
await sendKeys(submitIndex.toString());  // Select Submit
await delay(150);
await sendKeys('Enter');                  // Confirm on review screen
```

### API Endpoint

**GET** `/api/work/{sessionId}/question`

Returns current question data if available:

```json
{
    "hasQuestion": true,
    "question": {
        "questions": [...],
        "timestamp": "2025-12-01T10:30:00Z"
    }
}
```

### UI Components

**Option Buttons:**
```svelte
{#each question.options as option, index}
    <button
        onclick={() => handleOptionClick(index + 1)}
        class:selected={selectedOptions.has(index)}
    >
        {index + 1}. {option.label}
    </button>
{/each}
```

**Multi-Select Done Button:**
```svelte
{#if question.multiSelect && selectedOptions.size > 0}
    <button onclick={submitMultiSelect}>
        Done ({selectedOptions.size} selected)
    </button>
{/if}
```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Buttons don't appear | Hook not configured | Check `.claude/settings.json` has PreToolUse hook |
| Wrong option selected | Index off by 1 | Options are 1-indexed for Claude Code |
| Multi-select doesn't submit | Missing Enter key | Need double-Enter: select Submit, then confirm |
| Question data stale | Old temp file | Files are per-session, check tmux session name |

### Task Reference

- jat-nsrz: Smart Question UI - Parse and display Claude Code question options (completed)

## Sound Effects System

### Overview

The dashboard includes a comprehensive sound effects system using the Web Audio API. All sounds are programmatically generated (no external audio files) and respect user preferences.

**Key Features:**
- 25+ sound effect functions for various UI interactions
- User preference toggle in UserProfile dropdown
- localStorage persistence for sound preference
- Web Audio API with lazy AudioContext initialization (browser autoplay policy compliant)

### User Preference

Sound effects can be enabled/disabled via the UserProfile dropdown in the top navigation bar.

**Implementation:**
- Toggle stored in localStorage (`sounds-enabled` key)
- Default: disabled
- Test sound plays on enable to confirm working

**Files:**
- `src/lib/components/UserProfile.svelte` - Toggle UI
- `src/lib/utils/soundEffects.ts` - `areSoundsEnabled()`, `enableSounds()`, `disableSounds()`

### Sound Categories

| Category | Functions | Trigger |
|----------|-----------|---------|
| **Task Lifecycle** | `playNewTaskChime`, `playTaskStartSound`, `playTaskCompleteSound`, `playTaskExitSound` | Task state changes |
| **Session Actions** | `playCleanupSound`, `playKillSound`, `playAttachSound`, `playInterruptSound` | StatusActionBadge dropdown |
| **Server Control** | `playServerStartSound`, `playServerStopSound` | Server start/stop buttons |
| **State Transitions** | `playNeedsInputSound`, `playReadyForReviewSound` | SessionCard state changes |
| **Feedback** | `playSuccessChime`, `playErrorSound` | Form submissions |
| **Drag-Drop** | `playPickupSound`, `playDropSound` | WorkDropZone interactions |
| **Voice Input** | `playRecordingStartSound`, `playRecordingStopSound` | VoiceInput component |
| **Misc** | `playAgentJoinSound`, `playSwarmSound`, `playCopySound`, `playDeleteSound`, `playAttachmentSound`, `playCelebrationSound`, `playOpenSound` | Various UI interactions |

### Integration Points

| Component | Sounds Used |
|-----------|-------------|
| `StatusActionBadge.svelte` | complete, cleanup, kill, attach, interrupt, start |
| `SessionCard.svelte` | needs-input, ready-for-review, task-complete |
| `TaskCreationDrawer.svelte` | success, error, attachment |
| `WorkDropZone.svelte` | pickup, drop |
| `VoiceInput.svelte` | recording-start, recording-stop |
| `servers/+page.svelte` | server-start, server-stop |

### Adding New Sounds

1. Add function to `src/lib/utils/soundEffects.ts`:
```typescript
export function playMyNewSound(): void {
    if (!areSoundsEnabled()) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 440; // Hz
    gain.gain.value = 0.15;    // Volume (0-1)

    osc.start();
    osc.stop(ctx.currentTime + 0.1); // Duration in seconds
}
```

2. Import and call in component:
```typescript
import { playMyNewSound } from '$lib/utils/soundEffects';

// In event handler
playMyNewSound();
```

### Sound Design Guidelines

| Action Type | Pattern | Example |
|-------------|---------|---------|
| Success/Positive | Ascending tones | Task complete: 523→659→784 Hz |
| Error/Negative | Descending tones | Kill: 400→300→200 Hz |
| Attention/Alert | Repeated short tones | Needs input: 800→600→800 Hz |
| Neutral/Info | Single mid-range tone | Attach: 600 Hz pulse |
| Start/Begin | Rising sweep | Recording start: 300→600 Hz |
| End/Stop | Falling sweep | Recording stop: 600→300 Hz |

### Files

- `src/lib/utils/soundEffects.ts` - All sound functions (830+ lines)
- `src/lib/components/UserProfile.svelte` - Sound toggle UI

### Task Reference

- jat-fr9v: Research and implement sound effects system (completed)

## UI Patterns: Table Row Gradients (hasRowGradient)

### Overview

TaskTable uses horizontal gradients on rows to indicate various states (working, completed, selected, etc.). Due to how CSS `background: inherit` works with gradients, each table cell would render its own copy of the gradient, creating visible column lines.

### The Problem

```css
/* Row has horizontal gradient */
<tr style="background: linear-gradient(90deg, green, transparent)">
  /* Each cell with inherit renders its OWN gradient */
  <td style="background: inherit">...</td>  /* Gradient starts here */
  <td style="background: inherit">...</td>  /* Gradient starts again! */
</tr>
```

**Result:** Gradient appears "chopped up" at column boundaries.

### The Solution: hasRowGradient Pattern

Use `background: transparent` instead of `inherit` when the row has a gradient, so the row's gradient shows through:

```svelte
{@const hasRowGradient = isCompletedByActiveSession || taskIsActive || selectedTasks.has(task.id) || isHuman}

<tr style="background: {hasRowGradient ? 'linear-gradient(90deg, ...)' : ''}">
  <td style="background: {hasRowGradient ? 'transparent' : 'inherit'}">...</td>
  <td style="background: {hasRowGradient ? 'transparent' : 'inherit'}">...</td>
</tr>
```

### When to Use

Apply this pattern to ANY table row that uses:
- Horizontal gradients (`linear-gradient(90deg, ...)`)
- Solid background colors that should span the full row

### Implementation in TaskTable

**Project/Epic mode section (~line 2390):**
```svelte
{@const hasRowGradient = isCompletedByActiveSession || taskIsActive}
```

**Standard grouped mode section (~line 2705):**
```svelte
{@const hasRowGradient = isCompletedByActiveSession || dragOverTask === task.id || selectedTasks.has(task.id) || isHuman || taskIsActive}
```

**Exiting tasks section (~line 2881):**
- Uses hardcoded `background: transparent` (always has row background)

### Row States and Colors

| State | Gradient/Color | Border |
|-------|----------------|--------|
| Completed (active session) | Green gradient `oklch(0.55 0.18 145 / 0.15)` | 3px solid green |
| Working (taskIsActive) | Amber gradient `oklch(0.75 0.15 85 / 0.08)` | 2px solid amber |
| Selected | Solid blue `oklch(0.70 0.18 240 / 0.1)` | 2px solid blue |
| Human task | Solid orange `oklch(0.70 0.18 45 / 0.10)` | 2px solid orange |
| Drag over | Solid blue `oklch(0.70 0.18 240 / 0.15)` | 2px solid blue |

### Working→Completed Transition Animation

When a task transitions directly from working (in_progress) to completed (closed), a smooth color transition animation plays:

**CSS Animation:** `working-to-completed` (1.5s duration)

**Timeline:**
1. **0%** - Amber gradient (working state)
2. **30%** - Brightens as transition begins (hue shifts 85→100)
3. **60%** - Peak green glow with outer/inner shadows (hue 145)
4. **100%** - Settles into final completed green gradient

**Implementation:**
- `workingCompletedTaskIds` state array tracks tasks that just transitioned
- `isWorkingCompleted` const checks if task is in the array
- `task-working-completed` class applies the animation
- Animation clears after 3.5 seconds (matches other completion animations)

**Class Application (in tr element):**
```svelte
{@const isWorkingCompleted = workingCompletedTaskIds.includes(task.id)}
class="... {isWorkingCompleted ? 'task-working-completed' : isCompleted ? 'task-completed' : ''}"
```

**CSS Location:** `src/app.css` - `@keyframes working-to-completed`

### Files

- `src/lib/components/agents/TaskTable.svelte` - Main implementation
- `src/lib/components/agents/TaskActionButton.svelte` - Action buttons for different states

### Task Reference

- jat-2mzr: Retain completed tasks visible in TaskTable (completed)

## UI Patterns: Jump to Session (Click-to-Center)

### Overview

When a user clicks a SessionCard, the card is scrolled to the top of the viewport with a visual highlight effect and the input receives focus. This pattern is called **"Jump to Session"** internally.

### What Happens

1. **Maximize Panel** - Session panel expands to fill viewport (TaskTable collapses below divider)
2. **Scroll** - Card scrolls to viewport top using `scrollIntoView({ behavior: 'smooth', block: 'start' })` at 400ms + double rAF
3. **Highlight Flash** - 2-second glow animation pulses around the card (blue `oklch(0.70 0.18 220)`)
4. **Ring Effect** - DaisyUI `ring-2 ring-info ring-offset-2` adds visual emphasis
5. **Focus Input** - After 550ms delay (after scroll completes), input textarea receives focus with `preventScroll: true`

**Timing Coordination:**
- Store update triggers panel maximize (Svelte effect batching ~16-50ms)
- CSS transition on panel (150ms `duration-150`)
- Scroll happens at 400ms + ~33ms (double requestAnimationFrame)
- Focus happens at 550ms with `preventScroll` to avoid overriding our scroll

**To restore TaskTable:** Click the resizable divider at the bottom of the viewport.

### Implementation

**Function:** `jumpToSession(sessionName, agentName?, options?)` in `src/lib/stores/hoveredSession.ts`

```typescript
export function jumpToSession(
    sessionName: string,
    agentName?: string,
    options?: { maximize?: boolean }  // Default: true
) {
    // Set as hovered so keyboard shortcuts work on it
    hoveredSessionName.set(sessionName);

    // Set highlighted for visual feedback (clears after 2s)
    highlightedSessionName.set(sessionName);

    // Signal to maximize the session panel (tasks page listens)
    if (options?.maximize !== false) {
        maximizeSessionPanel.set(sessionName);
    }

    // Scroll to the session card
    const element = document.querySelector(`[data-agent-name="${agentName}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
    }
}
```

**Panel Maximization:** The `maximizeSessionPanel` store signals the tasks page to collapse the TaskTable. The tasks page subscribes to this store and sets `splitPercent = 100`, `isCollapsed = true`, `collapsedDirection = 'bottom'`.

**Trigger:** `handleCardClick()` in SessionCard.svelte calls `jumpToSession()` and focuses input after delay.

### Scroll Offset for Sticky Header

The dashboard has a sticky TopBar (`h-12` = 48px). To prevent the card from scrolling behind it, SessionCard uses CSS `scroll-margin-top`:

```css
scroll-margin-top: 3.5rem;  /* 56px - accounts for TopBar + breathing room */
```

This tells `scrollIntoView({ block: 'start' })` to leave extra space at the top.

### CSS Animation

**Keyframes:** `@keyframes agent-highlight-flash` in `src/app.css`

```css
@keyframes agent-highlight-flash {
    0%   { box-shadow: 0 0 0 0 oklch(0.70 0.18 220 / 0); }
    20%  { box-shadow: 0 0 30px 10px oklch(0.70 0.18 220 / 0.5); }
    40%  { box-shadow: 0 0 20px 5px oklch(0.70 0.18 220 / 0.3); }
    60%  { box-shadow: 0 0 25px 8px oklch(0.70 0.18 220 / 0.4); }
    80%  { box-shadow: 0 0 15px 3px oklch(0.70 0.18 220 / 0.2); }
    100% { box-shadow: 0 0 0 0 oklch(0.70 0.18 220 / 0); }
}

.agent-highlight-flash {
    animation: agent-highlight-flash 1.5s ease-out forwards;
}
```

### Files

| File | Purpose |
|------|---------|
| `src/lib/stores/hoveredSession.ts` | `jumpToSession()` function, `highlightedSessionName` store, `maximizeSessionPanel` store |
| `src/lib/components/work/SessionCard.svelte` | `handleCardClick()` trigger, scroll-margin-top styling |
| `src/routes/tasks/+page.svelte` | Subscribes to `maximizeSessionPanel` to collapse TaskTable |
| `src/app.css` | `@keyframes agent-highlight-flash` animation |

### When It's Used

- **Click on SessionCard** - Main trigger, scrolls card to view and focuses input
- **Alt+number shortcuts** - Jump to session by position in list
- **TaskIdBadge click** - From TaskTable, jumps to the agent working on that task

### Task Reference

- jat-35hd: Document Jump to Session behavior and fix scroll offset (completed)

## User Templates

### Overview

The dashboard supports custom user templates stored in `~/.config/jat/templates/`. These complement the built-in templates and allow users to save their own command patterns for reuse.

### Architecture

**Storage Location:** `~/.config/jat/templates/{id}.json`

**File Format:**
```json
{
  "id": "my-template",
  "name": "My Template",
  "description": "Description of what this template does",
  "icon": "🔧",
  "content": "# Template Content\n\n{{variable1}}\n{{variable2}}",
  "frontmatter": {
    "description": "Optional frontmatter description",
    "author": "AuthorName",
    "version": "1.0.0",
    "tags": "tag1,tag2"
  },
  "useCase": "When to use this template",
  "variables": [
    {
      "name": "variable1",
      "label": "Variable 1",
      "placeholder": "Enter value...",
      "defaultValue": "",
      "multiline": false,
      "hint": "Help text",
      "required": true
    }
  ],
  "createdAt": "2025-12-19T12:00:00.000Z",
  "updatedAt": "2025-12-19T12:00:00.000Z"
}
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/templates` | List all user templates |
| `POST` | `/api/templates` | Create new template |
| `GET` | `/api/templates/[id]` | Get single template |
| `PUT` | `/api/templates/[id]` | Update template |
| `DELETE` | `/api/templates/[id]` | Delete template |

**Query Parameters:**
- `GET /api/templates?debug` - Include debug info (directory path, exists flag)
- `POST /api/templates?overwrite=true` - Allow overwriting existing template

### UI Integration

**CommandTemplates.svelte** displays both built-in and user templates:
- Built-in templates appear in "Built-in Templates" section
- User templates appear in "Your Templates" section with "custom" badge
- User templates have a slightly different border color (purple tint)
- Link to "/config?tab=templates" for template management

### Utility Functions

**File:** `src/lib/utils/userTemplates.ts`

```typescript
// List templates
const templates = await getAllUserTemplates();
const ids = getUserTemplateIds();

// Get single template
const template = await getUserTemplate('my-template');

// Save template
await saveUserTemplate({
  id: 'my-template',
  name: 'My Template',
  content: '...',
  // ... other fields
});

// Update template
await updateUserTemplate('my-template', { name: 'Updated Name' });

// Delete template
await deleteUserTemplate('my-template');

// Check existence
const exists = userTemplateExists('my-template');

// Validation
const valid = isValidTemplateId('my-template'); // true
const validation = validateTemplate(partialTemplate);

// Import/Export
const json = exportUserTemplate(template);
const imported = await importUserTemplate(json, { overwrite: true });

// Rename
await renameUserTemplate('old-id', 'new-id');

// Duplicate
await duplicateUserTemplate('source-id', 'new-id', 'New Name');
```

### Extended Template Type

```typescript
import type { ExtendedTemplate } from '$lib/config/commandTemplates';

// Built-in templates have isUserTemplate: false
// User templates have isUserTemplate: true
const allTemplates = await getAllTemplates();
const builtIn = allTemplates.filter(t => !t.isUserTemplate);
const userTemplates = allTemplates.filter(t => t.isUserTemplate);
```

### Template ID Requirements

- Length: 2-64 characters
- Characters: alphanumeric, hyphens, underscores
- Must start with letter or number
- Examples: `my-template`, `api_v2`, `workflow-2025`

### Files

**Core:**
- `src/lib/utils/userTemplates.ts` - CRUD operations and validation
- `src/lib/config/commandTemplates.ts` - Template types and built-in templates

**API:**
- `src/routes/api/templates/+server.ts` - List and create endpoints
- `src/routes/api/templates/[id]/+server.ts` - Get, update, delete endpoints

**UI:**
- `src/lib/components/config/CommandTemplates.svelte` - Template picker UI

### Task Reference

- jat-4e31: Add custom user templates (completed)

## Keyboard Shortcuts

### Overview

The dashboard has a comprehensive keyboard shortcut system with three categories: Global shortcuts (work from anywhere), Session shortcuts (require a hovered session), and Command shortcuts (user-assignable).

**Configuration:** Settings → Shortcuts tab in the dashboard.

### Global App Shortcuts

These work from anywhere in the app (unless typing in an input field). All are customizable via Settings.

| Default Shortcut | Action | Description |
|-----------------|--------|-------------|
| `Alt+N` | Create New Task | Opens task creation drawer |
| `Alt+E` | Open Epic Swarm Modal | Launch swarm attack on an epic |
| `Alt+S` | Open Start Next Dropdown | Quick-start a ready task |
| `Alt+Shift+P` | Add New Project | Initialize a new project |

### Session Shortcuts

These require a **hovered session** (mouse over a SessionCard on Work page). All are customizable via Settings.

| Default Shortcut | Action | Description |
|-----------------|--------|-------------|
| `Alt+A` | Attach Terminal | Open session in your terminal |
| `Alt+K` | Kill Session | Terminate the tmux session |
| `Alt+I` | Interrupt Session | Send Ctrl+C to the session |
| `Alt+P` | Pause Session | Pause the agent |
| `Alt+R` | Restart Session | Restart the session |
| `Alt+Shift+C` | Copy Session Contents | Copy terminal output to clipboard |

### System Shortcuts (Non-configurable)

These are fixed and cannot be customized.

| Shortcut | Action | Context |
|----------|--------|---------|
| `Alt+1` through `Alt+9` | Jump to Session by Position | Work page only |
| `Escape` | Close Modals/Drawers | Global |

### Command Shortcuts

Users can assign custom keyboard shortcuts to any slash command. These are stored in browser localStorage.

**To assign:**
1. Go to Settings → Shortcuts tab
2. Find the command in the "Command Shortcuts" section
3. Click "Add shortcut" and press your key combination

**Requirements:**
- Must include a modifier key (Alt, Ctrl, or Meta/Cmd)
- Cannot conflict with existing shortcuts
- Alt+key combinations are recommended (generally safe)

### Implementation

| Component | Purpose |
|-----------|---------|
| `src/lib/stores/keyboardShortcuts.svelte.ts` | Store for shortcut management |
| `src/lib/components/config/KeyboardShortcutsEditor.svelte` | UI for editing shortcuts |
| `src/routes/+layout.svelte` | Global keyboard event handler |
| `src/lib/stores/hoveredSession.ts` | Track which session is hovered |

### Customization API

```typescript
// Get/set command shortcuts
import { getShortcut, setShortcut } from '$lib/stores/keyboardShortcuts.svelte';

setShortcut('/jat:complete', 'Alt+C');
const shortcut = getShortcut('/jat:complete'); // 'Alt+C'

// Get/set global shortcuts
import { getGlobalShortcut, setGlobalShortcut } from '$lib/stores/keyboardShortcuts.svelte';

setGlobalShortcut('new-task', 'Alt+T'); // Override default
const current = getGlobalShortcut('new-task'); // 'Alt+T'

// Reset to default
import { resetGlobalShortcut } from '$lib/stores/keyboardShortcuts.svelte';
resetGlobalShortcut('new-task'); // Back to 'Alt+N'
```

### Task Reference

- jat-tt20r: Add keyboard shortcut documentation to CLAUDE.md

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Clean build cache
rm -rf .svelte-kit node_modules/.vite
```

## CSS color-mix Patterns: Why They Cannot Use Tailwind

### Overview

The `app.css` file contains **45** `color-mix()` uses (189 total across the dashboard, including Svelte components). This section documents why these patterns are **NOT replaceable** with Tailwind utility classes, preventing future contributors from attempting unnecessary refactoring.

### Why color-mix is Used

`color-mix()` provides:
1. **oklch color space** - Perceptually uniform color blending
2. **Variable transparency** - Mix any color with `transparent` at specific percentages
3. **Dynamic theming** - Uses CSS custom properties (`--anim-*`) for theme-aware animations

### Categories of color-mix Usage

#### 1. Animation Keyframes (NOT Replaceable)

**40 of 45 uses** are inside `@keyframes` declarations. **Tailwind classes cannot be used inside @keyframes at all.**

```css
/* ❌ IMPOSSIBLE - Tailwind classes don't work here */
@keyframes task-entrance {
  0% {
    /* Need color values, not classes */
    background-color: color-mix(in oklch, var(--anim-primary) 30%, transparent);
  }
}
```

**Affected animations:**
| Animation | Uses | Purpose |
|-----------|------|---------|
| `task-entrance` | 4 | New task slide-in with blue glow |
| `task-exit` | 2 | Task removal with red fade |
| `task-starting` | 4 | Green glow when work begins |
| `task-completed` | 4 | Gold glow on completion |
| `working-to-completed` | 7 | Amber→green transition effect |
| `epic-completed` | 8 | Triumphant gold/purple celebration |
| `epic-running` | 4 | Pulsing amber for active epics |
| `radar-pulse` | 1 | Empty state radar effect |
| `agent-entrance` | 2 | Agent card pop-in glow |
| `agent-highlight-flash` | 4 | Click-to-jump highlight |

**Total: 40 uses in @keyframes** - None replaceable.

#### 2. Pseudo-Element Gradients (NOT Replaceable)

**3 uses** are in `::after` pseudo-element gradients:

```css
.row-shimmer::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in oklch, var(--anim-warning) 12%, transparent) 25%,
    color-mix(in oklch, var(--anim-warning-bright) 18%, transparent) 50%,
    color-mix(in oklch, var(--anim-warning) 12%, transparent) 75%,
    transparent 100%
  );
}
```

**Why not replaceable:**
- Tailwind cannot define custom gradient stops inside pseudo-elements
- The gradient requires precise percentage-based color mixing
- Uses CSS variables for theme-awareness

#### 3. Static Utility Classes (Theoretically Replaceable, But...)

**2 uses** are in regular CSS classes that could theoretically use Tailwind:

```css
.terminal-search-match {
  background-color: color-mix(in oklch, var(--anim-warning-gold) 40%, transparent);
}
.terminal-search-match.current {
  background-color: color-mix(in oklch, var(--anim-error) 60%, transparent);
}
```

**Why we keep color-mix:**
1. **oklch precision** - `bg-warning/40` uses sRGB, not oklch color space
2. **Theme variable usage** - `--anim-warning-gold` is a custom animation color, not a Tailwind color
3. **Consistency** - Keeps all animation colors in one system

### Summary: What's Replaceable?

| Context | Count | Replaceable? | Reason |
|---------|-------|--------------|--------|
| `@keyframes` declarations | 40 | ❌ NO | Tailwind classes can't be used in keyframes |
| `::after` pseudo-element | 3 | ❌ NO | Custom gradient stops not possible |
| Static classes | 2 | ⚠️ Partial | Would lose oklch precision and theme vars |
| **TOTAL** | **45** | **0-2** | |

### Box-Shadow Patterns

Many color-mix uses create glow effects in `box-shadow`:

```css
box-shadow: 0 0 20px color-mix(in oklch, var(--anim-primary) 40%, transparent);
```

These appear in:
- Animation keyframes (40 uses) - NOT replaceable
- Combined with `inset` shadows for depth effects
- Multi-layered shadows (e.g., `0 0 40px ..., 0 0 60px ..., inset 0 0 25px ...`)

Tailwind's `shadow-*` utilities cannot reproduce these custom glow effects with:
- Dynamic colors from CSS variables
- Multiple layers with different blur radii
- Animated transitions between shadow states

### Gradient Patterns

Linear gradients using color-mix:

```css
background: linear-gradient(90deg,
  color-mix(in oklch, var(--anim-warning) 15%, transparent),
  transparent
);
```

These create:
- Horizontal fades from colored to transparent
- Multi-stop gradients with theme colors
- Animated gradient transitions

Tailwind's `bg-gradient-*` cannot:
- Use CSS variables in gradient stops
- Create arbitrary percentage-based mixing
- Animate gradient colors via keyframes

### For Future Contributors

**DO NOT attempt to replace these patterns with Tailwind classes.** They are:
1. Technically impossible (keyframes, pseudo-elements)
2. Would lose visual fidelity (oklch vs sRGB)
3. Would break theme-awareness (CSS variable usage)

**If adding new animations:**
- Use the existing `--anim-*` CSS variables (defined in `[data-theme='jat']`)
- Follow the `color-mix(in oklch, var(--anim-*) XX%, transparent)` pattern
- Place in app.css with the other animation keyframes

**CSS Variables Available:**
```css
--anim-primary, --anim-primary-bright, --anim-primary-dim
--anim-success, --anim-success-bright, --anim-success-dim
--anim-warning, --anim-warning-bright, --anim-warning-gold
--anim-error, --anim-error-dim
--anim-info, --anim-info-bright, --anim-info-highlight
--anim-secondary, --anim-secondary-bright, --anim-secondary-dim
--anim-base-hover, --anim-base-row
--anim-shimmer-highlight, --anim-shimmer-bright, --anim-shimmer-slow
--anim-transition-mid, --anim-transition-mid-border
```

### Task Reference

- jat-k6zps: Audit app.css animations and document non-replaceable patterns

## References

- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [DaisyUI Themes](https://daisyui.com/docs/themes/)
- [theme-change Library](https://github.com/saadeghi/theme-change)
- [Svelte 5 Runes](https://svelte-5-preview.vercel.app/docs/runes)
- [SvelteKit Docs](https://kit.svelte.dev/docs)
