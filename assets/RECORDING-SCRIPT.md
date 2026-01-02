# JAT Dashboard Demo Recording Script

**Target:** 45-60 second MP4 showing the complete JAT workflow
**Key Message:** From idea to execution, all inside JAT

---

## THE STORY

Show how JAT orchestrates the entire development workflow:
1. **User has an idea** → Creates epic in dashboard
2. **Agent breaks it down** → Generates tasks across projects
3. **Swarm executes** → Multiple agents work in parallel
4. **Interactive decisions** → Dashboard handles user input
5. **Work completes** → Progress tracked in real-time

**Everything happens in the dashboard. No terminal juggling.**

---

## PRE-RECORDING SETUP

### 1. Clean Demo Projects

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

### 2. Dashboard Configuration

1. Start dashboard: `jat-dashboard`
2. Go to **http://127.0.0.1:3333/config**
3. Click **Projects** tab
4. Hide all real projects (click eye icon)
5. Show only:
   - **jat-demo-api**
   - **jat-demo-ui**
   - **jat-demo-docs**

### 3. Browser Setup

- Width: **1440px** (to show multiple projects)
- Height: **900px**
- Navigate to: **http://127.0.0.1:3333/tasks**
- Have the epic description ready to paste (see `assets/demo-epic.txt`)

---

## RECORDING SEQUENCE

**Start recording BEFORE Frame 1**

### Frame 1: Create Epic (0:00-0:05)

1. **You're on Tasks page** (empty task list)
2. Click **"Create Task"** button (top right)
3. In modal:
   - Type: Select **Epic** from dropdown
   - Title: `User Management System`
   - Description: Paste from `demo-epic.txt`
   - Priority: **P1** (High)
4. Click **Create**
5. Epic appears in task table with epic badge

**What viewers see:** Starting from zero, creating a high-level requirement

### Frame 2: Launch Agent on Epic (0:05-0:10)

1. **Epic is in task table**
2. Hover over the epic row (shows it's interactive)
3. Click the **rocket button 🚀** on the epic
4. Session card appears in top panel
5. Terminal shows: "Picking up task: User Management System"

**What viewers see:** One click to start AI working on the requirement

### Frame 3: Agent Processes Epic (0:10-0:20) [SPEED UP 3x in editing]

**Record this normally, speed up in post:**

1. Agent generates PRD (terminal scrolling)
2. Agent recognizes it's an epic
3. Runs `/jat:bead` automatically
4. Creates subtasks:
   - `jat-demo-api-xxx: Implement GET /users endpoint`
   - `jat-demo-ui-xxx: Create UserList component`
   - `jat-demo-ui-xxx: Add styling to UserList`
   - `jat-demo-docs-xxx: Document /users endpoint`

**What viewers see (sped up):** AI breaking down requirements into tasks

### Frame 4: Subtasks Appear (0:20-0:25)

1. **Dashboard refreshes** (tasks appear)
2. Task table now shows:
   - Epic at top (with progress bar 0/4)
   - 4 subtasks below with project badges
   - Different colors for api/ui/docs
3. Mouse hover over project badges
4. Epic shows child task count

**What viewers see:** Work automatically organized across projects

### Frame 5: Launch the Swarm (0:25-0:35)

1. **Rapid-fire rocket clicks:**
   - Click 🚀 on API task → ApiAgent spawns
   - Click 🚀 on first UI task → UiAgent spawns
   - Click 🚀 on Docs task → DocsAgent spawns
2. **3 session cards appear** in top panel
3. Each shows different project name
4. Terminal outputs show different code being written

**What viewers see:** Parallel execution across multiple codebases

### Frame 6: Interactive Decision (0:35-0:45) [THE MONEY SHOT]

1. **UiAgent hits the styling decision**
2. Session card changes to purple **"NEEDS INPUT"**
3. **Question modal appears** with:
   - "Which styling approach?"
   - Button 1: Tailwind CSS
   - Button 2: CSS Modules
4. **You click "Tailwind CSS"**
5. Modal disappears
6. Agent continues with Tailwind approach
7. Terminal shows: "User selected: Tailwind CSS"

**What viewers see:** Interactive orchestration - agents ask, dashboard enables answers

### Frame 7: Completion (0:45-0:50)

1. Tasks start turning green (checkmarks)
2. Epic progress bar fills: 1/4 → 2/4 → 3/4 → 4/4
3. All session cards show **"COMPLETED"**
4. Epic shows full green progress bar
5. End on full dashboard view

**What viewers see:** Real-time progress tracking, work completes

### Frame 8: Optional Outro (0:50-0:55)

Quick montage of other features:
- Click to `/files` tab (show code editor)
- Click to `/servers` tab (show server management)
- Back to `/tasks` showing completed work

**Text overlay:** "One dashboard. Full orchestration."

---

## EDITING NOTES

### Speed Adjustments
- **Frame 3:** Speed up 3x (20s → ~7s)
- **Frame 6:** Keep at normal speed (this is the key differentiator)
- **Total edited length:** ~45 seconds

### Key Moments to Emphasize
1. **0:05** - One click to start agent
2. **0:22** - Tasks appear across projects
3. **0:30** - Multiple agents working
4. **0:40** - Interactive question UI
5. **0:48** - Everything complete

### Optional Text Overlays
- "From idea..." (Frame 1)
- "...to execution" (Frame 5)
- "Interactive orchestration" (Frame 6)
- "JAT" (Frame 8)

---

## BACKUP PLANS

### If Agent Doesn't Ask Question
- Still shows parallel execution
- Emphasize cross-project orchestration
- Can do retake with prompt adjusted to ensure question

### If Tasks Don't Generate Properly
- Have backup `.beads/issues.jsonl` ready
- Can manually refresh dashboard
- Focus on the swarm execution part

### If Recording is Too Long
- Can cut Frame 8 (outro)
- Speed up Frame 3 more aggressively
- Still keep Frame 6 at normal speed

---

## OUTPUT

1. **Save as:** `~/code/jat/assets/dashboard-demo.mp4`

2. **Upload to GitHub:**
   - Go to any issue in JAT repo
   - Drag MP4 into comment box
   - GitHub provides URL

3. **Add to README.md** after the Quick Start section:
   ```markdown
   ## See It In Action

   https://github.com/user-attachments/assets/[video-id].mp4

   Watch JAT orchestrate a complete feature from epic to execution in 45 seconds.
   ```

---

## CHECKLIST BEFORE RECORDING

- [ ] Demo projects reset (empty task lists)
- [ ] Dashboard showing only demo projects
- [ ] Browser sized correctly (1440x900)
- [ ] Epic description ready to paste
- [ ] Starting on `/tasks` page
- [ ] Screen recorder ready
- [ ] No running tmux sessions

---

## SUCCESS CRITERIA

The recording should clearly show:

✅ **Complete in-JAT workflow** (never leave dashboard)
✅ **Cross-project orchestration** (3 projects visible)
✅ **Epic → tasks breakdown** (AI structures work)
✅ **Parallel agent execution** (multiple working simultaneously)
✅ **Interactive decision making** (question UI in action)
✅ **Real-time progress tracking** (epic progress bar)

This is the demo that shows JAT as the complete orchestration solution.