# Task Management

JAT Tasks is the task system. Its a lightweight, dependency-aware task database stored in SQLite. Each project gets its own `.jat/` directory, and the `jt` CLI handles everything from creation to completion.

## Creating tasks

```bash
jt create "Add dark mode toggle to settings page" \
  --type feature \
  --priority 1 \
  --labels frontend,ui,settings \
  --description "Users need a toggle in settings to switch between light and dark themes. Should persist preference to localStorage."
```

This generates a task with a prefixed ID like `myproject-abc`. The prefix comes from your project name so tasks stay distinct across multiple codebases.

From the IDE, click the "+" button on the Tasks page. The IDE uses AI to auto-suggest priority, type, and labels from your title. You can accept the suggestions or override them.

## Task statuses

Every task moves through a simple state machine:

| Status | Meaning | Set by |
|--------|---------|--------|
| `open` | Available to start | `jt create` |
| `in_progress` | An agent is working on it | `/jat:start` |
| `blocked` | Waiting on a dependency or external factor | `jt update --status blocked` |
| `closed` | Work complete | `/jat:complete` |

**Use underscores, not hyphens.** `in_progress` works. `in-progress` does not.

```bash
# Update status manually
jt update myproject-abc --status in_progress --assignee CalmMeadow

# Close a task
jt close myproject-abc --reason "Implemented and tested"
```

## Priority levels

Priority is a number from 0 to 4. Lower numbers mean higher urgency.

| Priority | Use for |
|----------|---------|
| P0 | Foundation work, blockers, critical infrastructure |
| P1 | Core features, important bugs |
| P2 | Standard work, improvements |
| P3 | Nice-to-haves, polish, minor enhancements |
| P4 | Chores, documentation, cleanup |

When agents run in auto mode, they always pick the highest-priority (lowest number) ready task first.

## Task types

| Type | When to use |
|------|------------|
| `bug` | Something broken that needs fixing |
| `feature` | New user-facing capability |
| `task` | Technical work, implementation |
| `chore` | Maintenance, cleanup, upgrades |
| `epic` | Parent container for related tasks |
| `chat` | Conversational threads from external channels (typically handled with `/jat:chat`) |

## Dependencies

JAT tracks dependencies between tasks. A task with unmet dependencies shows as `blocked` and wont appear in `jt ready` output.

```bash
# Task B depends on Task A (B cant start until A is closed)
jt dep add myproject-bbb myproject-aaa

# View dependency tree
jt dep tree myproject-bbb

# Remove a dependency
jt dep remove myproject-bbb myproject-aaa

# Check for circular dependencies
jt dep cycles
```

You can also set dependencies during creation:

```bash
jt create "Build OAuth login page" --type task --deps myproject-aaa
```

## Finding ready work

The `jt ready` command returns tasks that are `open` and have all dependencies satisfied:

```bash
jt ready --json
```

This is what agents use during `/jat:start auto` to pick their next task. The output is sorted by priority, so P0 tasks come first.

```bash
# Human-readable list
jt ready

# Filter by labels
jt list --status open --labels frontend
```

## Epics and parent-child hierarchies

When you have a group of related tasks that together deliver one feature, use an epic. An epic is a parent task that stays blocked until all its children complete. Then it becomes a verification task.

### Dependency direction matters

This is the most common mistake with epics. The epic depends on its children, not the other way around.

```
CORRECT:                              WRONG:
myproject-abc (Epic) - BLOCKED        myproject-abc (Epic) - READY
  depends on:                           blocks:
    myproject-def [READY]                 myproject-def [BLOCKED]
    myproject-ghi [READY]                 myproject-ghi [BLOCKED]
```

When set up correctly, children are READY for agents to pick up immediately. The epic stays BLOCKED until all children close.

### Creating an epic

```bash
# 1. Create the epic
jt create "User authentication system" \
  --type epic \
  --priority 1 \
  --description "Verification task. Runs after all subtasks complete."

# 2. Create child tasks
jt create "Set up Supabase auth config" --type task --priority 0
jt create "Implement Google OAuth flow" --type task --priority 1
jt create "Build login UI components" --type task --priority 1

# 3. Set dependencies (epic depends on children)
jt dep add myproject-abc myproject-def
jt dep add myproject-abc myproject-ghi
jt dep add myproject-abc myproject-jkl
```

Do NOT use the `--parent` flag. It creates dependencies in the wrong direction (children blocked by parent). Use `jt dep add` or the helper script `jt-epic-child` instead.

```bash
# Safe helper that gets the direction right
jt-epic-child myproject-abc myproject-def
```

### When to use epics

| Use an epic | Use standalone tasks |
|-------------|---------------------|
| 4+ related tasks delivering one feature | Unrelated work items |
| Tasks sharing context and rationale | Single pieces of work |
| Need to track "3/5 done" progress | Quick fixes |
| Multiple agents could work in parallel | Items that dont need grouping |

## Multi-project task management

Each project has its own `.jat/` directory and task namespace. Task IDs include the project prefix so theres never ambiguity.

```bash
# Work in the chimaro project
cd ~/code/chimaro
jt ready                    # Shows only chimaro tasks

# Work in the jat project
cd ~/code/jat
jt ready                    # Shows only jat tasks
```

The IDE aggregates all projects into a single view. You can filter by project, see tasks across codebases, and spawn agents for any project from one dashboard.

The IDE aggregates all projects into a single view. You can filter by project, see tasks across codebases, and spawn agents for any project from one dashboard.

## Git integration

The `.jat/` directory contains both committed files and local-only files:

| File | Committed | Purpose |
|------|-----------|---------|
| `.gitignore` | Yes | Ignore rules for SQLite files |
| `tasks.db*` | No | Local SQLite task database |

Do not add `.jat/` to your root `.gitignore`. The `.jat/.gitignore` file handles excluding the SQLite database.

## Next steps

- [Agent Registry](/docs/agent-registry/) - Identity and file locks for multi-agent coordination
- [Workflow Commands](/docs/workflow-commands/) - How /jat:start and /jat:complete use JAT Tasks
- [Sessions & Agents](/docs/sessions/) - The one-agent-one-task model
