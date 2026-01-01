# Dashboard Demo Recording Script

**Target:** 10-12 second MP4 for README hero section
**Project:** jat-demo (demo project with pre-configured tasks)

---

## RESET (Run Before Each Take)

```bash
# 1. Reset jat-demo to clean state
cd ~/code/jat-demo
git checkout -- .
git clean -fd

# 2. Reset beads tasks to open status
cat > .beads/issues.jsonl << 'EOF'
{"id":"demo-1","title":"Add greeting() function to hello.ts","description":"Add a greeting(name: string) function that returns 'Hello, {name}!' to src/hello.ts. This is a demo task for the JAT multi-agent system.","status":"open","priority":1,"issue_type":"task","created_at":"2025-01-01T00:00:00.000000000-05:00","updated_at":"2025-01-01T00:00:00.000000000-05:00","labels":["demo","function"]}
{"id":"demo-2","title":"Add farewell() function to hello.ts","description":"Add a farewell(name: string) function that returns 'Goodbye, {name}!' to src/hello.ts. This is a demo task for the JAT multi-agent system.","status":"open","priority":1,"issue_type":"task","created_at":"2025-01-01T00:00:00.000000000-05:00","updated_at":"2025-01-01T00:00:00.000000000-05:00","labels":["demo","function"]}
{"id":"demo-3","title":"Add main() function that uses greeting and farewell","description":"Add a main() function that calls greeting('World') and farewell('World'), logging the results. Depends on demo-1 and demo-2 being complete first.","status":"open","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00.000000000-05:00","updated_at":"2025-01-01T00:00:00.000000000-05:00","labels":["demo","main"],"dependencies":[{"issue_id":"demo-3","depends_on_id":"demo-1","type":"blocks","created_at":"2025-01-01T00:00:00.000000000-05:00","created_by":"demo"},{"issue_id":"demo-3","depends_on_id":"demo-2","type":"blocks","created_at":"2025-01-01T00:00:00.000000000-05:00","created_by":"demo"}]}
EOF

# 3. Kill any running demo agents
tmux kill-session -t jat-DemoAgent1 2>/dev/null
tmux kill-session -t jat-DemoAgent2 2>/dev/null
tmux kill-session -t jat-DemoAgent3 2>/dev/null

echo "Reset complete. Ready for recording."
```

---

## ONE-TIME SETUP (Before First Recording Session)

### 1. Start Dashboard
```bash
jat-dashboard
```

### 2. Hide Real Projects
1. Go to **http://127.0.0.1:5174/config**
2. Click **Projects** tab
3. For EACH real project (chimaro, jomarchy, jat, etc.):
   - Click the **eye icon** to hide it
4. Only **jat-demo** should remain visible

### 3. Size Browser Window
- Width: ~1280px (or your preferred recording width)
- Height: ~800px
- Navigate to: **http://127.0.0.1:5174/work**

---

## RECORDING: Frame-by-Frame Instructions

**Start Omarchy screen recorder BEFORE step 1**

### Frame 1 (0:00-0:03) - Task Overview
1. Browser shows `/work` route
2. **TaskTable** (bottom panel) shows jat-demo tasks:
   - demo-1 [P1] - Open
   - demo-2 [P1] - Open
   - demo-3 [P2] - Blocked (gray, shows dependency arrow)
3. **DO:** Hover mouse slowly over the task table rows
4. **WAIT:** 3 seconds, let viewer absorb the layout

### Frame 2 (0:03-0:05) - Start an Agent
1. **DO:** Click the **rocket button** (🚀) on the demo-1 row in TaskTable
2. **WAIT:** Rocket animation fires, agent spawns
3. **RESULT:** New session card appears in top panel, agent starts working

### Frame 3 (0:05-0:08) - Agent Working
1. **SHOW:** Session card with "WORKING" status (amber glow)
2. **SHOW:** Terminal output streaming (code being written)
3. **DO:** Let it run, maybe hover over the session card
4. **WAIT:** 3 seconds to show activity

### Frame 4 (0:08-0:10) - Question UI (If Triggered)
1. **IF** agent asks a question (purple "NEEDS INPUT"):
   - **DO:** Click one of the answer buttons
   - **RESULT:** Agent continues working
2. **IF** no question appears:
   - **DO:** Just show the working state
   - Skip to Frame 5

### Frame 5 (0:10-0:12) - Task Completion
1. **SHOW:** Task status changing to complete (green checkmark)
2. **SHOW:** demo-3 becoming unblocked (if demo-1 and demo-2 both complete)
3. **DO:** Nothing, just let it animate
4. **END RECORDING**

---

## STOP RECORDING

Use Omarchy's stop hotkey or click stop button.

---

## RETAKE CHECKLIST

If the take wasn't good:

1. Run the **RESET** script above
2. Refresh browser (F5)
3. Wait 2 seconds for dashboard to reload
4. Start recording again

---

## ALTERNATIVE: Static Screenshot Recording

If live agents are too unpredictable, record a staged version:

### Pre-Stage the Dashboard
```bash
# 1. Manually set task statuses for a good screenshot
cd ~/code/jat-demo
# Edit .beads/issues.jsonl to set demo-1 to in_progress
# This shows a "working" state without needing a real agent
```

### Capture Key Moments
1. **Take 1:** Empty state - all tasks open
2. **Take 2:** One agent working on demo-1
3. **Take 3:** demo-1 complete, demo-2 in progress
4. **Take 4:** Both complete, demo-3 unblocked

Edit takes together in video editor if needed.

---

## OUTPUT

**File location:** Save to `~/code/jat/assets/dashboard-demo.mp4`

**For GitHub README:**
1. Go to any GitHub issue in jat repo
2. Drag the MP4 file into the comment box
3. GitHub converts it and gives you a URL like:
   ```
   https://github.com/user-attachments/assets/abc123-def456.mp4
   ```
4. Copy that URL into READMENEW.md at line 12

---

## KEY VISUALS CHECKLIST

Before submitting, verify the recording shows:

- [ ] Project name "jat-demo" visible
- [ ] Task list with P1/P2 priority badges
- [ ] Dependency visualization (demo-3 blocked)
- [ ] Agent session card with status
- [ ] Terminal output with syntax highlighting
- [ ] Status transition (working → complete OR question UI)
- [ ] Smooth mouse movements (not jerky)
- [ ] 10-12 seconds total length
