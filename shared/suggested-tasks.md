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
  title: string;           // Descriptive title (5-12 words, actionable verb, specific target)
  description: string;     // DETAILED standalone description (2-4 sentences) - see below
  priority: number;        // 0-4 (P0=critical, P4=backlog)
  reason?: string;         // Why this was discovered (specific context from the completed work)
  project?: string;        // Target project (defaults to current)
  labels?: string;         // Comma-separated labels
  depends_on?: string[];   // Task IDs this depends on
}
```

**CRITICAL: Task descriptions must be STANDALONE.** The agent picking up this task will NOT have context from your current work. Include:
- **WHAT**: Specific work that needs to be done
- **WHERE**: File paths, component names, function names
- **WHY**: Context explaining why this matters (from your current task)
- **HOW**: Brief approach if non-obvious

**Bad example:** "Fix the issue with the modal" - Vague, which modal? What issue?
**Good example:** "Fix race condition in TaskDetailDrawer.svelte where the drawer closes and re-opens when clicking the overlay. The issue is caused by both the 'for' attribute and onclick handler triggering simultaneously. Remove the 'for' attribute from the overlay label (line ~467) to fix the double-toggle bug."

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
      "title": "Implement Apple Sign-In OAuth flow in auth module",
      "description": "Add Apple Sign-In alongside existing Google OAuth in src/lib/auth/providers/. Reuse the OAuth callback pattern from google.ts. Requires Apple Developer account setup for Sign In with Apple service ID and private key. Reference the Google implementation in src/lib/auth/providers/google.ts for the callback URL structure and token exchange flow.",
      "priority": 2,
      "reason": "User requested during Google OAuth implementation - same auth flow needed"
    },
    {
      "type": "task",
      "title": "Add Sentry error tracking for OAuth authentication failures",
      "description": "Instrument the OAuth callback handlers in src/lib/auth/callback.ts to log failed authentication attempts to Sentry. Capture: provider name, error type, timestamp, and anonymized user identifier. Use Sentry.captureException with custom context. This will help debug intermittent auth failures reported by users.",
      "priority": 3,
      "reason": "No visibility into auth failures during production OAuth testing"
    },
    {
      "type": "bug",
      "title": "Fix token refresh race condition in src/lib/auth/refresh.ts",
      "description": "The refreshAccessToken() function can be called concurrently by multiple tabs/requests, causing both to invalidate each other's tokens. Add a mutex or deduplication mechanism using a shared promise. When a refresh is in progress, subsequent calls should await the existing promise rather than starting a new refresh. See similar pattern in src/lib/cache/dedup.ts.",
      "priority": 1,
      "reason": "Users logged out unexpectedly when multiple API calls triggered simultaneous refreshes"
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

1. **Write STANDALONE descriptions** - The next agent has NO context. Include file paths, component names, function signatures, and enough detail to start immediately
2. **Be specific in titles** - Use 5-12 words with actionable verbs (e.g., "Add rate limiting to /api/upload endpoint" not "Fix upload")
3. **Include the WHY** - Use `reason` field to explain what you discovered and why it matters
4. **Prioritize thoughtfully** - Don't mark everything P1. P2 is normal, P3 is nice-to-have
5. **Group related tasks** - Similar work should be separate but related via epic
6. **Don't duplicate** - Check if similar task already exists before suggesting

#### For Humans

1. **Review descriptions** - Agent suggestions should be detailed; if vague, reject or edit
2. **Adjust priorities** - Agent priorities are suggestions based on limited context
3. **Add project/labels** - Help with organization and filtering
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
      "title": "Implement TOTP-based two-factor authentication for user accounts",
      "description": "Add 2FA support to the auth module in src/lib/auth/. Create a new TwoFactorAuth.svelte component in src/lib/components/auth/ that displays QR code for authenticator apps (Google Authenticator, Authy). Store encrypted TOTP secrets in the users.totp_secret column. Add verification endpoint at /api/auth/verify-2fa. Use the otpauth npm package for TOTP generation/verification.",
      "priority": 2,
      "reason": "Security best practice - password-only auth is insufficient for sensitive user data"
    },
    {
      "type": "chore",
      "title": "Add OpenAPI documentation for all /auth/* API endpoints",
      "description": "Create or update src/routes/api/auth/openapi.yaml with OpenAPI 3.0 specs for: /auth/login, /auth/logout, /auth/register, /auth/reset-password, /auth/verify-email. Include request/response schemas, error codes, and example payloads. Add Swagger UI route at /api/docs for interactive testing. Reference existing OpenAPI patterns in src/routes/api/users/openapi.yaml.",
      "priority": 3,
      "reason": "No API documentation exists for auth endpoints - blocking frontend team integration"
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
