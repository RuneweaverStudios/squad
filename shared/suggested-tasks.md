## Suggested Tasks Flow

**Agents discover follow-up work during task completion and signal it to the dashboard for human review and batch creation.**

This document explains how suggested tasks flow from agent discovery to Beads task creation.

### Overview

During task completion, agents often discover related work that should be tracked:
- Similar bugs in other files
- Tech debt noticed while fixing issues
- Features that would improve the area worked on
- Documentation that needs updating

Rather than creating tasks immediately, agents signal these discoveries to the dashboard where humans can review, edit, and selectively create them.

### Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUGGESTED TASKS FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Agent discovers follow-up work during task completion                   │
│     └─► Notices tech debt, related bugs, improvement opportunities         │
│                                                                             │
│  2. Agent includes suggestedTasks in completion signal                      │
│     └─► jat-signal complete '{"suggestedTasks": [...]}'                    │
│                                                                             │
│  3. PostToolUse hook captures signal                                        │
│     └─► Writes JSON to /tmp/jat-signal-{session}.json                      │
│                                                                             │
│  4. Dashboard SSE server broadcasts completion bundle                       │
│     └─► session-complete event sent to all connected clients               │
│                                                                             │
│  5. SessionCard/EventStack displays suggested tasks                         │
│     └─► SuggestedTasksSection renders interactive task cards               │
│                                                                             │
│  6. Human reviews and edits tasks in dashboard                              │
│     └─► Edit priority, type, title, description, project, labels           │
│                                                                             │
│  7. Human clicks "Create Tasks" to batch create in Beads                    │
│     └─► POST /api/tasks/bulk creates selected tasks                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Side: Signaling Suggested Tasks

#### When to Suggest Tasks

Suggest follow-up tasks when you discover:

| Discovery Type | Example |
|----------------|---------|
| Similar bugs | "Found same null check issue in 3 other files" |
| Tech debt | "This function is 500 lines, should be refactored" |
| Missing features | "OAuth works but Apple Sign-In isn't implemented yet" |
| Documentation gaps | "API endpoints undocumented" |
| Test coverage | "No integration tests for this flow" |
| Performance issues | "Query is O(n²), needs optimization" |

#### Suggested Task Structure

```typescript
interface SuggestedTask {
  type: "feature" | "bug" | "task" | "chore" | "epic";
  title: string;           // Short, descriptive title (3-8 words)
  description: string;     // What needs to be done
  priority: number;        // 0-4 (P0=critical, P4=backlog)
  reason?: string;         // Why this was discovered (helps humans understand context)
  project?: string;        // Target project (defaults to current)
  labels?: string;         // Comma-separated labels
  depends_on?: string[];   // Task IDs this depends on
}
```

#### Priority Guidelines

| Priority | Name | When to Use |
|----------|------|-------------|
| P0 | Critical | Blocks other work, security issues, data loss |
| P1 | High | Should be done soon, impacts users directly |
| P2 | Medium | Normal backlog priority (default) |
| P3 | Low | Nice to have, no immediate impact |
| P4 | Backlog | Someday/maybe, long-term improvements |

#### Signaling During Completion

Include suggested tasks in your completion signal:

```bash
jat-signal complete '{
  "taskId": "jat-abc",
  "agentName": "WisePrairie",
  "summary": ["Fixed auth flow", "Added retry logic"],
  "quality": {"tests": "passing", "build": "clean"},
  "suggestedTasks": [
    {
      "type": "feature",
      "title": "Add Apple Sign-In support",
      "description": "Similar flow to Google OAuth, needs Apple Developer setup",
      "priority": 2,
      "reason": "Discovered while implementing Google OAuth"
    },
    {
      "type": "task",
      "title": "Add OAuth error tracking",
      "description": "Log failed OAuth attempts to Sentry for debugging",
      "priority": 3
    },
    {
      "type": "bug",
      "title": "Fix token refresh race condition",
      "description": "Two concurrent refreshes can invalidate each other",
      "priority": 1,
      "reason": "Found during testing of retry logic"
    }
  ]
}'
```

### Dashboard Side: Task Review UI

#### SuggestedTasksSection Component

The dashboard renders suggested tasks in an interactive panel with:

