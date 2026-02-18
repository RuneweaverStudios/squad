# Ten ways to get tasks into SQUAD

You have work to do. Its sitting in a Google Doc, a Notion page, a Slack thread, a PRD your PM sent at 11pm, or just in your head. The problem isn't figuring out what to build. The problem is getting it into the system where agents can actually pick it up and start working.

SQUAD gives you ten different ingestion paths. Some are manual. Some are automated. One of them lets an AI agent plan the entire breakdown for you while you watch. Pick the one that matches where your work currently lives.

| Method | Best for | Speed |
|--------|----------|-------|
| Task tab | Single well-defined task | Slow |
| Paste tab | Structured data you already have | Fast |
| Template tab | Repeatable patterns | Fast |
| Generator tab | Feature ideas in plain English | Medium |
| Plan tab | Complex features needing discussion | Slow |
| Quick Add | One-liners from the task page | Fastest |
| Single API | Scripts and integrations | Fast |
| Bulk API | Large imports, custom tooling | Fast |
| CLI | Terminal workflows | Fast |
| Task Tree | PRDs and spec documents | Medium |

## The manual paths

**Task tab** is the most straightforward. Open the IDE at localhost:3333, hit the create button, fill in the form. Title, description, type, priority, labels, dependencies. One task at a time. Use this when you have a single well-scoped bug or feature and you want to set every field precisely.

**Quick Add** is faster. Its an inline text field that sits right on the tasks page. Type a one-liner and hit enter. For a single task, thats all you need. Paste multiple lines and it switches to bulk mode automatically, showing you a preview before creating anything.

**Paste tab** is where things get interesting. You probably already have tasks written down somewhere. Copy them and paste into the Paste tab. It auto-detects the format: YAML, JSON, Markdown, or plain text. You see a live preview on the right side before committing.

YAML works well for structured batches:

```yaml
- title: Fix OAuth timeout
  type: bug
  priority: 1
  labels: security, auth
  description: Users hitting 60s timeout on login

- title: Add rate limiting to API
  type: feature
  priority: 2
  labels: backend, security
  description: Implement per-user rate limits on public endpoints
```

Markdown is more readable if youre pasting from a doc:

```markdown
## Fix OAuth timeout
Bug | P1 | security, auth
Users hitting 60s timeout on login

## Add rate limiting to API
Feature | P2 | backend, security
Implement per-user rate limits on public endpoints
```

Both produce the same result. The parser handles format detection, and you can override it with the format dropdown if auto-detect gets it wrong.

## Templates and generation

**Template tab** solves the repetition problem. Define a YAML template with Handlebars-style variables, provide a data section, and it expands into concrete tasks. The IDE shows detected variables and a live preview as you type.

```yaml
template:
  title: "Add {{resource}} CRUD endpoints"
  type: feature
  priority: 1
  labels: [backend, api]
  description: "Create GET/POST/PUT/DELETE for {{resource}}"

data:
  - resource: users
  - resource: orders
  - resource: products
```

That generates three tasks instantly. Built-in presets cover common patterns like API endpoints, component builds, and sprint checklists.

**Generator tab** takes a different approach. Describe your feature in plain English and let the AI break it down into tasks. You type something like:

> We need user authentication with Google OAuth, email/password login, password reset flow, and session management. Should work with our existing Supabase backend.

The AI returns a structured task list with types, priorities, descriptions, and even dependency suggestions. You review and edit everything in a preview table before creating. Nothing gets created until you click the button.

**Plan tab** goes further. It spawns a live Claude agent session right inside the creation drawer. You describe what you need, the agent asks clarifying questions, and you have a back-and-forth conversation about scope, priorities, and technical approach. The agent creates tasks directly into your backlog as you agree on them. Use this for complex features where the breakdown isnt obvious upfront.

## Programmatic paths

**CLI** is `squad create` from any terminal. Straightforward for scripting or when you're already in the terminal.

```bash
squad create "Fix OAuth timeout" \
  --type bug \
  --priority 1 \
  --labels security,auth \
  --description "Users hitting 60s timeout on login"
```

**Single API** is `POST /api/tasks` with a JSON body. Good for webhooks, CI/CD pipelines, or any integration that can make HTTP requests.

```bash
curl -X POST http://localhost:3333/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "project": "myapp",
    "title": "Fix login redirect",
    "type": "bug",
    "priority": 1,
    "description": "Users land on /dashboard instead of their last page"
  }'
```

**Bulk API** is `POST /api/tasks/bulk`. Accepts up to 500 tasks per request. It handles type normalization (so "fix" becomes "bug" and "enhancement" becomes "feature"), priority normalization ("P1" becomes 1), epic linking, and dependency wiring between tasks.

```bash
curl -X POST http://localhost:3333/api/tasks/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "project": "myapp",
    "tasks": [
      {
        "type": "feature",
        "title": "Implement auth middleware",
        "description": "JWT validation on all protected routes",
        "priority": 1,
        "labels": ["security", "backend"]
      },
      {
        "type": "feature",
        "title": "Build login page",
        "description": "Email/password form with OAuth buttons",
        "priority": 1,
        "labels": ["frontend", "auth"],
        "depends_on": ["the-middleware-task-id"]
      }
    ]
  }'
```

**Task Tree** command (`/squad:tasktree`) runs inside a Claude Code session. Give it a PRD, spec file, or requirements doc and it generates a full task tree. It creates an epic, breaks work into 2-8 hour tasks, sets up dependency chains, assigns priorities, and reports a summary with an execution strategy. You can point it at a file, paste inline text, or let it pull context from the current conversation.

```bash
/squad:tasktree path/to/auth-prd.md
```

It will ask clarifying questions if the spec is ambiguous, then produce something like:

```
squad-auth (Epic: User Authentication)
  squad-auth.1: Set up Supabase auth config (P0)
  squad-auth.2: Create users table with RLS (P0)
  squad-auth.3: Google OAuth flow (P1, depends on .1, .2)
  squad-auth.4: Email/password flow (P1, depends on .2)
  squad-auth.5: Login UI components (P1, depends on .3, .4)
  squad-auth.6: Password reset (P2, depends on .4)
```

## Bring your own format

Maybe you already have a DSL. Maybe your PM writes specs in a particular structure. Maybe you pull work items from Jira or Linear. The bulk API is your universal adapter.

Write a small translator that converts your format to the bulk API's JSON schema. Heres a Python example:

```python
import json, requests

# Your custom format (parsed from a file, API, wherever)
my_tasks = [
    {"name": "AUTH-001", "desc": "OAuth integration", "severity": "high"},
    {"name": "AUTH-002", "desc": "Session management", "severity": "medium"},
]

# Translate to SQUAD format
squad_tasks = [{
    "title": f"{t['name']}: {t['desc']}",
    "type": "feature",
    "priority": 1 if t["severity"] == "high" else 2,
    "description": t["desc"],
    "labels": "auth"
} for t in my_tasks]

requests.post("http://localhost:3333/api/tasks/bulk", json={
    "project": "myapp",
    "tasks": squad_tasks
})
```

The same pattern works in Node, a shell script with `jq`, or anything else that can POST JSON. The bulk API validates everything before creating, returns per-task success/failure results, and handles type aliases automatically. Send "fix" and it maps to "bug". Send "P1" and it normalizes to priority 1. Send "enhancement" and it becomes "feature".

The schema is simple: each task needs a `title` and a `type`. Everything else is optional. That low barrier means you can wire up practically any source of work in under fifty lines of code.

Whatever format your work lives in today, one of these ten paths will get it into SQUAD and in front of your agents.
