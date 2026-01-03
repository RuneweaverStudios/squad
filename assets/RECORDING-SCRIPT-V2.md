# JAT Dashboard Demo Recording Script V2

**Target:** 45-60 second MP4 showing JAT's complete orchestration
**Key Message:** One dashboard orchestrates everything - planning, execution, monitoring

---

## THE REVISED STORY

**Act 1: Planning** - Agent creates structured plan from high-level task
**Act 2: Orchestration** - Use `/jat:bead` to convert plan into executable tasks
**Act 3: Execution** - Epic Swarm launches all tasks at once
**Act 4: Monitoring** - Switch between projects to see parallel work
**Act 5: Interaction** - Dashboard handles agent questions seamlessly

---

## PRE-RECORDING SETUP

### 1. Clean Demo Environment

```bash
# Reset all demo project tasks
cd ~/code/jat-demo-api && echo "[]" > .beads/issues.jsonl && git add . && git commit -m "Reset"
cd ~/code/jat-demo-ui && echo "[]" > .beads/issues.jsonl && git add . && git commit -m "Reset"
cd ~/code/jat-demo-docs && echo "[]" > .beads/issues.jsonl && git add . && git commit -m "Reset"

# Kill any running sessions
tmux kill-session -t jat-EpicAgent 2>/dev/null
tmux kill-session -t jat-ApiAgent 2>/dev/null
tmux kill-session -t jat-UiAgent 2>/dev/null
tmux kill-session -t jat-DocsAgent 2>/dev/null

echo "✅ Demo environment reset"
```

### 2. Configure Dashboard Visibility

```bash
# Show ONLY demo projects
jat-demo on

# After recording, restore regular projects:
# jat-demo off
```

### 3. Browser Setup

**Chrome Window Sizing:**
1. Open Chrome DevTools (F12)
2. Toggle device mode (Ctrl+Shift+M)
3. Set dimensions: **1440 x 900**
4. Navigate to: **http://127.0.0.1:3333/projects**

### 4. Prepare Content

Have ready to paste:
- Planning task description (see below)
- Second project task (optional)

---

## RECORDING SEQUENCE

### Frame 1: Create Planning Task (0:00-0:05)

1. **Start on /projects page** (showing jat-demo-api project)
2. Click **"+ Task"** button (top left)
3. In modal:
   - Type: **Task** (default)
   - Title: `Design User Management System`
   - Description:
   ```
   Create a comprehensive plan for a user management system with:
   - Backend API endpoints for user CRUD operations
   - Frontend SvelteKit pages for user listing and management
   - Documentation for all API endpoints

   Break this down into specific implementation tasks for each component.
   Use /jat:bead to convert your plan into executable tasks.
   ```
   - Priority: **P1**
4. Click **Create**
5. Task appears in jat-demo-api project

**Viewer sees:** Creating a high-level planning task

### Frame 2: Launch Planning Agent (0:05-0:10)

1. Click the **rocket 🚀** on the planning task
2. Session card appears showing "jat-PlannerAgent"
3. Terminal shows agent working on the plan
4. Agent generates detailed plan with subtasks

**Viewer sees:** AI agent creating structured implementation plan

### Frame 3: Agent Runs /jat:bead (0:10-0:15) [SPEED UP 2x]

1. Agent recognizes need to create tasks
2. Runs `/jat:bead` command
3. Terminal shows task creation across projects:
   - `Creating task in jat-demo-api: Implement user endpoints`
   - `Creating task in jat-demo-ui: Build user management pages`
   - `Creating task in jat-demo-docs: Document API endpoints`
4. Agent marks planning task complete

**Viewer sees:** Plan automatically converted to executable tasks

### Frame 4: Tasks Distributed Across Projects (0:15-0:20)

1. **Refresh dashboard** (tasks appear)
2. Expand all three project panels:
   - **jat-demo-api** shows backend tasks
   - **jat-demo-ui** shows frontend tasks
   - **jat-demo-docs** shows documentation tasks
