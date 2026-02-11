# WebSocket Consolidation Plan

## Problem

Firefox (and all browsers) limit HTTP/1.1 to **6 connections per origin, shared across ALL tabs**.

Each JAT IDE tab currently opens:

| Connection | Type | HTTP Slot |
|---|---|---|
| `/api/sessions/events` | SSE (EventSource) | **Permanently held** |
| `/api/tasks/events` | SSE (EventSource) | **Permanently held** |
| `/ws` | WebSocket | **Freed after upgrade handshake** |

With 1 tab: 2 SSE + 1 WS handshake = 3 slots consumed → 3 left for `fetch()`.
With 2 tabs: 4 SSE + 2 WS handshakes = 6 slots → **0 left for `fetch()` → deadlock**.

The page shows loading skeletons forever because `fetch()` calls queue behind permanent SSE connections that will never close.

## Solution

Route all real-time data through the **existing WebSocket**, eliminating both SSE endpoints.

### Current Architecture (3 persistent connections per tab)

```
Browser Tab
  ├── SSE → /api/sessions/events  (HTTP slot permanently held)
  ├── SSE → /api/tasks/events     (HTTP slot permanently held)
  └── WS  → /ws                   (HTTP slot freed after upgrade)
```

### Target Architecture (1 persistent connection per tab)

```
Browser Tab
  └── WS → /ws
        ├── channel: "sessions"  (replaces /api/sessions/events SSE)
        ├── channel: "tasks"     (replaces /api/tasks/events SSE)
        ├── channel: "agents"    (already exists)
        ├── channel: "output"    (already exists)
        └── channel: "system"    (already exists)
```

After WebSocket upgrade completes, **0 HTTP slots are permanently held**. All 6 slots available for `fetch()`. Multi-tab works perfectly.

## What Already Exists

The WS infrastructure is mature — most of the server-side work is done:

### Server (`ide/src/lib/server/websocket/`)

| File | What It Does |
|---|---|
| `connectionPool.ts` | WS server, channel subscriptions, `broadcast()`, heartbeats, retry queue |
| `watchers.ts` | Watches `.jat/last-touched` (task changes), `.claude/sessions/` (agent state), polls tmux output |
| `messageQueue.ts` | Failed message retry with exponential backoff, priority queues, dead letter handling |
| `vitePlugin.ts` | Attaches WS server to Vite dev server |

Existing broadcast functions:
- `broadcastTaskChange(newTasks, removedTasks)` — task mutations (high priority)
- `broadcastTaskUpdate(taskId, data)` — individual task updates
- `broadcastAgentState(name, state, data)` — agent state changes (high priority)
- `broadcastOutput(sessionName, output, lineCount)` — tmux output (low priority, no retry)
- `broadcastNewMessage(agentName, data)` — agent mail notifications (high priority)

Existing channels: `agents`, `tasks`, `output`, `messages`, `system`

### Client (`ide/src/lib/stores/`)

| File | What It Does |
|---|---|
| `websocket.svelte.ts` | WS client: connect, reconnect with backoff, subscribe to channels, message dispatch |
| `sessionEvents.ts` | SSE client for session output/state (EventSource-based) |
| `taskEvents.ts` | SSE client for task changes (EventSource-based) |

### SSE Endpoints (to be replaced)

| Endpoint | What It Broadcasts |
|---|---|
| `/api/sessions/events` (`+server.ts`) | Session output deltas, signal state changes, question detection, session create/destroy |
| `/api/tasks/events` (`+server.ts`) | Task create/update/delete notifications |

## Migration Phases

Each phase is independently deployable. Phases 1+2 can run alongside SSE (both active simultaneously).

### Phase 1: Server — Add Session Watchers to WS

**Files to modify:** `ide/src/lib/server/websocket/watchers.ts`, `connectionPool.ts`

1. Add `sessions` channel to the channel type and subscriber maps in `connectionPool.ts`:

```typescript
export type Channel = 'agents' | 'tasks' | 'output' | 'messages' | 'sessions' | 'system';
```

2. Add convenience broadcast functions:

```typescript
export function broadcastSessionState(sessionName: string, state: string, data?: unknown) {
  return broadcast('sessions', {
    type: 'session-state',
    sessionName,
    data: { state, ...data }
  }, { priority: 'high' });
}

export function broadcastSessionOutput(sessionName: string, delta: string, lineCount: number) {
  return broadcast('sessions', {
    type: 'session-output',
    sessionName,
    delta,
    lineCount
  }, { priority: 'low', enableRetry: false });
}
```

3. Move watchers from the SSE endpoint into `watchers.ts`:

The SSE endpoint (`/api/sessions/events/+server.ts`) currently watches:
- `/tmp/jat-signal-*` files for agent state signals
- `/tmp/claude-question-*` files for pending questions
- tmux session list for create/destroy events
- tmux pane output for content updates

Add these to `watchers.ts` as new watcher functions that call `broadcastSessionState()` and `broadcastSessionOutput()`.

