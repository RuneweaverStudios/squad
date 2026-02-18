# SQUAD IDE Demo Recording Script - Final

**Target:** 45-60 second MP4 showcasing SQUAD's multi-project orchestration
**Key Message:** Manage multiple client projects simultaneously with one IDE

---

## DEMO PROJECTS SETUP

Three realistic, independent projects:
- **squad-demo-blog** - Personal blog platform
- **squad-demo-shop** - E-commerce store
- **squad-demo-dashboard** - Analytics dashboard

Each is a complete, self-contained SvelteKit application.

---

## PRE-RECORDING CHECKLIST

### 1. Quick Setup (2 Commands!)

```bash
# This ONE command does everything:
# - Creates projects (skips if they exist)
# - Clears all task lists
# - Kills old tmux sessions
# - Adds projects to config
squad-demo setup

# Show only demo projects in IDE
squad-demo on
```

### 2. Start IDE

```bash
squad
```

### 3. Browser Setup

1. Chrome DevTools → Responsive Mode (Ctrl+Shift+M)
2. Set to **1440 x 900**
3. Navigate to **http://127.0.0.1:3333/projects**
4. Ensure all three demo projects are visible

### 4. Have Task Descriptions Ready

- Blog task: `~/code/squad/assets/demo-task-blog.txt`
- Shop task: `~/code/squad/assets/demo-task-shop.txt`
- IDE task: `~/code/squad/assets/demo-task-dashboard.txt`

---

## 🎬 RECORDING SEQUENCE

### Scene 1: The Setup (0:00-0:05)
**"Managing Multiple Client Projects"**

1. **Start on /projects page**
2. Three project panels visible:
   - 🖊️ **squad-demo-blog** (Blog Platform)
   - 🛒 **squad-demo-shop** (E-commerce Store)
   - 📊 **squad-demo-dashboard** (Analytics)
3. All show empty task lists

**Narration:** "Three client projects, one IDE"

### Scene 2: Create Blog Comment Feature (0:05-0:15)

1. Click **"+ Task"** in blog project panel
2. Type title: `Add comment system`
3. Paste description from demo-task-blog.txt
4. **Watch AI auto-suggest:** Priority P1, Labels, Tags appear
5. Click **"Save & Close"**
6. Task appears in blog panel list
7. Click **🚀** to launch agent
8. **BlogAgent** session card appears
9. Terminal shows agent working

**Narration:** "AI suggests priority and labels. Launch with one click."

### Scene 3: Parallel Shop Feature (0:15-0:25)

1. **While BlogAgent is working**, go to shop panel
2. Click **"+ Task"** in shop project
3. Quick create:
   - Title: `Discount code system`
   - Description: (paste from demo-task-shop.txt)
4. Click **"Save & New"** (shows workflow speed)
5. Modal stays open, create another quick task (optional)
6. Then close and click **🚀** on discount task
7. **ShopAgent** session card appears
8. Now **TWO agents working simultaneously**

**Narration:** "Multiple agents, different projects, parallel execution"

### Scene 4: Add IDE Feature (0:25-0:30)

1. Click **"+ Task"** in IDE project
2. Quick create:
   - Title: `Real-time visitor tracking`
   - Description: (short paste from demo-task-dashboard.txt)
3. Click **"Save & Launch"** (instant execution!)
4. **IDEAgent** joins the swarm automatically
5. **THREE agents now working in parallel**

**Narration:** "Save and launch - straight to execution"

### Scene 5: Interactive Decision (0:30-0:40)
**[THE MONEY SHOT]**

1. **BlogAgent needs input** (purple badge)
2. Modal appears:
   ```
   Comment moderation approach?
   • Inline moderation - Approve/reject directly in comments
   • Admin panel - Separate moderation dashboard
   ```
3. Click **"Inline moderation"**
4. Agent continues with chosen approach
5. Meanwhile, other agents keep working

**Narration:** "Interactive decisions without stopping the swarm"

### Scene 6: Project Management (0:40-0:45)

