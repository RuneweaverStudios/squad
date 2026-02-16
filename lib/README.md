# Query Layers

Node.js query layers for JAT Tasks and Agent Registry, used by the IDE.

## Overview

This directory contains modules for querying JAT data from Node.js:

1. **tasks.js** - Query JAT task databases across multiple projects
2. **agent-mail.js** - Query Agent Registry (agent identities)

## Usage

### Task Query Layer (tasks.js)

Query JAT task databases from Node.js:

```javascript
import { getProjects, getTasks, getTaskById, getReadyTasks } from './lib/tasks.js';

// Get all projects with JAT databases
const projects = getProjects();
// → [{name: "chimaro", path: "/home/user/code/chimaro", dbPath: "..."}]

// Get all tasks across all projects
const allTasks = getTasks();
// → [{id: "project-abc", title: "...", priority: 1, ...}]

// Filter tasks
const openP0Tasks = getTasks({ status: 'open', priority: 0 });

// Get task details with dependencies
const task = getTaskById('chimaro-abc');
// → {id, title, description, dependencies: [...], dependents: [...], comments: [...]}

// Get ready tasks (no blockers)
const readyTasks = getReadyTasks();
```

### Agent Registry Query Layer (agent-mail.js)

Query registered agents from Node.js:

```javascript
import { getAgents } from './lib/agent-mail.js';

// Get all registered agents
const agents = getAgents();
```

## Database Schema

### JAT Tasks Schema

Location: `~/code/PROJECT/.jat/tasks.db`

Key tables:
- `issues` - Tasks with id, title, status, priority, reserved_files, etc.
- `dependencies` - Task dependencies (depends_on relationships)
- `labels` - Task labels
- `comments` - Task comments

### Agent Registry Schema

Location: `~/.agent-mail.db`

Key tables:
- `agents` - Registered agents (name, program, model)

## License

MIT