4. Enhance `tasks` channel with update detection:

The task SSE currently detects status/assignee changes (not just create/delete). Add `broadcastTaskUpdate()` calls to the existing `checkTaskChanges()` function in `watchers.ts` for modified tasks.

### Phase 2: Client — Replace SSE Stores with WS Subscriptions

**Files to modify:** `ide/src/lib/stores/sessionEvents.ts`, `ide/src/lib/stores/taskEvents.ts`, `ide/src/routes/+layout.svelte`

#### `sessionEvents.ts`

Replace EventSource with WS channel subscription:

```typescript
// Before: Opens a persistent SSE connection (holds 1 HTTP slot)
const eventSource = new EventSource('/api/sessions/events');
eventSource.onmessage = (e) => handleEvent(JSON.parse(e.data));

// After: Subscribes to WS channel (0 additional HTTP slots)
import { subscribe, onMessage } from '$lib/stores/websocket.svelte';

export function connectSessionEvents() {
  subscribe(['sessions', 'output']);
  // Reuse exact same handlers — message format matches
}

export function disconnectSessionEvents() {
  unsubscribe(['sessions', 'output']);
}
```

The internal event handlers (`handleSessionOutput`, `handleSessionState`, `handleQuestionDetected`, etc.) remain unchanged — only the transport layer changes.

#### `taskEvents.ts`

```typescript
// Before
const eventSource = new EventSource('/api/tasks/events');

// After
import { subscribe } from '$lib/stores/websocket.svelte';

export function connectTaskEvents() {
  subscribe(['tasks']);
}

export function disconnectTaskEvents() {
  unsubscribe(['tasks']);
}
```

#### `+layout.svelte`

Remove SSE connection registrations:

```typescript
// Before: 3 persistent connections registered with connectionManager
connectionIds = [
  registerConnection('websocket', connectWebSocket, disconnectWebSocket, 5),
  registerConnection('session-events-sse', connectSessionEvents, disconnectSessionEvents, 10),
  registerConnection('task-events-sse', connectTaskEvents, disconnectTaskEvents, 15)
];

// After: 1 persistent connection, SSE functions subscribe via WS internally
connectionIds = [
  registerConnection('websocket', connectWebSocket, disconnectWebSocket, 5),
];
// These now subscribe to WS channels (no new HTTP connections)
connectSessionEvents();
connectTaskEvents();
```

### Phase 3: Remove Dead Code

**Files to delete:**
- `ide/src/routes/api/sessions/events/+server.ts`
- `ide/src/routes/api/tasks/events/+server.ts`

**Files to clean up:**
- `ide/src/lib/utils/connectionManager.ts` — remove SSE-related connection IDs
- `ide/src/routes/+layout.svelte` — remove SSE imports

### Phase 4: Optimize WebSocket Client

Optional improvements after SSE removal:

1. **Leader election via BroadcastChannel** — only one tab holds the WS connection, broadcasts events to other tabs via `BroadcastChannel`. Reduces server-side WS connections from N tabs to 1.

2. **Selective subscriptions** — only subscribe to channels the current page needs (e.g., `/files` page doesn't need `output` channel). Reduces server broadcast overhead.

3. **Binary protocol** — for high-volume output data, use binary WS frames instead of JSON. Reduces serialization overhead.

## Impact

| Metric | Before | After |
|---|---|---|
| Permanent HTTP slots per tab | 2 (SSE) | 0 |
| Persistent connections per tab | 3 (2 SSE + 1 WS) | 1 (WS only) |
| Max tabs before deadlock | 2 | Unlimited |
| HTTP slots available for fetch() (1 tab) | 4 | 6 |
| HTTP slots available for fetch() (3 tabs) | 0 (deadlock) | 6 |
| Server connections (3 tabs) | 9 | 3 |
| Reconnection mechanism | SSE auto-reconnect + custom WS reconnect | Single WS reconnect with backoff |

## Key Insight

WebSocket connections **do not count against the browser's HTTP/1.1 connection limit** after the initial upgrade handshake completes. The upgrade request briefly uses one HTTP slot, then the protocol switches to WS and the slot is released. SSE connections, by contrast, hold an HTTP slot for their entire lifetime.

This is why the existing WS connection doesn't cause problems — it's the two SSE connections that steal 2 of 6 precious HTTP slots permanently.

## Risk Assessment

**Low risk:**
- WS infrastructure is battle-tested (already handles agents, output, tasks channels)
- Message format can remain identical — only transport changes
- Phased migration means SSE and WS can coexist during transition
- Rollback is trivial: re-register SSE connections in layout

**Considerations:**
- EventSource has built-in reconnection; WS reconnect is manual (but already implemented in `websocket.svelte.ts`)
- SSE supports `Last-Event-ID` for missed event recovery; WS needs application-level sequencing (not currently used by either SSE endpoint, so no regression)
- If WS drops, ALL real-time updates stop (single point of failure vs. independent SSE streams). Mitigated by the existing reconnect-with-backoff logic.
