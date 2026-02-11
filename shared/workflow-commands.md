## Agent Workflow Commands (Jomarchy Agent Tools)

**5 streamlined commands for multi-agent coordination** located in `~/code/jat/commands/jat/`

**One agent = one session = one task.** Each Claude session handles exactly one task from start to completion.

**Core Workflow:**
- `/jat:start [agent-name | task-id]` - **Main command**: handles registration, task selection, conflict detection, and work start
- `/jat:complete [task-id]` - Finish work, verify, commit, close task, end session
- `/jat:commit` - Create well-organized commits with automatic documentation updates

**Escalation & Planning:**
- `/jat:verify [url]` - **Escalatory**: browser verification when user wants deeper testing
- `/jat:tasktree [prd-path]` - Convert PRD/spec into structured tasks with dependencies

**Maintenance:**
- `jat-doctor` - Bash script to diagnose installation issues (run anytime)

**Key behaviors:**
- All commands register your agent identity in the Agent Registry
- File reservations prevent conflicts between agents
- Memory system provides cross-session context

**Quick Start:**
```bash
# Simple workflow
/jat:start                    # Create agent, show available tasks
/jat:start task-abc           # Create agent, start specific task
/jat:complete                 # Complete task, end session

# With specific agent (IDE spawn)
/jat:start MyAgent task-abc   # Use MyAgent, start task
```

**Escalatory Verification:**
```bash
# Agent says "READY FOR REVIEW"
# User wants deeper testing...
/jat:verify                   # Open browser, test the feature, check console
/jat:verify /tasks            # Verify specific page
```

**Session Lifecycle:**
```
spawn agent → work on task → review → /jat:complete → session ends
                               │
                     (optional escalation)
                               │
                          /jat:verify → browser test → back to review
```

**Session-Aware:**
Each command automatically updates `.claude/sessions/agent-{session_id}.txt` for statusline display. Supports multiple concurrent agents in different terminals.

**See project CLAUDE.md for detailed documentation.**
