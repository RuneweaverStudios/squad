# Query Layers & Integration

Node.js query layers for JAT Tasks and Agent Mail, plus integration functions for cross-referencing.

## Overview

This directory contains three modules:

1. **tasks.js** - Query JAT task databases across multiple projects
2. **agent-mail.js** - Query Agent Mail message database
3. **integration.js** - Cross-reference functions linking JAT tasks with Agent Mail activity

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

### Agent Mail Query Layer (agent-mail.js)

Query Agent Mail coordination messages from Node.js:

```javascript
import {
  getThreadMessages,
  getInboxForThread,
  getAgents,
  getThreads,
  searchMessages
} from './lib/agent-mail.js';

// Get all messages in a thread
const messages = getThreadMessages('chimaro-abc');
// → [{id, subject, body_md, sender_name, recipients: [...]}]

// Get agent inbox for specific thread
const inbox = getInboxForThread('PaleStar', 'chimaro-abc', { unreadOnly: true });

// Get all registered agents
const agents = getAgents();

// Get all threads
const threads = getThreads();

// Full-text search messages
const results = searchMessages('authentication bug');
```

### Integration Layer (integration.js)

Cross-reference JAT tasks with Agent Mail activity:

```javascript
import {
  getTaskWithActivity,
  getFileReservationsByTask,
  getAgentsForTask,
  getActiveWork,
  getTaskHandoffHistory,
  getIntegrationStats
} from './lib/integration.js';

// Get task with all Agent Mail activity
const task = getTaskWithActivity('chimaro-abc');
// → {
//     ...task details...,
//     agent_mail: {
//       message_count: 15,
//       messages: [...],
//       reservations: [...],
//       agents: [{name: "PaleStar", message_count: 10, reservation_count: 2}]
//     }
//   }

// Get file reservations for a task
const reservations = getFileReservationsByTask('chimaro-abc');
// → [{agent_name: "PaleStar", path_pattern: "src/**", expires_ts: "..."}]

// Get agents who worked on a task
const agents = getAgentsForTask('chimaro-abc');
// → [{name: "PaleStar", message_count: 10, reservation_count: 2}]

// Get all currently active work
const activeWork = getActiveWork();
// → [{id: "chimaro-abc", ...task..., agent_mail: {...}}]

// Get active work for specific agent
const myWork = getActiveWork({ agentName: 'PaleStar' });

// Get complete task handoff history
const history = getTaskHandoffHistory('chimaro-abc');
// → [
//     {type: "message", timestamp: "...", agent_name: "Alice", subject: "Starting work"},
//     {type: "reservation", timestamp: "...", agent_name: "Alice", subject: "Reserved: src/**"},
//     {type: "message", timestamp: "...", agent_name: "Alice", subject: "Handoff to Bob"},
//     ...
//   ]

// Get integration statistics
const stats = getIntegrationStats();
// → {
//     total_tasks: 451,
//     tasks_with_agent_activity: 12,
//     total_agents: 14,
//     active_work_items: 3,
//     integration_adoption_rate: "2.7%"
//   }
```

## Key Integration Patterns

### Pattern 1: Use Task IDs as Thread IDs

**JAT task ID** = **Agent Mail thread ID**

```bash
# Create JAT task
jt create "Implement auth system" --priority 1
# → Returns: chimaro-abc

# Send Agent Mail message with same ID as thread
am-send "[chimaro-abc] Starting" "..." --thread chimaro-abc

# Reserve files with task ID in reason
am-reserve "src/auth/**" --reason "chimaro-abc: Auth implementation"
```

Then query the integration:

```javascript
const task = getTaskWithActivity('chimaro-abc');
// Returns task with all messages, reservations, and agents
```

### Pattern 2: Track Active Work

See what all agents are currently working on:

```javascript
const activeWork = getActiveWork();

activeWork.forEach(task => {
  console.log(`Task: ${task.id} - ${task.title}`);
  console.log(`Agents: ${task.agent_mail.agents.map(a => a.name).join(', ')}`);
  console.log(`Messages: ${task.agent_mail.message_count}`);
  console.log(`Reservations: ${task.agent_mail.reservations.length}`);
});
```

### Pattern 3: Task Handoff Audit Trail

Get complete history of who worked on a task:

```javascript
const history = getTaskHandoffHistory('chimaro-abc');

// Shows chronological sequence:
// 1. Alice reserved files
// 2. Alice sent "Starting" message
// 3. Alice sent "Blocked" message
// 4. Alice released files
// 5. Bob reserved files
// 6. Bob sent "Taking over" message
// 7. Bob sent "Complete" message
// 8. Bob released files
```

### Pattern 4: Agent Assignment Queries

Show which agents are working on which tasks:

```javascript
// Get all active work for specific agent
const paleStarWork = getActiveWork({ agentName: 'PaleStar' });

// Get agents involved in specific task
const agents = getAgentsForTask('chimaro-abc');
agents.forEach(agent => {
  console.log(`${agent.name}: ${agent.message_count} msgs, ${agent.reservation_count} locks`);
});
```

## Testing

Run the integration test suite:

```bash
node test/test-integration.js
```

This validates:
- Cross-referencing between JAT Tasks and Agent Mail
- File reservation tracking
- Agent assignment queries
- Active work tracking
- Handoff history
- Integration statistics

## Database Schema

### JAT Tasks Schema

Location: `~/code/PROJECT/.jat/tasks.db`

Key tables:
- `issues` - Tasks with id, title, status, priority, etc.
- `dependencies` - Task dependencies (depends_on relationships)
- `labels` - Task labels
- `comments` - Task comments

### Agent Mail Schema

Location: `~/.agent-mail.db`

Key tables:
- `messages` - Coordination messages with thread_id, subject, body_md
- `file_reservations` - File locks with path_pattern, reason, expires_ts
- `agents` - Registered agents
- `message_recipients` - Message delivery tracking

### Integration Key

The `reason` field in `file_reservations` typically contains the JAT task ID:

```sql
-- Example reservation
INSERT INTO file_reservations (reason, ...)
VALUES ('chimaro-abc: Implementing auth system', ...);
```

This allows `getFileReservationsByTask()` to link reservations to tasks.

## Why This Integration Matters

**Before integration:**
- JAT Tasks: Task planning (WHAT to do)
- Agent Mail: Coordination (WHO is doing WHAT)
- No visibility into agent assignments
- No way to see who worked on a task
- No audit trail of handoffs

**After integration:**
- Full visibility: See which agents are working on which tasks
- Audit trail: Complete history of messages + reservations per task
- Active work IDE: Real-time view of agent activity
- Handoff tracking: Know when work was passed between agents
- Metrics: Integration adoption rate, agent activity stats

## Examples

See `test/test-integration.js` for comprehensive usage examples.

See `examples/best-practices.md` for coordination patterns using task IDs as thread IDs.

## Contributing

When adding new integration functions:

1. Add to `lib/integration.js`
2. Add test case to `test/test-integration.js`
3. Document pattern in this README
4. Run `node test/test-integration.js` to verify

## License

MIT
