# Beads IDE API Documentation

## Overview

The Beads Task IDE provides a REST API for accessing task, agent, and coordination data. All endpoints return JSON and support CORS for local development.

## Base URL

```
http://localhost:3333/api
```

## Endpoints

### Tasks

#### GET /api/tasks

Get all tasks from all projects with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (`open`, `in_progress`, `blocked`, `closed`)
- `priority` (optional): Filter by priority (`0`-`4`)
- `project` (optional): Filter by project name (`chimaro`, `jomarchy`, etc.)

**Response:**
```json
{
  "tasks": [
    {
      "id": "jat-42o",
      "title": "Demo: Backend API setup",
      "status": "closed",
      "priority": 0,
      "labels": ["backend", "api"],
      "depends_on": [],
      "blocked_by": [],
      "project": "jat",
      "created_at": "2025-11-20T05:01:00Z",
      "updated_at": "2025-11-20T05:01:00Z"
    }
  ]
}
```

#### GET /api/tasks/[id]

Get detailed information for a specific task.

**Path Parameters:**
- `id`: Task ID (e.g., `jat-42o`)

**Response:**
```json
{
  "task": {
    "id": "jat-42o",
    "title": "Demo: Backend API setup",
    "description": "Set up Express server and database",
    "status": "closed",
    "priority": 0,
    "labels": ["backend", "api"],
    "depends_on": [],
    "blocked_by": [
      {
        "id": "jat-4p0",
        "title": "Demo: Frontend integration",
        "status": "open",
        "priority": 1
      }
    ],
    "comments": [],
    "project": "jat",
    "project_path": "/home/jw/code/jat",
    "created_at": "2025-11-20T05:01:00Z",
    "updated_at": "2025-11-20T05:01:00Z",
    "assignee": null
  }
}
```

### Agents

#### GET /api/agents

Get all registered agents with their activity information.

**Response:**
```json
{
  "agents": [
    {
      "name": "PaleStar",
      "program": "claude-code",
      "model": "sonnet-4.5",
      "task_description": "Full-stack development",
      "inception_ts": "2025-11-18T10:00:00Z",
      "last_active_ts": "2025-11-20T05:00:00Z",
      "project_path": "/home/jw/code/jomarchy"
    }
  ]
}
```

### File Reservations

#### GET /api/reservations

Get active file reservations (locks) across all projects.

**Query Parameters:**
- `agent` (optional): Filter by agent name

**Response:**
```json
{
  "reservations": [
    {
      "id": 1,
      "path_pattern": "src/**/*.ts",
      "exclusive": 1,
      "reason": "jat-ijo: Agent data layer",
      "created_ts": "2025-11-20T05:30:00Z",
      "expires_ts": "2025-11-20T06:30:00Z",
      "released_ts": null,
      "agent_name": "PaleStar",
      "project_path": "/home/jw/code/jat"
    }
  ]
}
```

### Agent Orchestration (Unified)

#### GET /api/orchestration

Get unified view of all agent coordination data. This endpoint combines agents, reservations, tasks, and statistics into a single response optimized for IDE views.

**Query Parameters:**
- `project` (optional): Filter all data by project name
- `agent` (optional): Filter reservations by agent name

**Response:**
```json
{
  "agents": [
    {
      "name": "PaleStar",
      "program": "claude-code",
      "model": "sonnet-4.5",
      "reservation_count": 2,
      "task_count": 5,
      "open_tasks": 3,
      "in_progress_tasks": 2,
      "active": true
    }
  ],
  "reservations": [...],
  "reservations_by_agent": {
    "PaleStar": [...]
  },
  "tasks": [...],
  "unassigned_tasks": [...],
  "task_stats": {
    "total": 485,
    "open": 65,
    "in_progress": 12,
    "blocked": 3,
    "closed": 405,
    "by_priority": {
      "p0": 15,
      "p1": 42,
      "p2": 128,
      "p3": 200,
      "p4": 100
    }
  },
  "tasks_with_deps_count": 42,
  "tasks_with_deps": [...],
  "timestamp": "2025-11-20T05:45:00Z",
  "meta": {
    "poll_interval_ms": 3000,
    "data_sources": ["agent-mail", "beads"],
    "cache_ttl_ms": 2000
  }
}
```

**Recommended Usage:**
- Poll this endpoint every 3 seconds (as indicated by `meta.poll_interval_ms`)
- Use for reactive IDE updates
- Frontend Svelte stores should cache with 2-second TTL

## Data Sources

The API aggregates data from two main sources:

1. **Agent Mail** (`~/.agent-mail.db`):
   - Agents registry
   - File reservations
   - Message threads

2. **Beads** (`.beads/beads.base.jsonl` per project):
   - Tasks and issues
   - Task dependencies
   - Task status and metadata

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Successful request
- `404 Not Found`: Task not found
- `500 Internal Server Error`: Server error

Error responses include:
```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Rate Limiting

Currently no rate limiting is enforced. For the orchestration endpoint, the recommended poll interval is 3 seconds to balance reactivity and performance.

## CORS

All endpoints support CORS for local development at `http://localhost:*`.

## Authentication

Currently no authentication is required. This is a local development IDE.

## Performance Notes

- **Task limiting**: The orchestration endpoint returns max 100 tasks (most recent) to optimize performance
- **Dependency loading**: Task dependencies are eagerly loaded in `/api/tasks` but lazy-loaded in `/api/tasks/[id]`
- **Caching**: Frontend should implement 2-second cache TTL as suggested in orchestration response

## Example: Building a Reactive Agent IDE

```javascript
// Svelte store example
import { writable } from 'svelte/store';

export const orchestrationData = writable({
  agents: [],
  tasks: [],
  reservations: []
});

// Poll every 3 seconds
setInterval(async () => {
  const res = await fetch('/api/orchestration');
  const data = await res.json();
  orchestrationData.set(data);
}, 3000);
```

## Future Enhancements

Potential improvements for future iterations:

- WebSocket support for real-time updates
- Server-sent events (SSE) for push updates
- GraphQL endpoint for flexible queries
- Task mutation endpoints (create, update, close)
- Agent Mail message endpoints
- Pagination for large task lists
- Field filtering to reduce response size
