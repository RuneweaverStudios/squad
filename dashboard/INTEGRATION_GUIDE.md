# Agent Orchestration Frontend Integration Guide

**Task:** jat-4p0 (Frontend Integration)
**Status:** Complete
**Created:** 2025-11-20
**Demo:** http://localhost:5175/api-demo

## Overview

This guide demonstrates how to integrate the Agent Orchestration API (`/api/orchestration`) with SvelteKit 5 frontend components using the reactive `orchestration` store.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (SvelteKit 5)                    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Components                                         │    │
│  │  - Use $derived() for reactive state                │    │
│  │  - Access orchestration.agents, .tasks, etc.       │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Orchestration Store (Svelte 5 runes)              │    │
│  │  - Auto-polling every 3 seconds                    │    │
│  │  - Reactive state with $state                      │    │
│  │  - Derived getters (activeAgents, idleAgents)      │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
└──────────────────────────┼──────────────────────────────────┘
                           ↓ HTTP GET
┌─────────────────────────────────────────────────────────────┐
│                   Backend API (SvelteKit)                   │
│                                                              │
│  /api/orchestration   ← Unified endpoint (recommended)     │
│  /api/agents          ← Agent data only                    │
│  /api/reservations    ← File reservations only             │
│  /api/tasks           ← Tasks only                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Agent Mail   │  │ Beads DBs    │  │ File System  │    │
│  │ SQLite DB    │  │ (Multiple)   │  │ (Projects)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Import the Store

```typescript
import { orchestration } from '$lib/stores/orchestration.svelte';
```

### 2. Use Reactive State

```typescript
<script lang="ts">
  // Access reactive data with $derived
  const agents = $derived(orchestration.agents);
  const tasks = $derived(orchestration.tasks);
  const reservations = $derived(orchestration.reservations);
  const taskStats = $derived(orchestration.taskStats);
  const activeAgents = $derived(orchestration.activeAgents);
  const loading = $derived(orchestration.loading);
  const error = $derived(orchestration.error);
</script>
```

### 3. Start Polling

```typescript
<script lang="ts">
  import { onMount } from 'svelte';

  // Start polling when component mounts
  $effect(() => {
    orchestration.startPolling();

    // Cleanup when component unmounts
    return () => orchestration.stopPolling();
  });
</script>
```

### 4. Use the Data

```svelte
<div class="stats shadow">
  <div class="stat">
    <div class="stat-title">Active Agents</div>
    <div class="stat-value">{activeAgents.length}</div>
  </div>

  <div class="stat">
    <div class="stat-title">Open Tasks</div>
    <div class="stat-value">{taskStats.open}</div>
  </div>
</div>

{#each agents as agent}
  <div class="card">
    <h3>{agent.name}</h3>
    <p>Tasks: {agent.task_count}</p>
    <p>Reservations: {agent.reservation_count}</p>
  </div>
{/each}
```

## Complete Example: Agent Status Dashboard

```svelte
<script lang="ts">
  import { orchestration } from '$lib/stores/orchestration.svelte';

  const activeAgents = $derived(orchestration.activeAgents);
  const reservations = $derived(orchestration.reservations);
  const taskStats = $derived(orchestration.taskStats);
  const loading = $derived(orchestration.loading);

  // Start polling
  $effect(() => {
    orchestration.startPolling();
    return () => orchestration.stopPolling();
  });
</script>

<div class="dashboard">
  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <!-- Agent Grid -->
    <div class="agent-grid">
      {#each activeAgents as agent}
        <div class="agent-card">
          <h3>{agent.name}</h3>
          <div class="badge {agent.active ? 'badge-success' : 'badge-ghost'}">
            {agent.active ? 'Active' : 'Idle'}
          </div>
          <p>Program: {agent.program}</p>
          <p>Model: {agent.model}</p>
          <p>Tasks: {agent.task_count} ({agent.in_progress_tasks} in progress)</p>
          <p>File Locks: {agent.reservation_count}</p>
        </div>
      {/each}
    </div>

    <!-- Task Statistics -->
    <div class="stats">
      <div>Open: {taskStats.open}</div>
      <div>In Progress: {taskStats.in_progress}</div>
      <div>Blocked: {taskStats.blocked}</div>
      <div>Closed: {taskStats.closed}</div>
    </div>

    <!-- File Reservations -->
    <div class="reservations">
      <h2>Active File Reservations</h2>
      {#each reservations as reservation}
        <div class="reservation">
          <strong>{reservation.agent_name}</strong>
          <code>{reservation.path_pattern}</code>
          <span class="badge">{reservation.exclusive ? 'Exclusive' : 'Shared'}</span>
          <small>Expires: {new Date(reservation.expires_ts).toLocaleString()}</small>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

## Available Store Properties

### Data Collections

| Property | Type | Description |
|----------|------|-------------|
| `agents` | `Agent[]` | All registered agents with statistics |
| `reservations` | `Reservation[]` | Active file locks |
| `tasks` | `Task[]` | Tasks (limited to 100 most recent) |
| `unassignedTasks` | `Task[]` | Tasks with no assignee |
| `taskStats` | `TaskStats` | Aggregated statistics |

### Derived Collections

| Property | Type | Description |
|----------|------|-------------|
| `activeAgents` | `Agent[]` | Agents with active reservations or tasks |
| `idleAgents` | `Agent[]` | Agents without active work |

### State

| Property | Type | Description |
|----------|------|-------------|
| `loading` | `boolean` | True while fetching data |
| `error` | `string \| null` | Error message if fetch fails |

## Type Definitions

### Agent

```typescript
interface Agent {
  id: number;
  name: string;
  program: string;
  model: string;
  task_description: string;
  last_active_ts: string;
  reservation_count: number;
  task_count: number;
  open_tasks: number;
  in_progress_tasks: number;
  active: boolean;
}
```

### Reservation

```typescript
interface Reservation {
  id: number;
  path_pattern: string;
  exclusive: number; // 1 = exclusive, 0 = shared
  reason: string;
  created_ts: string;
  expires_ts: string;
  released_ts: string | null;
  agent_name: string;
  project_path: string;
}
```

### Task

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  status: string; // 'open' | 'in_progress' | 'blocked' | 'closed'
  priority: number; // 0-4
  issue_type: string;
  project: string;
  assignee?: string;
  labels: string[];
  depends_on?: Array<{ id: string; title: string; status: string }>;
  blocked_by?: Array<{ id: string; title: string; status: string }>;
}
```

