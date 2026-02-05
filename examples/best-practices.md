# Agent Mail Best Practices

Patterns that work well and anti-patterns to avoid, learned from real multi-agent development sessions.

## Table of Contents

- [File Reservations](#file-reservations)
- [Message Threading](#message-threading)
- [Agent Coordination](#agent-coordination)
- [Common Anti-Patterns](#common-anti-patterns)
- [Performance Tips](#performance-tips)
- [Integration with JAT Tasks](#integration-with-jat-tasks)

---

## File Reservations

### ✅ Best Practices

**1. Reserve Before Writing, Not Reading**
```bash
# ✅ GOOD: Only reserve when you'll modify files
am-reserve "src/lib/**" --agent YourAgent --ttl 3600 --exclusive

# ✗ BAD: Don't reserve just to read files
# (Reading doesn't need reservations)
```

**2. Use Specific Patterns**
```bash
# ✅ GOOD: Specific patterns reduce conflicts
am-reserve "src/components/auth/**" --agent Alice

# ✗ BAD: Broad patterns block too much
am-reserve "src/**" --agent Alice
```

**3. Set Realistic TTL**
```bash
# ✅ GOOD: Match your actual work time
am-reserve "api/**" --agent Bob --ttl 3600  # 1 hour

# ✗ BAD: Overly long locks block others
am-reserve "api/**" --agent Bob --ttl 86400  # 24 hours!
```

**4. Release When Done**
```bash
# ✅ GOOD: Release immediately when complete
am-send "[task-123] Complete" "..." --from Alice
am-release "src/lib/**" --agent Alice

# ✗ BAD: Forgetting to release (blocks others until expiry)
```

**5. Use Exclusive vs Shared Appropriately**
```bash
# ✅ GOOD: Exclusive for writing
am-reserve "src/**" --exclusive  # (default)

# ✅ GOOD: Shared for reading (rare, but useful)
am-reserve "tests/**" --shared  # Multiple can read

# ✗ BAD: Shared when you'll write (causes conflicts)
```

### 🚫 Anti-Patterns

**Don't: Reserve without working**
```bash
# ✗ BAD: "Just in case" reservations
am-reserve "src/**" --ttl 86400  # Not actually working on it
```

**Don't: Force-proceed on conflicts**
```bash
# ✗ BAD: Ignoring conflicts
am-reserve "src/**" --agent Bob  # Fails, Alice has it
# Then working anyway without coordination
```

**Don't: Forget the reason**
```bash
# ✗ BAD: No context
am-reserve "src/**" --reason ""

# ✅ GOOD: Clear reason with task ID
am-reserve "src/**" --reason "task-123: Refactoring auth"
```

---

## Message Threading

### ✅ Best Practices

**1. Use Task IDs as Thread IDs**
```bash
# ✅ GOOD: Consistent threading with JAT Tasks
am-send "[task-123] Starting" "..." --thread task-123
am-send "[task-123] Update" "..." --thread task-123
am-send "[task-123] Complete" "..." --thread task-123
```

**2. Prefix Subjects with Thread ID**
```bash
# ✅ GOOD: Scannable subjects
--subject "[task-123] Starting auth refactor"
--subject "[task-123] ✅ Complete"
--subject "[task-123] 🤝 HANDOFF to Bob"
```

**3. Use Importance Levels Appropriately**
```bash
# ✅ GOOD: High for blockers
am-send "..." --importance high --ack  # Blocks other work

# ✅ GOOD: Normal for updates
am-send "..." --importance normal  # (default)

# ✗ BAD: Everything as urgent
am-send "..." --importance urgent  # Urgent fatigue
```

**4. Require Acknowledgment for Critical Messages**
```bash
# ✅ GOOD: Ack for handoffs, completions
am-send "[task-123] 🤝 HANDOFF" "..." --ack
am-send "[task-123] ✅ COMPLETE" "..." --ack

# ✗ BAD: Ack for every message (ack fatigue)
```

### 🚫 Anti-Patterns

**Don't: Mix unrelated topics in one thread**
```bash
# ✗ BAD: Thread drift
am-send "..." --thread task-123  # About task 123
am-send "..." --thread task-123  # About task 456 (wrong!)
```

**Don't: Vague subjects**
```bash
# ✗ BAD: What task? What status?
--subject "Update"
--subject "Done"

# ✅ GOOD: Clear context
--subject "[task-123] Update: API endpoint ready"
--subject "[task-123] ✅ Complete - All tests passing"
```

---

## Agent Coordination

### ✅ Best Practices

**1. Announce Start and Completion**
```bash
# ✅ GOOD: Full lifecycle communication
am-send "[task-123] Starting" "ETA: 1 hour" --from Alice

# ... work happens ...

am-send "[task-123] ✅ Complete" "Ready for integration" --from Alice
```

**2. Share Context on Handoffs**
```bash
# ✅ GOOD: Detailed handoff
am-send "[task-123] 🤝 HANDOFF" "$(cat <<'EOF'
**Done:**
- Refactored auth flow
- Added tests

**Blocking:**
- Complex SQL optimization (need DB expert)

**Files:**
- src/auth/** (releasing now)

Bob, can you take over?
EOF
)" --from Alice --to Bob
```

**3. Coordinate on Conflicts**
```bash
# ✅ GOOD: Message when blocked
# (Conflict detected)
am-send "[coordination] File conflict" "You have src/auth/**. Can we coordinate?" --from Bob --to Alice

# ✗ BAD: Silent conflict (work anyway, merge conflict later)
```

**4. Use Search to Avoid Duplicates**
```bash
# ✅ GOOD: Check before starting
am-search "auth refactor" --thread task-123
# Oh, Alice already started this!

# ✗ BAD: Start without checking (duplicate work)
```

### 🚫 Anti-Patterns

**Don't: Ghost mode (no communication)**
```bash
# ✗ BAD: Silence
am-reserve "src/**" --agent Alice
# (works for hours with no updates)
```

**Don't: Assume others know your context**
```bash
# ✗ BAD: Vague handoff
am-send "I'm blocked, you finish this" --from Alice

# ✅ GOOD: Share context (like in handoff example)
```

---

## Common Anti-Patterns

### 1. The Silent Worker

**Problem:** Agent reserves files and works in silence
```bash
am-reserve "src/**" --ttl 86400
# (crickets for 24 hours)
```

**Solution:** Regular status updates
```bash
am-reserve "src/**" --ttl 3600
am-send "[task-123] Starting" "ETA: 1 hour"
# ... work ...
am-send "[task-123] Update" "50% done"
# ... work ...
am-send "[task-123] Complete" "Ready!"
am-release "src/**"
```

### 2. The Hoarder

**Problem:** Reserving too many files "just in case"
```bash
am-reserve "src/**" --ttl 86400
am-reserve "tests/**" --ttl 86400
am-reserve "docs/**" --ttl 86400
# (blocks everyone)
```

**Solution:** Reserve only what you're actively working on
```bash
am-reserve "src/auth/**" --ttl 3600  # Just auth, 1 hour
```

### 3. The Collision Course

**Problem:** Not checking for conflicts before starting
```bash
# (Sees task in JAT Tasks)
# (Starts working immediately)
# (Realizes Alice is already working on it)
# (Wasted time)
```

**Solution:** Check Agent Mail before starting
```bash
am-search "task-123"  # Anyone working on this?
am-reservations  # Any conflicts if I reserve?
# (Clear to proceed)
```

### 4. The Assumption Maker

**Problem:** Assuming files are free without checking
```bash
# ✗ BAD: Just start editing
# (Causes merge conflict with another agent's work)
```

**Solution:** Always reserve first
```bash
# ✅ GOOD: Reserve (automatic conflict detection)
am-reserve "src/**" --agent Alice
# Success or conflict error
```

---

## Performance Tips

### Message Efficiency

**1. Batch Similar Operations**
```bash
# ✅ GOOD: One message for multiple completions
am-send "[sprint] 3 tasks complete" "Finished task-1, task-2, task-3"

# ✗ SUBOPTIMAL: Three separate threads
am-send "[task-1] Complete"
am-send "[task-2] Complete"
am-send "[task-3] Complete"
```

**2. Use Search Instead of Inbox Scanning**
```bash
# ✅ GOOD: Targeted search
am-search "auth refactor" --thread task-123

# ✗ SLOW: Manual inbox scanning
am-inbox Agent | grep "auth"
```

### File Reservation Efficiency

**1. Release Early**
```bash
# ✅ GOOD: Release as soon as done
am-release "src/auth/**" --agent Alice
# (Immediately available for Bob)

# ✗ SLOW: Wait for TTL expiry
# (Blocks Bob for hours)
```

**2. Use Narrow Patterns**
```bash
# ✅ GOOD: Specific patterns
am-reserve "src/components/auth/**"  # Just auth components

# ✗ BROAD: Blocks too much
am-reserve "src/**"  # Entire src directory!
```

---

## Integration with JAT Tasks

### ✅ Best Practices

**1. Use JAT Task IDs as Thread IDs**
```bash
# ✅ GOOD: Consistent across tools
jt create "Implement auth" --priority 1
# → Creates task-123

am-send "[task-123] Starting" "..." --thread task-123
am-reserve "src/**" --reason "task-123: Auth implementation"
```

**2. Update JAT Task Status with Agent Mail**
```bash
# ✅ GOOD: Keep JAT Tasks in sync
am-send "[task-123] Complete" "..." --from Alice
jt close task-123 --reason "Completed by Alice"
```

**3. Check JAT Dependencies Before Starting**
```bash
# ✅ GOOD: Respect dependencies
jt show task-123 --json | jq '.depends_on'
# (Check if blockers are complete)

# ✗ BAD: Start without checking (wasted work if blocked)
```

### Common Integration Patterns

**Pattern 1: Start from JAT Tasks**
```bash
jt ready  # Get ready tasks
jt show task-123  # Review details
am-reserve "..." --reason "task-123"
am-send "[task-123] Starting" "..."
```

**Pattern 2: Complete to JAT Tasks**
```bash
am-send "[task-123] Complete" "..."
am-release "..."
jt close task-123
```

**Pattern 3: JAT Tasks + Agent Mail Together**
```bash
# JAT Tasks tracks WHAT (tasks, status, dependencies)
# Agent Mail tracks WHO and HOW (coordination, files, messages)
```

---

## Quick Reference

### When to Use What

| Situation | Tool | Command |
|-----------|------|---------|
| Starting work | Agent Mail | `am-reserve`, `am-send` |
| Check what's ready | JAT Tasks | `jt ready` |
| Coordinate with agent | Agent Mail | `am-send --to AgentName` |
| Check conflicts | Agent Mail | `am-reservations` |
| Hand off work | Agent Mail | `am-send` (with context), `am-release` |
| Mark task complete | JAT Tasks | `jt close` |
| Find past messages | Agent Mail | `am-search` |
| Check agent status | Agent Mail | `am-whoami` |

### Emoji Convention (Optional but Helpful)

- 🚀 Starting work
- ✅ Complete
- 🤝 Handoff
- ⚠️ Blocker
- 📋 Update
- 🔍 Question

Makes subjects scannable in busy inboxes!

---

## Real-World Example

**Based on actual PaleStar + IDEBuilder session:**

```bash
# IDEBuilder: P0 foundation
am-reserve "ide/**" --agent IDEBuilder
am-send "[odm] Starting SvelteKit" --from IDEBuilder

# PaleStar: P0 query layers (parallel)
am-reserve "lib/**" --agent PaleStar
am-send "[rpe] Starting JAT Tasks layer" --from PaleStar

# Both work simultaneously (no conflicts!)

# IDEBuilder finishes first
am-send "[odm] ✅ Complete" --from IDEBuilder
am-release "ide/**" --agent IDEBuilder

# PaleStar finishes
am-send "[rpe] ✅ Complete" --from PaleStar
am-release "lib/**" --agent PaleStar

# IDEBuilder uses PaleStar's work
am-reserve "ide/src/**" --agent IDEBuilder
am-send "[qx8] Starting UI (using lib/tasks.js)" --from IDEBuilder

# Result: 3 P0 tasks done in 90 minutes with ZERO conflicts
```

**Key Success Factors:**
1. Non-overlapping file patterns
2. Clear communication
3. Completion notifications
4. Building on each other's work

---

## Getting Help

- **Examples**: See `workflows/` directory
- **Documentation**: Main README.md
- **Tool Help**: Every `am-*` tool has `--help`
- **Issues**: GitHub Issues for bugs/questions

---

## Contributing

Found a pattern that works well? Add it here!

Found an anti-pattern? Document it in the "Anti-Patterns" section!

Pull requests welcome.
