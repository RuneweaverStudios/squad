---
argument-hint: [prd-path]
---

Convert a PRD, spec, or requirements doc into structured task tree with dependencies and priorities.

# Tasktree: PRD to Tasks + Dependencies

**Use this command when:**
- You have a PRD or feature spec to convert into tasks
- Need to break down requirements into actionable work items
- Want to create a batch of related tasks with proper dependencies
- Converting high-level requirements into agent-ready tasks

**What this does:**
- Reads and parses the PRD/spec (file, conversation, or inline)
- Asks clarifying questions if requirements are ambiguous
- Creates an **epic** for multi-task features with **hierarchical child IDs** (e.g., `jat-auth.1`, `jat-auth.2`)
- Creates right-sized tasks (2-8 hour tasks)
- Sets up dependency chains between tasks
- Assigns priorities (P0-P2) based on criticality
- Reports summary of created tasks

**Usage:**
- `/jat:tasktree` - Parse from conversation context or prompt for input
- `/jat:tasktree path/to/prd.md` - Convert specific PRD file
- `/jat:tasktree "inline: user auth with Google OAuth and email/password"` - Inline spec

---

## STEP 1: Get the Input

**If `$1` is a file path:**
- Read the PRD/spec file
- Parse requirements, features, constraints

**If `$1` starts with "inline:":**
- Use the inline text as the spec

**If `$1` is empty:**
- Check conversation for recent feature/requirements discussion
- Look for: "we need to...", "build...", "implement...", requirements lists
- If found: use that as input
- If not found: ask user to provide PRD or paste requirements

---

## STEP 2: Parse Requirements

Extract from the input:

1. **Features/Capabilities** - What needs to be built?
2. **Requirements** - Specific constraints or needs?
3. **Technical context** - Stack, integrations, APIs?
4. **Priority signals** - What's critical vs nice-to-have?
5. **Scope boundaries** - What's in vs out?

---

## STEP 3: Clarify Ambiguities (if needed)

If the spec is unclear or missing key info, use `AskUserQuestion` (max 4 questions):

- **Scope:** "What's MVP vs future?"
- **Priority:** "What's most critical?"
- **Technical:** "Any tech constraints?"
- **Dependencies:** "External blockers?"

Skip this step if the PRD is already clear and complete.

---

## STEP 4: Structure the Tasks

### Task Sizing (2-8 hours each)

**Good size:**
- "Implement Google OAuth login flow"
- "Create user profile database schema"
- "Build settings page UI"

**Too big (break down):**
- "Build authentication system" → multiple tasks
- "Implement user management" → multiple tasks

**Too small (combine):**
- "Add button" → part of larger UI task
- "Update import" → part of larger change

### Breakdown Strategies

Choose based on the spec:
- **By feature:** Auth, Profiles, Settings
- **By layer:** DB schema, API, UI
- **By user flow:** Signup, Login, Reset password
- **By dependency:** Foundation → Building blocks → Features

### Priority Levels

- **P0 (Critical):** Foundation, blocks everything else
- **P1 (High):** Core features, MVP requirements
- **P2 (Medium):** Enhancements, nice-to-have

### Identify Dependencies

- What must happen before what?
- What can run in parallel?
- What's on the critical path?

---

## STEP 5: Create Tasks

### For Multi-Task Features: Create Epic + Children

**⚠️ CRITICAL: Always use `--parent` flag when creating child tasks!**

When breaking down a feature into multiple related tasks, create a parent epic first, then add child tasks with hierarchical IDs:

```
❌ WRONG - Creates standalone tasks with random IDs:
   jt create "Epic: Auth" --type epic           → jat-kvtrr
   jt create "Setup config" --type task         → jat-j2pwt  (NOT a child!)
   jt create "Add login" --type task            → jat-sud88  (NOT a child!)
   jt dep add jat-kvtrr jat-j2pwt               (manual wiring, no grouping)

✅ CORRECT - Creates hierarchical child IDs:
   jt create "Epic: Auth" --type epic           → jat-kvtrr
   jt create "Setup config" --parent jat-kvtrr  → jat-kvtrr.1  (child!)
   jt create "Add login" --parent jat-kvtrr     → jat-kvtrr.2  (child!)
   (dependencies auto-wired to epic)
```