### TaskStats

```typescript
interface TaskStats {
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  closed: number;
  by_priority: {
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
  };
}
```

## Store Methods

### `fetch(options?: { project?: string; agent?: string })`

Manually fetch data from the API once.

```typescript
await orchestration.fetch();
await orchestration.fetch({ project: 'jat' });
await orchestration.fetch({ agent: 'FreeMarsh' });
```

### `startPolling(options?: { project?: string; agent?: string })`

Start automatic polling at 3-second intervals.

```typescript
orchestration.startPolling();
orchestration.startPolling({ project: 'chimaro' });
```

### `stopPolling()`

Stop automatic polling.

```typescript
orchestration.stopPolling();
```

### `destroy()`

Cleanup method (calls `stopPolling()`).

```typescript
orchestration.destroy();
```

## Common Patterns

### Filter by Project

```typescript
<script lang="ts">
  let selectedProject = $state('all');

  $effect(() => {
    if (selectedProject === 'all') {
      orchestration.startPolling();
    } else {
      orchestration.startPolling({ project: selectedProject });
    }
  });
</script>
```

### Show Loading State

```svelte
{#if orchestration.loading}
  <div class="loading loading-spinner"></div>
{:else if orchestration.error}
  <div class="alert alert-error">{orchestration.error}</div>
{:else}
  <!-- Your content -->
{/if}
```

### Display Agent Status Badge

```svelte
{#each agents as agent}
  <span class="badge" class:badge-success={agent.active} class:badge-ghost={!agent.active}>
    {agent.active ? 'Active' : 'Idle'}
  </span>
{/each}
```

### Task Priority Badge

```svelte
{#each tasks as task}
  <span class="badge" class:badge-error={task.priority === 0} class:badge-warning={task.priority === 1} class:badge-info={task.priority === 2}>
    P{task.priority}
  </span>
{/each}
```

### Reservation Type Badge

```svelte
{#each reservations as reservation}
  <span class="badge" class:badge-error={reservation.exclusive} class:badge-info={!reservation.exclusive}>
    {reservation.exclusive ? 'Exclusive' : 'Shared'}
  </span>
{/each}
```

## Manual API Usage (Without Store)

If you prefer to fetch data manually instead of using the reactive store:

```typescript
<script lang="ts">
  let data = $state(null);

  async function fetchOrchestration() {
    const response = await fetch('/api/orchestration');
    data = await response.json();
  }

  onMount(fetchOrchestration);
</script>

{#if data}
  <p>Agents: {data.agents.length}</p>
  <p>Tasks: {data.tasks.length}</p>
{/if}
```

### Fetch Individual Endpoints

```typescript
// Agents only
const agentsRes = await fetch('/api/agents');
const { agents } = await agentsRes.json();

// Reservations only
const resRes = await fetch('/api/reservations');
const { reservations } = await resRes.json();

// Tasks only
const tasksRes = await fetch('/api/tasks');
const { tasks } = await tasksRes.json();

// Tasks with filters
const openTasksRes = await fetch('/api/tasks?status=open&priority=0');
const { tasks: openTasks } = await openTasksRes.json();

// Single task detail
const taskRes = await fetch('/api/tasks/jat-ijo');
const { task } = await taskRes.json();
```

## Performance Tips

1. **Use the unified endpoint:** `/api/orchestration` is optimized and combines all data sources
2. **Stick to 3-second polling:** Recommended interval balances freshness and performance
3. **Filter when possible:** Use `{ project: 'name' }` to reduce data transfer
4. **Limit displayed data:** The API caps tasks at 100, but you may want to show fewer
5. **Cleanup on unmount:** Always call `stopPolling()` in cleanup function

