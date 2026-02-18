## Agent Workflow Commands (Jomarchy Agent Tools)

**5 streamlined commands for multi-agent coordination** located in `~/code/squad/commands/squad/`

**One agent = one session = one task.** Each Claude session handles exactly one task from start to completion.

**Core Workflow:**
- `/squad:start [agent-name | task-id]` - **Main command**: handles registration, task selection, conflict detection, and work start
- `/squad:complete [task-id]` - Finish work, verify, commit, close task, end session
- `/squad:commit` - Create well-organized commits with automatic documentation updates

**Escalation & Planning:**
- `/squad:verify [url]` - **Escalatory**: browser verification when user wants deeper testing
- `/squad:tasktree [prd-path]` - Convert PRD/spec into structured tasks with dependencies

**Maintenance:**
- `squad-doctor` - Bash script to diagnose installation issues (run anytime)

**Key behaviors:**
- All commands register your agent identity in the Agent Registry
- File reservations prevent conflicts between agents
- Memory system provides cross-session context

**Quick Start:**
```bash
# Simple workflow
/squad:start                    # Create agent, show available tasks
/squad:start task-abc           # Create agent, start specific task
/squad:complete                 # Complete task, end session

# With specific agent (IDE spawn)
/squad:start MyAgent task-abc   # Use MyAgent, start task
```

**Escalatory Verification:**
```bash
# Agent says "READY FOR REVIEW"
# User wants deeper testing...
/squad:verify                   # Open browser, test the feature, check console
/squad:verify /tasks            # Verify specific page
```

**Session Lifecycle:**
```
spawn agent → work on task → review → /squad:complete → session ends
                               │
                     (optional escalation)
                               │
                          /squad:verify → browser test → back to review
```

**Session-Aware:**
Each command automatically updates `.claude/sessions/agent-{session_id}.txt` for statusline display. Supports multiple concurrent agents in different terminals.

**See project CLAUDE.md for detailed documentation.**