3. Mouse over to show task details
4. All tasks show "Ready" status

**Viewer sees:** Work automatically organized by project

### Frame 5: Epic Swarm Launch (0:20-0:30)

1. **Click "Epic Swarm" button** (launches all ready tasks)
2. Confirmation modal: "Launch 3 agents for 3 tasks?"
3. Click **"Launch Swarm"**
4. Watch as 3 session cards appear:
   - ApiAgent (jat-demo-api)
   - UiAgent (jat-demo-ui)
   - DocsAgent (jat-demo-docs)
5. All show "Working" status simultaneously

**Viewer sees:** One-click parallel execution across projects

### Frame 6: Interactive Decision (0:30-0:40) [THE KEY MOMENT]

1. **UiAgent needs input** (purple "NEEDS INPUT" badge)
2. **Question modal appears:**
   ```
   Which styling approach for user components?
   • Tailwind CSS - Utility-first CSS framework
   • CSS Modules - Scoped component styles
   ```
3. **Click "Tailwind CSS"**
4. Modal disappears, agent continues
5. Terminal shows: "User selected: Tailwind CSS"

**Viewer sees:** Seamless human-in-the-loop orchestration

### Frame 7: Project Switching & Monitoring (0:40-0:45)

1. **Click project collapse arrows** to show/hide:
   - Collapse jat-demo-api (hide details)
   - Expand jat-demo-ui (show agent working)
   - Collapse jat-demo-docs
2. **Click on different session cards** to highlight
3. Show how you can monitor specific agents

**Viewer sees:** Flexible project organization and monitoring

### Frame 8: Completion (0:45-0:50)

1. Tasks turn green with checkmarks
2. Session cards show "COMPLETED"
3. All projects show completed tasks
4. Planning task shows as complete

**Viewer sees:** Full workflow from plan to completion

### Frame 9: Outro (0:50-0:55)

Quick cuts showing:
- `/files` tab - Integrated code editor
- `/servers` tab - Dev server management
- `/automation` tab - Rule-based automation
- Back to `/projects` with completed work

**Text overlay:** "JAT - Complete Development Orchestration"

---

## KEY IMPROVEMENTS FROM V1

1. **Uses /projects page** (not /tasks which doesn't exist)
2. **Shows /jat:bead conversion** (plan → tasks workflow)
3. **Epic Swarm instead of manual launches** (better for demo)
4. **Project panel organization** (shows how to manage multiple projects)
5. **More realistic flow** (planning → execution → monitoring)

---

## EDITING NOTES

### Speed Adjustments
- **Frame 3:** Speed up 2x (bead execution)
- **Frame 6:** Keep at normal speed (interaction is key)
- Keep other frames at normal speed for clarity

### Key Moments to Highlight
- 0:12 - `/jat:bead` command execution
- 0:25 - Epic Swarm button click
- 0:35 - Interactive question modal
- 0:42 - Project organization controls

---

## BACKUP PLANS

### If /jat:bead Doesn't Run Automatically
- Have tasks pre-created in `.beads/issues.jsonl`
- Focus on the Epic Swarm execution

### If No Interactive Question
- Still shows parallel execution
- Emphasize project organization features
- Can retry with adjusted prompt

### Alternative Second Task
If time permits, show creating a task in a different project:
1. Click jat-demo-ui project
2. Create task: "Add dark mode support"
3. Launch agent
4. Shows multi-project, multi-agent coordination

---

## SUCCESS CRITERIA

✅ **Planning to execution flow** (shows /jat:bead conversion)
✅ **Epic Swarm demonstration** (one-click parallel launch)
✅ **Project organization** (collapsible panels, switching views)
✅ **Interactive decisions** (question modal in action)
✅ **Complete orchestration** (never leave dashboard)

---

## OUTPUT

1. **Raw recording:** `~/code/jat/assets/dashboard-demo-raw.mp4`
2. **Edited version:** `~/code/jat/assets/dashboard-demo.mp4`
3. **Upload to GitHub** and add to README.md