## Testing

Visit the live demo to see all integration patterns in action:

**Demo URL:** http://localhost:5175/api-demo

Features demonstrated:
- ✅ Reactive store integration with Svelte 5 runes
- ✅ Auto-polling with 3-second interval
- ✅ Manual API endpoint testing
- ✅ Real-time agent status display
- ✅ File reservation conflict detection
- ✅ Task statistics visualization
- ✅ Loading and error states
- ✅ Theme-aware DaisyUI styling

## Troubleshooting

### Store not updating

**Problem:** Data doesn't refresh automatically
**Solution:** Ensure `startPolling()` is called in `$effect()` and cleanup is returned

```typescript
$effect(() => {
  orchestration.startPolling();
  return () => orchestration.stopPolling(); // ← Important!
});
```

### Data is empty

**Problem:** All arrays are empty
**Solution:** Check API endpoint directly:

```bash
curl http://localhost:5175/api/orchestration | jq
```

If API returns data but store is empty, check for errors:

```svelte
{#if orchestration.error}
  <p>Error: {orchestration.error}</p>
{/if}
```

### Polling too frequent

**Problem:** Too many requests hitting the API
**Solution:** The store uses the API's recommended 3s interval. To change:

```typescript
// Edit: dashboard/src/lib/stores/orchestration.svelte.ts
const pollInterval = this.data.meta.poll_interval_ms || 3000; // Increase this
```

### Memory leak

**Problem:** Multiple polling intervals running
**Solution:** Ensure cleanup function is returned:

```typescript
$effect(() => {
  orchestration.startPolling();

  // This cleanup runs when component unmounts
  return () => {
    orchestration.stopPolling(); // ← Must be here!
  };
});
```

## Next Steps

### Integrating with Existing Pages

To integrate the store with PaleStar's orchestration UI (when file reservations are released):

**File:** `dashboard/src/routes/orchestration/+page.svelte`

```diff
 <script>
-	import { onMount } from 'svelte';
+	import { orchestration } from '$lib/stores/orchestration.svelte';
 	import TaskQueue from '$lib/components/orchestration/TaskQueue.svelte';
 	import AgentGrid from '$lib/components/orchestration/AgentGrid.svelte';
 	import ThemeSelector from '$lib/components/ThemeSelector.svelte';

-	let tasks = $state([]);
-	let agents = $state([]);
-	let reservations = $state([]);
-
-	// Fetch orchestration data
-	async function fetchData() {
-		try {
-			// For now, mock data until backend API is ready
-			// When API is ready: const response = await fetch('/api/agent-data');
-			tasks = [];
-			agents = [];
-			reservations = [];
-		} catch (error) {
-			console.error('Failed to fetch orchestration data:', error);
-		}
-	}
-
-	// Auto-refresh data every 5 seconds using Svelte reactivity
+	// Use reactive store
+	const tasks = $derived(orchestration.tasks);
+	const agents = $derived(orchestration.agents);
+	const reservations = $derived(orchestration.reservations);
+
+	// Start polling
 	$effect(() => {
-		const interval = setInterval(fetchData, 5000);
-		return () => clearInterval(interval);
+		orchestration.startPolling();
+		return () => orchestration.stopPolling();
 	});
-
-	onMount(() => {
-		fetchData();
-	});
 </script>
```

**Result:** Immediate live data integration with no additional code needed!

### Building New Features

The reactive store enables powerful features with minimal code:

**1. Agent Assignment UI**
```svelte
<select bind:value={selectedAgent}>
  {#each orchestration.activeAgents as agent}
    <option value={agent.name}>{agent.name} ({agent.task_count} tasks)</option>
  {/each}
</select>
```

**2. Conflict Detection**
```typescript
function checkConflict(pattern: string) {
  return orchestration.reservations.some(r =>
    r.path_pattern === pattern && r.exclusive
  );
}
```

**3. Task Queue Filter**
```typescript
const openTasks = $derived(
  orchestration.tasks.filter(t => t.status === 'open')
);
```

**4. Real-time Notifications**
```typescript
$effect(() => {
  if (orchestration.taskStats.blocked > 0) {
    showNotification(`${orchestration.taskStats.blocked} tasks blocked!`);
  }
});
```

## References

- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference
- [Store Implementation](./src/lib/stores/orchestration.svelte.ts) - Store source code
- [Demo Page](./src/routes/api-demo/+page.svelte) - Live integration example
- [Svelte 5 Runes](https://svelte-5-preview.vercel.app/docs/runes) - Official docs
- [SvelteKit](https://kit.svelte.dev/docs) - Framework docs

## Credits

**Built by:** FreeMarsh
**Task:** jat-4p0 (Frontend Integration)
**Date:** 2025-11-20
**Dependencies:** jat-ijo (Data Layer API)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
