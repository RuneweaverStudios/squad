## Agent Workflow Commands (Jomarchy Agent Tools)

**7 streamlined commands for multi-agent coordination** located in `~/code/jat/commands/jat/`

**One agent = one session = one task.** Each Claude session handles exactly one task from start to completion.

**Core Workflow:**
- `/jat:start [agent-name | task-id]` - **Main command**: handles registration, task selection, conflict detection, and work start
- `/jat:complete [task-id]` - Finish work, verify, commit, close task, end session
- `/jat:commit` - Create well-organized commits with automatic documentation updates

**Coordination:**
- `/jat:status` - Check current work status, locks, messages

**Quality & Planning:**
- `/jat:verify [task-id]` - Pre-completion quality checks
- `/jat:plan` - Convert planning docs/conversation to Beads tasks
- `/jat:bead` - Convert PRD/spec into structured Beads tasks with dependencies

**Maintenance:**
- `jat-doctor` - Bash script to diagnose installation issues (run anytime)

**CRITICAL: All commands check Agent Mail FIRST (before any work):**
- Read messages (display to user)
- Respond if needed (reply, adjust plan)
- Acknowledge after reading
- This is MANDATORY - not optional!

**Quick Start:**
```bash
# Simple workflow
/jat:start                    # Create agent, show available tasks
/jat:start task-abc           # Create agent, start specific task
/jat:complete                 # Complete task, end session

# With specific agent (dashboard spawn)
/jat:start MyAgent task-abc   # Use MyAgent, start task
```

**Session Lifecycle:**
```
spawn agent → work on task → review → /jat:complete → session ends
                                      ↓
                          spawn new agent for next task
```

**Session-Aware:**
Each command automatically updates `.claude/sessions/agent-{session_id}.txt` for statusline display. Supports multiple concurrent agents in different terminals.

**See project CLAUDE.md for detailed documentation.**
