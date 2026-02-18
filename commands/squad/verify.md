---
argument-hint: [url | path]
---

Escalatory browser verification - open the app and test it in a real browser.

# Browser Verification (Escalatory Command)

**Use this when:** User asks you to "go verify in browser" or "actually test this" after you've shown "READY FOR REVIEW".

**What this does:**
1. Opens browser to the relevant page
2. Tests the specific feature you built
3. Checks console for errors
4. Reports what you see

**This is NOT for:** Static checks (tests, lint, types) - those are in `/squad:complete`.

---

## Browser Tools Overview

SQUAD includes lightweight browser automation tools in `~/.local/bin/`:

| Tool | Purpose |
|------|---------|
| `browser-start.js` | Launch Chrome with DevTools port |
| `browser-nav.js` | Navigate to URL |
| `browser-screenshot.js` | Capture screenshot |
| `browser-eval.js` | Execute JavaScript in page |
| `browser-pick.js` | Click element by selector |
| `browser-cookies.js` | Get/set cookies |

These tools are **low-token** - they just run commands and return results.

### Need Deeper Testing?

If the basic browser tools aren't enough (complex debugging, network inspection, performance profiling), you can enable the **ChromeDevTools MCP**:

```bash
# Enable ChromeDevTools MCP (burns more tokens but gives full DevTools access)
# Add to .mcp.json:
{
  "mcpServers": {
    "chromedevtools": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-chromedevtools"]
    }
  }
}
```

**When to enable ChromeDevTools MCP:**
- Network waterfall analysis
- Performance profiling
- Complex console debugging
- DOM inspection with full tree
- Memory leak detection

**For most verification, the basic browser tools are sufficient.**

---

## Quick Start

```bash
# If user says "verify this" - figure out what page to test based on your work
/squad:verify

# If user gives a specific URL
/squad:verify http://localhost:5173/tasks

# If user gives a path hint
/squad:verify /tasks
```

---

## Implementation

### STEP 1: Determine What to Test

Based on your recent work, identify:
- **URL**: What page should you open?
- **Feature**: What specific thing should you test?
- **Success criteria**: How do you know it works?

If unclear, ask the user:
```
I made changes to [files]. Which page should I verify?
- http://localhost:5173/tasks
- http://localhost:5173/work
- Other URL?
```

### STEP 2: Open Browser and Navigate

```bash
# Start browser if needed
browser-start.js

# Navigate to the page
browser-nav.js --url "http://localhost:5173/tasks"

# Take initial screenshot
browser-screenshot.js --output /tmp/verify-initial.png
```

Show the screenshot to the user: "Here's what I see..."

### STEP 3: Test the Feature

Based on what you built, interact with it:

```bash
# Click a button
browser-pick.js --selector "button.create-task"

# Fill a form field
browser-eval.js "document.querySelector('input[name=title]').value = 'Test task'"

# Check if element exists
browser-eval.js "!!document.querySelector('.success-message')"

# Wait for something to appear
browser-eval.js "document.body.innerText.includes('Task created')"
```

Take screenshots after each significant action.

### STEP 4: Check Console for Errors

```bash
# Check for JavaScript errors
browser-eval.js "window.__errors || []"

# Or set up error capture first
browser-eval.js "window.__errors = []; const origError = console.error; console.error = (...args) => { window.__errors.push(args.join(' ')); origError.apply(console, args); }"

# Then test the feature, then check
browser-eval.js "window.__errors"
```

### STEP 5: Report Findings

Output a verification report:

```
┌─ 🔍 BROWSER VERIFICATION ─────────────────────────────────────────────────┐
│                                                                           │
│  URL: http://localhost:5173/tasks                                         │
│  Feature: Task creation drawer                                            │
│                                                                           │
│  ✓ Page loaded successfully                                               │
│  ✓ "Create Task" button visible and clickable                             │
│  ✓ Drawer opens on click                                                  │
│  ✓ Form fields render correctly                                           │
│  ✓ Submit creates task (appears in list)                                  │
│  ✓ No console errors                                                      │
│                                                                           │
│  Screenshots saved:                                                       │
│  • /tmp/verify-initial.png                                                │
│  • /tmp/verify-drawer-open.png                                            │
│  • /tmp/verify-task-created.png                                           │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

🔍 READY FOR REVIEW - Browser verification passed
```

Or if issues found:

```
┌─ 🔍 BROWSER VERIFICATION ─────────────────────────────────────────────────┐
│                                                                           │
│  URL: http://localhost:5173/tasks                                         │
│  Feature: Task creation drawer                                            │
│                                                                           │
│  ✓ Page loaded successfully                                               │
│  ✓ "Create Task" button visible                                           │
│  ✗ Drawer fails to open - console error:                                  │
│      TypeError: Cannot read property 'open' of undefined                  │
│  ✗ Button click has no visible effect                                     │
│                                                                           │
│  Screenshots saved:                                                       │
│  • /tmp/verify-error.png                                                  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

⚠️ ISSUES FOUND - Fixing before completion...
```

If issues found, fix them and re-verify.

---

## Common Verification Patterns

### Testing a New Component
1. Navigate to page containing component
2. Screenshot the component
3. Interact with it (click, hover, input)
4. Verify expected behavior
5. Check console

### Testing a Form
1. Navigate to form page
2. Fill in fields with test data
3. Submit form
4. Verify success message or redirect
5. Verify data persisted (if applicable)

### Testing a Bug Fix
1. Navigate to page where bug occurred
2. Reproduce the original bug steps
3. Verify bug no longer occurs
4. Screenshot the working state

### Testing Visual Changes
1. Navigate to affected pages
2. Take screenshots
3. Compare to expected appearance
4. Check responsive behavior (if relevant)

---

## Error Handling

**Browser won't start:**
```bash
# Check if browser-tools are installed
ls ~/.local/bin/browser-*.js

# Try starting manually
browser-start.js --headless
```

**Page won't load:**
- Check dev server is running: `curl http://localhost:5173`
- Check for build errors: `npm run build`

**Console errors unrelated to your work:**
- Note them as "pre-existing" in your report
- Focus on NEW errors introduced by your changes

---

## After Verification

If verification **passed**: Return to "🔍 READY FOR REVIEW" state. User can now run `/squad:complete`.

If verification **failed**: Fix the issues, re-run verification, then return to "🔍 READY FOR REVIEW".