- **Checkbox selection** - Select tasks to create
- **Human/Agent indicator** - 🧑 for human tasks (bugs), 🤖 for automatable tasks
- **Priority dropdown** - Edit P0-P4 priority
- **Type dropdown** - Change between feature/bug/task/chore/epic
- **Editable title** - Double-click to edit inline
- **Expandable description** - Click to view/edit full description
- **Project selector** - Assign to different project
- **Labels input** - Add comma-separated labels
- **Dependencies** - Link to blocking tasks
- **"Already Created" badge** - Prevents duplicate creation

#### Features

**Bulk Actions:**
- Select All / Deselect All
- "Create Selected Tasks" button
- Count of selected vs total tasks

**Smart Detection:**
- Auto-detects if task already exists in Beads (by title match)
- Shows "Created" badge for duplicates
- Prevents re-creation of existing tasks

**Inline Editing:**
- All fields editable before creation
- "Edited" badge shows modified tasks
- Revert button to restore original values

#### Where Tasks Appear

| Location | Component | Trigger |
|----------|-----------|---------|
| Work page session card | SessionCard | Completion signal received |
| EventStack timeline | EventStack | Completion bundle event |
| Suggested Tasks Modal | SuggestedTasksModal | Click 💡 badge on session |

### API: Bulk Task Creation

**Endpoint:** `POST /api/tasks/bulk`

Creates multiple tasks in Beads using the `bd create` command.

#### Request Format

```typescript
interface BulkCreateRequest {
  tasks: SuggestedTask[];  // Array of tasks to create
  project?: string;        // Default project for all tasks
}
```

#### Response Format

```typescript
interface BulkCreateResponse {
  success: boolean;        // True if all tasks created
  results: TaskResult[];   // Per-task results
  created: number;         // Count of successfully created
  failed: number;          // Count of failures
  message: string;         // Human-readable summary
}

interface TaskResult {
  title: string;           // Task title
  taskId?: string;         // Created task ID (e.g., "jat-abc")
  success: boolean;        // Whether creation succeeded
  error?: string;          // Error message if failed
}
```

#### Example Request

```bash
curl -X POST http://localhost:5174/api/tasks/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "project": "jat",
    "tasks": [
      {
        "type": "feature",
        "title": "Add dark mode toggle",
        "description": "User preference for dark/light theme",
        "priority": 2
      },
      {
        "type": "bug",
        "title": "Fix login redirect loop",
        "description": "Users get stuck in redirect loop on expired session",
        "priority": 1
      }
    ]
  }'
```

#### Response

```json
{
  "success": true,
  "results": [
    {"title": "Add dark mode toggle", "taskId": "jat-xk9", "success": true},
    {"title": "Fix login redirect loop", "taskId": "jat-xka", "success": true}
  ],
  "created": 2,
  "failed": 0,
  "message": "Successfully created 2 tasks"
}
```

#### Type Aliases

The API normalizes common type variations:

| Input Type | Normalized To |
|------------|---------------|
| docs, documentation, doc | chore |
| test, tests, testing | chore |
| refactor, refactoring, cleanup | chore |
| improvement, enhancement | feature |
| fix, hotfix | bug |
| story | feature |
| spike, research | task |

### AI-Powered Suggestions

#### Auto-Suggest API

The dashboard includes an AI endpoint that analyzes task titles and suggests metadata:

**Endpoint:** `POST /api/tasks/suggest`

Given a task title and description, Claude Haiku suggests:
- Priority (P0-P4)
- Type (task/bug/feature/epic/chore)
- Project (from available projects)
- Labels (2-4 relevant tags)
- Dependencies (from open tasks)

#### Usage in TaskCreationDrawer

When creating a task manually, click "Auto-suggest" to get AI recommendations:

1. Enter task title (and optionally description)
2. Click "✨ Suggest" button
3. AI analyzes text and suggests metadata
4. Review and accept/modify suggestions
5. Create task with pre-filled fields

### Files Reference

**Agent Side:**
- `signal/jat-signal` - Signal command tool
- `signal/jat-signal-validate` - Signal payload validation
- `signal/jat-signal-schema.json` - JSON schema for signals
- `.claude/hooks/post-bash-jat-signal.sh` - PostToolUse hook
- `commands/jat/complete.md` - Completion workflow documentation