**Step 5A: Create the Epic**
```bash
jt create "Epic: Feature Name" \
  --description "High-level description of the feature" \
  --priority [0-2] \
  --type epic \
  --labels "label1,label2"
# → Returns epic ID, e.g., jat-a3f8
```

**Step 5B: Create Child Tasks with --parent**
```bash
jt create "First subtask" \
  --parent jat-a3f8 \
  --description "What to do and acceptance criteria" \
  --priority [0-2] \
  --type task
# → Returns jat-a3f8.1

jt create "Second subtask" \
  --parent jat-a3f8 \
  --description "What to do" \
  --priority [0-2] \
  --type task
# → Returns jat-a3f8.2
```

**Benefits of Hierarchical IDs:**
- Visual grouping: `jat-a3f8.1`, `jat-a3f8.2`, `jat-a3f8.3` clearly belong together
- TaskTable can group by parent for better organization
- Easy to see progress on an epic by its children's status

**Step 5C: Close the Epic (IMPORTANT)**

After creating all child tasks, **immediately close the epic**:

```bash
jt close jat-a3f8 --reason "Epic container - work via child tasks jat-a3f8.1 through jat-a3f8.N"
```

**Why close the epic?**
- Epics are **containers for organization**, not workable tasks
- If left open, `jt ready` shows the epic as a pickable task
- An agent picking the epic would try to do "everything" - defeating the breakdown
- Closing removes it from the work queue while preserving hierarchy

**The epic still provides:**
- Hierarchical child IDs (jat-a3f8.1, .2, .3)
- Grouping in `jt list` output
- Reference for what the children accomplish together

### For Standalone Tasks (No Epic Needed)

```bash
jt create "Task title" \
  --description "What to do and acceptance criteria" \
  --priority [0-2] \
  --type task \
  --labels "label1,label2"
```

### Set Up Dependencies Between Tasks

```bash
jt dep add <task-id> <depends-on-task-id>
```

**Example with hierarchical tasks:**
```bash
# Child 2 depends on Child 1
jt dep add jat-a3f8.2 jat-a3f8.1

# Child 3 depends on Child 2
jt dep add jat-a3f8.3 jat-a3f8.2
```

---

## STEP 6: Verify & Report

```bash
jt ready --json
```

Confirm:
- P0 tasks have no unmet dependencies
- Dependency chains make sense
- Tasks are right-sized

---

## Output Format

```
╔══════════════════════════════════════════════════════════════════════════╗
║                     TASKTREE CREATED FROM PRD                            ║
╚══════════════════════════════════════════════════════════════════════════╝

📄 Source: [file path, inline, or conversation]
🎯 Scope: [brief summary]

┌─ SUMMARY ────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Total: [X] tasks created                                                │
│  🔴 P0: [X]  🟠 P1: [X]  🟡 P2: [X]                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ DEPENDENCY GRAPH ───────────────────────────────────────────────────────┐
│                                                                          │
│  Foundation (no deps):                                                   │
│  ├─ [task-id]: [title]                                                   │
│  └─ [task-id]: [title]                                                   │
│                                                                          │
│  Core (depends on foundation):                                           │
│  ├─ [task-id]: [title] (← task-id)                                       │
│  └─ [task-id]: [title] (← task-id, task-id)                              │
│                                                                          │
│  Features (depends on core):                                             │
│  ├─ [task-id]: [title] (← task-id)                                       │
│  └─ [task-id]: [title] (← task-id)                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ CREATED TASKS ──────────────────────────────────────────────────────────┐
│                                                                          │
│  [task-id] (P0): [Title]                                                 │
│  ├─ [Description summary]                                                │
│  ├─ Depends: [none or task-ids]                                          │
│  └─ Enables: [task-ids that depend on this]                              │
│                                                                          │
│  [task-id] (P1): [Title]                                                 │
│  ├─ [Description summary]                                                │
│  ├─ Depends: [task-ids]                                                  │
│  └─ Enables: [task-ids]                                                  │
│                                                                          │
│  [...repeat for all tasks...]                                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ EXECUTION STRATEGY ─────────────────────────────────────────────────────┐
│                                                                          │
│  Phase 1: [X] foundation tasks (can parallelize)                         │
│  Phase 2: [X] core tasks (after phase 1)                                 │
│  Phase 3: [X] feature tasks (after phase 2)                              │
│                                                                          │
│  Parallelization: Up to [N] agents can work simultaneously               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

💡 Next: Run `/jat:start` to pick a task, or `jt ready` to see available work
```

