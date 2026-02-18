---
author: Joe Winke
---

Create well-organized commits with automatic code cleanup and documentation updates.

# Git Commit

**Purpose:** Intelligently commit changes with proper organization, cleanup, and documentation.

**Usage:**
- `/git/commit` or `/git/commit session` - Commit only your session work (filters out others' changes)
- `/git/commit all` - Commit everything in source control (clean slate)

---

## Mode: Session (Default)

**Use when:**
- Multiple developers working, source control has mixed changes
- You want to commit only what YOU worked on
- There are unrelated edits from other agents/developers to ignore

**What it does:**
1. Identifies changes from YOUR session (filters out others)
2. Groups into logical commits by feature/fix
3. Reviews and cleans up code
4. Updates documentation
5. Creates commits via git-commit-assistant

---

## Mode: All

**Use when:**
- You're the only one working (or you want everything)
- Source control is messy and you want clean slate
- You know ALL changes are intentional

**What it does:**
1. Reviews ALL changes in working directory
2. Groups into logical commits by feature/fix
3. Reviews and cleans up code
4. Updates documentation
5. Creates commits via git-commit-assistant

---

## Execution Steps

### PART 1: Understand Scope

1. **Check git status:**
   ```bash
   git status
   git diff
   ```

2. **Determine scope based on parameter:**
   - **If `$1` is empty or "session"**: Filter to session work only
     - Check file reservations for context
     - Look for SQUAD task ID if in agent workflow
     - Identify files YOU modified (not other developers)

   - **If `$1` is "all"**: Include everything
     - All modified files
     - All staged files
     - All untracked files (that should be committed)

3. **Analyze and group changes:**
   - Distill changes into logical units:
     - Features (new capabilities)
     - Bug fixes (corrections)
     - Refactors (improvements without behavior change)
     - Documentation (docs-only changes)
     - Tests (test additions/updates)
   - Group related changes together
   - Separate unrelated changes into different commits

4. **Echo summary to console:**
   ```
   Found [X] logical change groups:
   1. [Feature] Add user authentication with Google OAuth
   2. [Fix] Correct brandId type inconsistency in userStore
   3. [Docs] Update CLAUDE.md with Svelte 5 patterns
   ```

### PART 2: Process Each Change Group

For each identified change group:

1. **Review code quality:**
   - Remove console.log debugging statements
   - Remove commented-out code
   - Remove redundant or unnecessary code
   - Check for SQL migrations that didn't need to run
   - Simplify overly complex code
   - Follow best practices from CLAUDE.md

   **If cleanup needed:**
   - Make cleanup edits
   - Stage cleanup changes
   - Document cleanup in commit message

2. **Check documentation:**
   - Review `./CLAUDE.md` for impacted sections
   - Review `/docs/*` for related documentation
   - Check if changes are reflected in docs

   **If docs need updating:**
   - Update CLAUDE.md (critical patterns, examples)
   - Update relevant /docs/ files (architecture, guides)
   - Stage documentation changes with code
   - Include doc updates in same commit

3. **Determine commit context:**
   - Check if part of agent workflow:
     - File reservations → extract task context
     - SQUAD task → get task ID and description
   - Extract feature/fix description
   - Identify impacted areas

4. **Create commit via git-commit-assistant:**
   - Launch Task tool with git-commit-assistant subagent
   - Provide context:
     - Change description
     - Task ID (if applicable)
     - Files to commit
     - Cleanup done
     - Documentation updated
   - Agent creates well-formatted commit with:
     - Clear subject line
     - Detailed body
     - Task ID reference (if applicable)
     - Co-authored-by Claude footer

5. **Verify commit created:**
   ```bash
   git log -1 --oneline
   ```

### PART 3: Repeat Until Done

- **Session mode**: Repeat until all YOUR session changes are committed
- **All mode**: Repeat until source control is completely clean

### PART 4: Final Verification

1. **Check source control status:**
   ```bash
   git status
   ```

2. **Review recent commits:**
   ```bash
   git log --oneline -5
   ```

3. **Report summary:**
   - Total commits created
   - Changes committed
   - Documentation updated
   - Source control status (clean or remaining files)

---

## Output Format

After completing all steps, format your output:

```
╔══════════════════════════════════════════════════════════════════════════╗
║                      📦 GIT COMMIT COMPLETE                              ║
║                                                                          ║
║                    Mode: [Session | All]                                 ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ CHANGES ANALYZED ─────────────────────────────────────────────────────┐
│                                                                        │
│  📊 Total change groups identified: [X]                                │
│  📝 Files modified: [Y files]                                          │
│  🧹 Cleanup performed: [Yes/No - details if yes]                       │
│  📚 Documentation updated: [Yes/No - files if yes]                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ COMMITS CREATED ──────────────────────────────────────────────────────┐
│                                                                        │
│  1️⃣  [hash] - [Feature] Add user authentication                       │
│     • Files: 8 modified                                                │
│     • Cleanup: Removed 3 console.log statements                        │
│     • Docs: Updated CLAUDE.md auth section                             │
│     • Task: dirt-abc                                                   │
│                                                                        │
│  2️⃣  [hash] - [Fix] Correct brandId type errors                       │
│     • Files: 5 modified                                                │
│     • Cleanup: None needed                                             │
│     • Docs: None needed                                                │
│     • Task: dirt-def                                                   │
│                                                                        │
│  3️⃣  [hash] - [Docs] Update Svelte 5 patterns                         │
│     • Files: 3 modified (docs/)                                        │
│     • Cleanup: None needed                                             │
│     • Docs: CLAUDE.md, docs/ui/patterns.md                             │
│     • Task: N/A                                                        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ SOURCE CONTROL STATUS ────────────────────────────────────────────────┐
│                                                                        │
│  ✅ Status: [Clean / Still has changes]                                │
│                                                                        │
│  [If Session mode and files remain:]                                   │
│  ⚠️  Remaining files (filtered from session scope):                    │
│     • [file1] - modified by other developer                            │
│     • [file2] - modified by other developer                            │
│                                                                        │
│  [If All mode and files remain:]                                       │
│  ⚠️  Remaining files (intentionally uncommitted):                      │
│     • [file1] - [reason not committed]                                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║                    ✅ COMMITS CREATED: [X] ✅                            ║
║                                                                          ║
║                    📦 Source Control: [Status]                           ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Integration with Agent Workflow

**If in active agent workflow:**

The command will automatically:

1. **Extract task context:**
   - Check for active file reservations → get task ID
   - Check SQUAD task → get full context

2. **Include in commit messages:**
   ```
   feat: implement Google OAuth login flow

   - Set up Supabase auth configuration
   - Create OAuth callback handlers
   - Build login UI components

   Implements dirt-abc: User authentication system

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

**If NOT in agent workflow:**

The command works standalone:
- No task ID references
- Standard commit messages

---

## Code Cleanup Checklist

**Always review for:**

✅ **Debug code:**
- `console.log()`, `console.debug()`, `debugger` statements
- Temporary test code
- Commented-out code blocks

✅ **Unnecessary changes:**
- Whitespace-only changes
- Import reordering (unless intentional cleanup)
- Formatting changes (unless intentional)

✅ **SQL migrations:**
- Migrations that were created but not needed
- Redundant migrations
- Migrations that should be combined

✅ **Code quality:**
- Unused variables or imports
- Overly complex code that can be simplified
- Violations of patterns in CLAUDE.md

✅ **Security:**
- No hardcoded secrets or API keys
- No `.env` files or credentials
- Sensitive data properly handled

**Cleanup actions:**
- Remove: Delete unnecessary code
- Revert: `git checkout -- <file>` for unintended changes
- Drop: `git rm` for files that shouldn't be tracked
- Simplify: Refactor complex code before committing

---

## Documentation Update Checklist

**Check CLAUDE.md for:**

✅ New patterns introduced (add to appropriate section)
✅ Security practices (update Security Best Practices)
✅ Common pitfalls (update Common Pitfalls to Avoid)
✅ Svelte 5 patterns (update Pre-Flight Checklist)
✅ Breaking changes (document clearly)

**Check /docs/ for:**

✅ Architecture changes (update relevant docs)
✅ New features (add to feature docs)
✅ API changes (update API documentation)
✅ Integration changes (update integration docs)

**Best practices:**
- Update docs in SAME commit as code
- Keep docs concise and focused
- Include examples for new patterns
- Link related documentation

---

## Session vs All: Decision Guide

### Use `session` when:

✅ Multiple people/agents working on codebase
✅ Source control has mixed changes (yours + others)
✅ You only want to commit YOUR work
✅ Want to ignore other developers' uncommitted changes
✅ Working in agent workflow with file reservations

**Example scenario:**
```
git status shows:
  modified: src/lib/auth.ts       (you worked on this)
  modified: src/lib/payment.ts    (another agent)
  modified: src/routes/admin.ts   (you worked on this)

/git/commit session
  → Commits only auth.ts and admin.ts
  → Ignores payment.ts (not your session work)
```

### Use `all` when:

✅ You're the only one working
✅ You want to commit EVERYTHING (clean slate)
✅ You've reviewed all changes and they're all intentional
✅ Source control is messy and you want it clean

**Example scenario:**
```
git status shows:
  modified: 20 files (all yours or reviewed)
  untracked: 5 new files (all intentional)

/git/commit all
  → Commits all 25 files
  → Leaves source control completely clean
```

---

## Best Practices

1. **Review before committing:**
   - Always review `git diff` output
   - Ensure changes are intentional
   - Check for accidental inclusions

2. **Use meaningful groupings:**
   - One logical change per commit
   - Related files in same commit
   - Don't mix features and fixes

3. **Clean up first:**
   - Remove debug code
   - Simplify before committing
   - Make code review-ready

4. **Update docs with code:**
   - Documentation in same commit as code
   - Keeps docs synchronized
   - Makes reviews easier

5. **Leverage task context:**
   - Include task IDs when in workflow
   - Reference related work
   - Create audit trail

6. **Atomic commits:**
   - Each commit should be self-contained
   - Could be reverted independently
   - Tells a clear story

---

## Common Scenarios

### Scenario 1: Clean up session work
```bash
# After day's work, commit only your changes
/git/commit session
  → Groups changes logically
  → Cleans up debug code
  → Updates docs
  → Creates 3 commits
  → Ignores other developers' work
```

### Scenario 2: Complete task and commit
```bash
# Task complete, commit everything
/git/commit all
  → Commits all changes
  → Includes task ID from file reservation
  → Clean source control
```

### Scenario 3: Mixed work
```bash
# Fixed bug AND added feature
/git/commit session
  → Identifies 2 change groups
  → Commit 1: Bug fix
  → Commit 2: Feature
  → Properly separated
```

---

**IMPORTANT:**
- Always review changes before confirming commits
- Use `session` by default (safer) unless you want everything
- Code cleanup is automatic - debug code will be removed
- Documentation updates are automatic - docs stay synchronized
- Task IDs are automatic - included if in agent workflow
- Each logical change gets its own commit - atomic and reviewable
