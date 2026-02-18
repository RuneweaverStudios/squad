# IDE API reference

The SQUAD IDE exposes REST endpoints for sessions, tasks, agents, configuration, and file operations. All endpoints are served by the SvelteKit application (default port 5174).

## Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/events` | SSE stream for real-time session updates |
| GET | `/api/sessions/[name]/timeline` | Session timeline events |
| GET | `/api/sessions/[name]/activity` | Session activity feed |
| POST | `/api/sessions/[name]/pause` | Pause an agent session |
| POST | `/api/sessions/[name]/resume` | Resume a paused session |
| POST | `/api/sessions/[name]/signal` | Write instant signal for UI feedback |
| POST | `/api/sessions/[name]/custom-question` | Send custom question to agent |
| GET | `/api/sessions/activity` | Aggregated activity across sessions |
| GET | `/api/sessions/next` | Get next available task for spawning |
| POST | `/api/sessions/yolo` | Toggle YOLO mode for all sessions |

## Work and spawning

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work` | List active work sessions (add `?usage=true` for tokens) |
| POST | `/api/work/spawn` | Spawn a new agent session |

Spawn request body:

```json
{
  "taskId": "squad-abc",
  "model": "opus",
  "attach": false,
  "project": "squad"
}
```

## Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks/events` | SSE stream for task change events |
| GET | `/api/tasks/sessions` | Tasks grouped by session |
| POST | `/api/tasks/parse` | Parse task from natural language |
| POST | `/api/tasks/bulk` | Bulk task operations |
| POST | `/api/tasks/generate` | AI-generate tasks from description |
| GET | `/api/tasks/[id]` | Get single task details |
| PUT | `/api/tasks/[id]` | Update a task |
| DELETE | `/api/tasks/[id]` | Delete a task |
| POST | `/api/tasks/[id]/epic` | Link task to an epic |
| GET | `/api/tasks/[id]/sessions` | Sessions that worked on this task |
| GET | `/api/tasks/[id]/signals` | Signal history for a task |
| GET | `/api/tasks/[id]/summary` | AI-generated task summary |

## Epics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/epics` | List all epics |
| GET | `/api/epics/active` | Currently active epics |
| GET | `/api/epics/close-eligible` | Epics ready to close |
| GET | `/api/epics/[id]/children` | Child tasks of an epic |
| POST | `/api/epics/[id]/close` | Close an epic |

## Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/defaults` | Get global defaults (model, stagger, etc.) |
| PUT | `/api/config/defaults` | Update global defaults |
| GET | `/api/config/agents` | List configured agent programs |
| POST | `/api/config/agents` | Add a new agent program |
| PUT | `/api/config/agents/[id]` | Update an agent program |
| DELETE | `/api/config/agents/[id]` | Remove an agent program |
| PUT | `/api/config/agents/[id]/default` | Set agent as default |
| GET | `/api/config/agents/routing` | Get routing rules |
| PUT | `/api/config/agents/routing` | Update routing rules |
| POST | `/api/config/agents/verify` | Verify agent CLI is available |
| GET | `/api/config/credentials` | Get API keys (masked) |
| PUT | `/api/config/credentials` | Set/update an API key |
| DELETE | `/api/config/credentials` | Delete an API key |
| GET | `/api/config/credentials/custom` | Get custom API keys |
| PUT | `/api/config/credentials/custom` | Set custom API key |
| GET | `/api/config/credentials/[project]` | Get project secrets |
| GET | `/api/config/user` | Get user preferences |
| PUT | `/api/config/user` | Update user preferences |
| GET | `/api/config/commit-message` | Get commit message template |
| GET | `/api/config/state-actions` | Get state action configuration |
| GET | `/api/config/llm` | Get LLM configuration |

## Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files?path=...&project=...` | List directory contents |
| GET | `/api/files/content?path=...` | Read file content |
| POST | `/api/files/content` | Create new file |
| PUT | `/api/files/content` | Write file content |
| PATCH | `/api/files/content` | Rename file or folder |
| DELETE | `/api/files/content?path=...` | Delete file or folder |
| GET | `/api/files/search?q=...` | Fuzzy file search |
| GET | `/api/files/grep?pattern=...` | Search file contents |
| POST | `/api/files/validate` | Validate file path |
| GET | `/api/files/media?path=...` | Serve media files |

## Git operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files/git/status` | Git status |
| GET | `/api/files/git/log` | Commit history |
| GET | `/api/files/git/diff` | File diffs |
| GET | `/api/files/git/show` | Show commit details |
| GET | `/api/files/git/branch` | List branches |
| POST | `/api/files/git/stage` | Stage files |
| POST | `/api/files/git/unstage` | Unstage files |
| POST | `/api/files/git/commit` | Create commit |
| POST | `/api/files/git/discard` | Discard changes |
| POST | `/api/files/git/checkout` | Checkout branch |
| POST | `/api/files/git/pull` | Pull from remote |
| POST | `/api/files/git/push` | Push to remote |
| POST | `/api/files/git/fetch` | Fetch from remote |
| POST | `/api/files/git/generate-commit-message` | AI-generate commit message |

## Other endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review-rules` | Get review rules |
| PUT | `/api/review-rules` | Update review rules |
| POST | `/api/review-rules` | Reset to defaults |
| GET | `/api/templates` | List command templates |
| POST | `/api/templates` | Create template |
| GET | `/api/docs` | List documentation pages |
| GET | `/api/docs/[filename]` | Get documentation content |
| GET | `/api/tools` | List available tools |
| GET | `/api/tools/content` | Get tool source code |
| GET | `/api/usage` | Token usage data |
| GET | `/api/usage/aggregate` | Aggregated usage stats |
| GET | `/api/usage/sparkline` | Usage sparkline data |
| POST | `/api/llm/process` | Process text with LLM |
| GET | `/api/setup/check` | Check installation status |

## See also

- [IDE Overview](/docs/ide-overview/) - How the IDE works
- [Sessions & Agents](/docs/sessions/) - Session lifecycle
- [CLI Reference](/docs/cli-reference/) - Command-line tools