---

## Example

**Input PRD:** "User authentication with Google OAuth and email/password"

**Clarifying questions:**
1. Include password reset? → Yes
2. Email verification? → P2, nice-to-have
3. Use Supabase? → Yes

**Tasks created (with hierarchical IDs):**

```
Epic:
  jat-auth: Epic: User Authentication System

P0 - Foundation (children of jat-auth):
  jat-auth.1: Set up Supabase auth config
  jat-auth.2: Create users table with RLS
  jat-auth.3: Session management utilities

P1 - Core (children of jat-auth):
  jat-auth.4: Google OAuth flow (← jat-auth.1, jat-auth.2)
  jat-auth.5: Email/password flow (← jat-auth.2)
  jat-auth.6: Login UI components (← jat-auth.4, jat-auth.5)
  jat-auth.7: Logout & cleanup (← jat-auth.3)

P2 - Enhancements (children of jat-auth):
  jat-auth.8: Password reset (← jat-auth.5)
  jat-auth.9: Email verification (← jat-auth.5)
```

**Creation commands:**
```bash
# Create epic first
jt create "Epic: User Authentication System" --type epic --priority 1
# → jat-auth

# Create children with --parent
jt create "Set up Supabase auth config" --parent jat-auth --priority 0 --type task
# → jat-auth.1

jt create "Create users table with RLS" --parent jat-auth --priority 0 --type task
# → jat-auth.2

# ... continue for all tasks ...

# IMPORTANT: Close the epic after all children created
jt close jat-auth --reason "Epic container - work via child tasks jat-auth.1 through jat-auth.9"
```

**Execution:**
- Phase 1: 3 agents on P0 tasks (jat-auth.1, jat-auth.2, jat-auth.3) in parallel
- Phase 2: 4 agents on P1 tasks
- Phase 3: P2 tasks as capacity allows

---

## Best Practices

1. **⚠️ ALWAYS use `--parent` for child tasks** - This is the #1 mistake! Without `--parent`, you get random IDs instead of hierarchical ones (jat-abc.1, jat-abc.2)
2. **Use epics for multi-task features** - Create epic first, then children with `--parent`
3. **Always close epics after creating children** - Epics are containers, not workable tasks
4. **Right-size tasks** - 2-8 hours, not too big or small
5. **Set dependencies correctly** - enables parallel work
6. **Prioritize thoughtfully** - P0 = foundation, P1 = core, P2 = nice-to-have
7. **Write clear descriptions** - acceptance criteria included
8. **Ask if unclear** - don't guess on ambiguous requirements
9. **Front-load foundation** - so agents can parallelize sooner

### When to Use Epics vs Standalone Tasks

| Scenario | Approach |
|----------|----------|
| 3+ related tasks for one feature | Create epic + child tasks |
| Single task or 2 unrelated tasks | Standalone tasks |
| Bug fixes | Standalone tasks |
| Small enhancements | Standalone tasks |
| New feature with multiple components | Epic + children |
