# /agent:doctor - Diagnose and Repair jat Setup

You are diagnosing and repairing the jat (Jomarchy Agent Tools) installation for this project.

## What to Check

Run these diagnostics in order:

### 1. Check jat Installation

```bash
# Verify jat repo exists
test -d ~/code/jat && echo "✓ jat repo exists" || echo "✗ jat repo missing - run: git clone https://github.com/joewinke/jat ~/code/jat"

# Verify shared docs exist
ls ~/code/jat/shared/*.md 2>/dev/null | wc -l | xargs -I {} echo "✓ {} shared doc files found"
```

**Expected:** 7 shared doc files (overview, agent-mail, bash-patterns, beads, tools, workflow-commands, statusline)

### 2. Check CLAUDE.md Imports

Read this project's CLAUDE.md and verify it has these imports:

```
@~/code/jat/shared/overview.md
@~/code/jat/shared/agent-mail.md
@~/code/jat/shared/bash-patterns.md
@~/code/jat/shared/beads.md
@~/code/jat/shared/tools.md
@~/code/jat/shared/workflow-commands.md
@~/code/jat/shared/statusline.md
```

**Check for issues:**
- Missing imports (some or all)
- Malformed imports (wrong path, typos)
- Imports in wrong location (should be near top, after title)
- Duplicate imports

### 3. Check Global Config

```bash
# Verify statusline installed
test -f ~/.claude/statusline.sh && echo "✓ Statusline installed" || echo "✗ Statusline missing"

# Verify agent commands installed
ls ~/.claude/commands/agent/*.md 2>/dev/null | wc -l | xargs -I {} echo "✓ {} agent commands installed"
```

### 4. Check Tools

```bash
# Verify tools symlinked to ~/bin
for tool in am-register am-inbox am-send bd browser-start.js; do
  command -v $tool &>/dev/null && echo "✓ $tool" || echo "✗ $tool missing"
done
```

### 5. Check Beads

```bash
# Verify Beads initialized in this project
test -d .beads && echo "✓ Beads initialized" || echo "✗ Beads not initialized - run: bd init"
```

## Repair Actions

Based on diagnostics, offer to fix issues:

### Fix Missing Imports

If CLAUDE.md is missing imports, add them after the title (first # line):

```markdown
# Project Name

@~/code/jat/shared/overview.md
@~/code/jat/shared/agent-mail.md
@~/code/jat/shared/bash-patterns.md
@~/code/jat/shared/beads.md
@~/code/jat/shared/tools.md
@~/code/jat/shared/workflow-commands.md
@~/code/jat/shared/statusline.md

[rest of file...]
```

### Fix Malformed Imports

Replace any malformed imports with correct ones. Common issues:
- `@~/code/jat/shared/overview` → `@~/code/jat/shared/overview.md` (missing .md)
- `@/home/user/code/jat/...` → `@~/code/jat/...` (absolute vs ~)
- `@ ~/code/jat/...` → `@~/code/jat/...` (extra space)

### Fix Duplicate Imports

Remove duplicate import lines, keep one of each.

### Fix Missing Statusline

```bash
cp ~/code/jat/.claude/statusline.sh ~/.claude/statusline.sh
```

### Fix Missing Tools

```bash
cd ~/code/jat && ./install.sh
```

### Fix Missing Beads

```bash
bd init
```

## Output Format

After running diagnostics, output a summary:

```
## jat Doctor Report

### Status: [HEALTHY | NEEDS REPAIR]

### Checks:
✓ jat repo exists
✓ 7 shared docs present
✓ CLAUDE.md has all imports
✓ Statusline installed
✓ Agent commands installed (9)
✓ Tools available
✓ Beads initialized

### Issues Found:
[List any issues]

### Repairs Made:
[List any fixes applied]

### Manual Steps Needed:
[List anything that couldn't be auto-fixed]
```

## When to Use

- After cloning a new project
- When jat features aren't working
- After updating jat
- When imports seem broken
- Periodic health check
