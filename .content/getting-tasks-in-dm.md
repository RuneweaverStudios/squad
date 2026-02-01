hey so you asked how to get tasks into jat. there are basically 3 tiers depending on how much structure you already have.

**if you just want to type stuff in:**

the IDE runs at localhost:3333. hit create and you get a form. or use Quick Add which is just an inline text field on the tasks page - type a line, hit enter, done.

**if you already have structured text:**

this is probably the one you want. the Paste tab in the create drawer auto-detects format. paste yaml, json, markdown, or plain text and it shows a preview before creating anything.

yaml is the cleanest:

```yaml
- title: Fix OAuth timeout
  type: bug
  priority: 1
  labels: security, auth
  description: Users hitting 60s timeout on login

- title: Add rate limiting
  type: feature
  priority: 2
  labels: backend
  description: Per-user rate limits on public endpoints
```

markdown works too if you're copy-pasting from a doc:

```markdown
## Fix OAuth timeout
Bug | P1 | security, auth
Users hitting 60s timeout on login
```

there's also a Template tab if you have repeatable patterns. handlebars variables:

```yaml
template:
  title: "Add {{resource}} CRUD endpoints"
  type: feature
  priority: 1
  description: "GET/POST/PUT/DELETE for {{resource}}"

data:
  - resource: users
  - resource: orders
  - resource: products
```

three tasks, one template.

**if you want AI to figure out the breakdown:**

Generator tab - describe the feature in english, AI spits out a task list, you edit before creating. nothing gets created until you say so.

Plan tab - spawns a live claude session inside the drawer. you have a conversation about scope and approach, it creates tasks as you agree on them. this is the one for hairy features where the breakdown isn't obvious.

`/jat:tasktree` in a claude code session - point it at a PRD or spec file and it generates a full epic with dependency chains:

```
/jat:tasktree path/to/auth-prd.md
```

produces:
```
jat-auth (Epic)
  jat-auth.1: Supabase auth config (P0)
  jat-auth.2: Users table with RLS (P0)
  jat-auth.3: Google OAuth (P1, depends on .1, .2)
  jat-auth.4: Email/password (P1, depends on .2)
  jat-auth.5: Login UI (P1, depends on .3, .4)
```

**programmatic:**

CLI:
```bash
jat create "Fix OAuth timeout" --type bug --priority 1 --labels security,auth --description "..."
```

single task API:
```bash
curl -X POST localhost:3333/api/tasks -H "Content-Type: application/json" \
  -d '{"project":"myapp","title":"Fix login redirect","type":"bug","priority":1}'
```

bulk API (up to 500 tasks, normalizes types/priorities automatically):
```bash
curl -X POST localhost:3333/api/tasks/bulk -H "Content-Type: application/json" \
  -d '{"project":"myapp","tasks":[{"type":"fix","title":"...","priority":"P1"}]}'
```

the bulk API is the universal adapter. "fix" becomes "bug", "P1" becomes 1, "enhancement" becomes "feature". it validates everything before creating and returns per-task results.

**the important bit for you:**

if you have your own format/DSL, just write a small script that translates to the bulk API schema. minimum viable task is `{"title":"...","type":"..."}`. everything else is optional. python example:

```python
import requests

my_tasks = [
    {"name": "AUTH-001", "desc": "OAuth integration", "severity": "high"},
    {"name": "AUTH-002", "desc": "Session management", "severity": "medium"},
]

jat_tasks = [{
    "title": f"{t['name']}: {t['desc']}",
    "type": "feature",
    "priority": 1 if t["severity"] == "high" else 2,
    "description": t["desc"]
} for t in my_tasks]

requests.post("http://localhost:3333/api/tasks/bulk",
    json={"project": "myapp", "tasks": jat_tasks})
```

50 lines max to wire up any source. lmk if you want to walk through it
