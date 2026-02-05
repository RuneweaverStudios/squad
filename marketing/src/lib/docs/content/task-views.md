# Task Views

JAT provides multiple ways to view and manage tasks across your projects. Each view serves a different workflow, from detailed table operations to visual boards and dependency graphs.

## Task table

The primary task view at `/tasks` renders a sortable, filterable table of all tasks across your projects.

**Sorting** works on any column. Click a column header to sort ascending, click again for descending. Sortable columns include priority, status, type, title, created date, and updated date.

**Filtering** narrows results with these controls:

| Filter | Type | Example |
|--------|------|---------|
| Project | Dropdown | `?project=jat` |
| Status | Multi-select | `open`, `in_progress`, `blocked`, `closed` |
| Priority | Multi-select | P0 through P4 |
| Type | Multi-select | `bug`, `feature`, `task`, `epic`, `chore` |
| Search | Text input | Matches title and description |
| Assignee | Dropdown | Filter by agent name |

**Grouping** organizes rows under collapsible headers. Group by status, priority, type, project, or assignee. Grouped views show task counts per group.

All filters persist in URL parameters. The URL `/tasks?project=jat&status=open&priority=0,1` is bookmarkable and shareable.

## Kanban board

The Kanban view at `/kanban` displays tasks as draggable cards in columns. Default columns map to status values: Open, In Progress, Blocked, Closed.

Drag a card between columns to update its status. The status change saves immediately. Cards show priority badges, type icons, assignee, and project.

You can switch the grouping axis. Group by priority instead of status and the columns become P0, P1, P2, P3, P4 with drag to reprioritize.

## Dependency graph

The graph view renders task dependencies as a directed acyclic graph (DAG). Nodes are tasks, edges show "depends on" relationships.

This view is most useful for epics. An epic with 5 child tasks and 3 inter-child dependencies becomes immediately clear as a graph where youd need mental gymnastics to parse it from a flat list.

Nodes are color-coded by status. Blocked tasks appear red, ready tasks green, in-progress tasks amber. Click any node to open its detail drawer.

## Timeline view

The timeline (Gantt-style) view shows tasks on a horizontal timeline. Each task gets a bar spanning from creation to completion (or current date if still open).

Tasks are stacked vertically and grouped by project or epic. Dependencies appear as arrows connecting bars. This view helps identify scheduling bottlenecks and parallel work opportunities.

## Task detail drawer

Clicking any task ID or title opens the TaskDetailDrawer from the right side. It works in two modes:

**View mode** shows all task fields read-only with color-coded badges for status, priority, and type. Dependencies list each dependency with its own status. Metadata shows creation date, last update, and assignee.

**Edit mode** switches to a full form. Editable fields include title, description, status, priority, type, project, labels, and assignee. Validation runs client-side before submitting.

```svelte
<TaskDetailDrawer
  bind:taskId={selectedTaskId}
  bind:mode={drawerMode}
  bind:isOpen={drawerOpen}
/>
```

The drawer uses `$bindable` props so parent components can control it reactively. After saving edits, the drawer refetches task data and switches back to view mode automatically.

## Task creation drawer

Press Alt+N or click "New Task" to open the creation drawer. It supports multiple input modes:

- **Form** fills in fields manually with AI-powered suggestions for priority, type, and labels
- **Paste** accepts a text description and extracts task fields using AI
- **Template** starts from predefined task templates
- **Generator** creates multiple tasks from a high-level description

Task suggestions use the Claude API (or fall back to `claude -p` CLI) to analyze your description and propose type, priority, and labels. The suggestions appear as clickable chips you can accept or override.

Voice input is available if whisper.cpp is installed. Click the microphone icon next to the title or description field to dictate instead of typing.

## Multi-project filtering

Projects are detected automatically from task ID prefixes. A task with ID `jat-abc` belongs to the `jat` project, `chimaro-xyz` belongs to `chimaro`.

The project filter dropdown appears in the navigation bar and shows task counts per project:

```
All Projects (45) | jat (18) | chimaro (27)
```

Project selection updates the URL parameter (`?project=jat`) so you can bookmark filtered views. Multiple tabs can show different projects simultaneously since the filter is URL-based, not stored in localStorage.

Filters combine with AND logic. `/tasks?project=jat&status=open&priority=0` shows only P0 open tasks from the JAT project.

## See also

- [IDE Overview](/docs/ide-overview/) for the full IDE layout
- [Keyboard Shortcuts](/docs/keyboard-shortcuts/) for task-related hotkeys
- [Work Sessions](/docs/work-sessions/) for monitoring active agents
- [Multi-Agent Swarm](/docs/multi-agent/) for creating tasks via epic swarm