1. **Collapse** blog panel (just header visible)
2. **Expand** shop panel (see agent details)
3. Click between session cards
4. Show how each project has independent:
   - Tasks
   - Agent sessions
   - Progress tracking

**Narration:** "Organize your view, monitor what matters"

### Scene 7: Completion (0:45-0:50)

1. Tasks turning green with ✓
2. Agents completing one by one
3. All three projects show completed work
4. Session cards show "COMPLETED"

**Narration:** "From idea to implementation, orchestrated"

### Scene 8: Quick Feature Tour (0:50-0:55)

Rapid cuts:
- `/files` - See generated code
- `/servers` - Dev servers running
- `/automation` - Rules keeping everything smooth
- Back to `/projects` - Three completed features

**Final text overlay:** "SQUAD - Multi-Project Development Orchestration"

---

## 🎯 KEY MOMENTS TO CAPTURE

| Time | Moment | Why It Matters |
|------|--------|----------------|
| 0:03 | Three projects visible | Shows multi-project capability |
| 0:12 | First agent launches | One-click execution |
| 0:22 | Second agent parallel | True parallel work |
| 0:28 | Three agents working | Scales to many projects |
| 0:35 | Interactive modal | Human-in-the-loop |
| 0:42 | Panel collapse/expand | UI flexibility |
| 0:48 | All completing | End-to-end orchestration |

---

## 📝 NARRATION SCRIPT (Optional Voiceover)

```
0:00 "Three client projects. One IDE to rule them all."
0:08 "Create a task. Launch an agent. It starts planning."
0:18 "While that works, start another project's feature."
0:25 "And another. True parallel development."
0:32 "When agents need decisions, the IDE delivers."
0:40 "Organize your view. Focus on what matters."
0:47 "From requirements to running code."
0:52 "SQUAD. Orchestration for modern development."
```

---

## 🔧 TECHNICAL SETUP

### Recording with OBS
- Canvas: 1440x900
- FPS: 30
- Bitrate: 6000 Kbps
- Format: MP4
- **Record longer than needed** (easier to cut than re-record)

### Video Editing (Post-Recording)

**OBS does NOT edit video.** Use one of these free editors:

**Recommended: DaVinci Resolve (Free)**
- Professional-grade, completely free
- Speed controls for fast-forward effects
- Text overlay capabilities
- Good export options

**Alternatives:**
- **OpenShot** - Simple, quick cuts and speed changes
- **Kdenlive** - Linux-native, full-featured
- **Shotcut** - Cross-platform, decent for basic edits

### Editing Plan
1. Import raw recording
2. **Cut:** Remove dead space, mistakes, waiting
3. **Speed up:** Agent working sections → 1.5-2x speed
4. **Keep normal:** User interactions, modal appearances
5. **Add:** Text overlays for key moments
6. **Export:** Final MP4 (~45-55 seconds)

---

## 🚨 CONTINGENCY PLANS

### If agent doesn't ask for input:
- Still impressive with 3 parallel agents
- Focus on project organization features

### If tasks don't create properly:
- Have backup tasks ready via `st create`
- Can manually create tasks quickly

### If recording runs long:
- Cut the feature tour (Scene 8)
- Speed up middle sections more

---

## ✅ SUCCESS METRICS

The demo succeeds if viewers understand:

1. **Multi-project management** - Not just one codebase
2. **Parallel execution** - Real simultaneous work
3. **Interactive orchestration** - IDE handles agent questions
4. **Flexible organization** - Collapse/expand/monitor as needed
5. **Complete workflow** - From task creation to completion

---

## 🎬 FINAL STEPS

1. **Record:** Save as `~/code/squad/assets/dashboard-demo-raw.mp4`
2. **Edit:** Trim, speed up working sections, add text overlays
3. **Export:** Final version as `dashboard-demo.mp4`
4. **Upload:** To GitHub, get shareable URL
5. **Update README:** Add video link with compelling description

---

## After Recording

```bash
# Restore normal projects
squad-demo off

# Clean up demo projects (optional - with confirmation prompt)
squad-demo clean
```