**Dashboard Side:**
- `dashboard/src/lib/components/work/SuggestedTasksSection.svelte` - Inline panel UI
- `dashboard/src/lib/components/work/SuggestedTasksModal.svelte` - Modal UI
- `dashboard/src/lib/components/work/EventStack.svelte` - Timeline integration
- `dashboard/src/lib/components/work/SessionCard.svelte` - Session integration
- `dashboard/src/routes/api/tasks/bulk/+server.ts` - Bulk creation API
- `dashboard/src/routes/api/tasks/suggest/+server.js` - AI suggestion API
- `dashboard/src/lib/stores/sessionEvents.ts` - SSE event handling
- `dashboard/src/lib/types/signals.ts` - TypeScript interfaces

### Best Practices

#### For Agents

1. **Be specific** - Write clear, actionable task titles
2. **Include context** - Use `reason` field to explain why task was discovered
3. **Prioritize thoughtfully** - Don't mark everything P1
4. **Group related tasks** - Similar work should be separate but related
5. **Don't duplicate** - Check if similar task already exists

#### For Humans

1. **Review before creating** - Edit titles for clarity
2. **Adjust priorities** - Agent priorities are suggestions
3. **Add project/labels** - Help with organization
4. **Skip duplicates** - Don't create if similar task exists
5. **Batch create** - Create multiple related tasks together

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Tasks not appearing in dashboard | Signal not sent | Check agent sent `jat-signal complete` |
| SSE not broadcasting | Hook not firing | Verify PostToolUse hook in settings.json |
| Duplicate task created | Title check failed | Tasks are matched by exact title |
| Wrong project assigned | Project not specified | Set project in task or request |
| Bulk API returns 400 | Invalid task type | Check type is valid or use alias |

### Example Complete Flow

```bash
# 1. Agent finishes task and discovers follow-up work
# 2. Agent signals completion with suggested tasks:

jat-signal complete '{
  "taskId": "jat-xyz",
  "agentName": "CalmMeadow",
  "summary": ["Implemented user authentication", "Added password reset flow"],
  "quality": {"tests": "passing", "build": "clean"},
  "suggestedTasks": [
    {
      "type": "feature",
      "title": "Add 2FA authentication",
      "description": "Support TOTP-based two-factor auth for enhanced security",
      "priority": 2,
      "reason": "Security best practice noticed during auth implementation"
    },
    {
      "type": "chore",
      "title": "Document authentication API",
      "description": "Add OpenAPI specs for /auth/* endpoints",
      "priority": 3
    }
  ]
}'

# 3. Dashboard shows completion bundle with suggested tasks
# 4. Human reviews tasks in SuggestedTasksSection
# 5. Human edits 2FA task priority to P1, adds "security" label
# 6. Human selects both tasks and clicks "Create Tasks"
# 7. Dashboard calls POST /api/tasks/bulk
# 8. Tasks created in Beads: jat-abc (2FA), jat-abd (docs)
# 9. Success message shown, tasks appear in task list
```

### Creating Epics with Children

When creating multiple related tasks that should be grouped under an epic:

```bash
# 1. Create the epic first
bd create "Epic: Rich Signals System" --type epic --priority 1

# 2. Create child tasks
bd create "Define signal schema" --type task --priority 1
bd create "Implement jat-signal command" --type task --priority 1
bd create "Add PostToolUse hook" --type task --priority 2

# 3. Link children to epic (USE THE HELPER SCRIPT!)
# ⚠️ CRITICAL: bd dep add order is easy to get backwards!
bd-epic-child jat-abc jat-def   # Epic depends on child (correct)
bd-epic-child jat-abc jat-ghi   # Epic depends on child (correct)
bd-epic-child jat-abc jat-jkl   # Epic depends on child (correct)

# ❌ WRONG (creates child blocked by epic):
# bd dep add jat-def jat-abc   # Child depends on epic - WRONG!
```

**Why `bd-epic-child`?**
- `bd dep add A B` means "A depends on B" (A is blocked until B completes)
- Easy to accidentally write `bd dep add child epic` (WRONG direction)
- `bd-epic-child epic child` always does the right thing

See `shared/beads.md` for full epic creation documentation.
