# Sessions and Agents

Every JAT session follows a strict rule: one agent, one session, one task. This keeps context clean, prevents confusion about which changes belong to which task, and makes multi-agent coordination predictable.

## The one-agent-one-task model

When you spawn an agent session, it registers with a unique name, picks a single task, works on it until completion, then the session ends. Want to work on another task? Spawn a new agent.

```
spawn agent --> work on task --> review --> /jat:complete --> session ends
                                                 |
                                     spawn new agent for next task
```

This feels different from how most people use AI coding assistants. Normally you keep one long session going and switch between tasks. JAT breaks that pattern on purpose. Short, focused sessions mean:

- No context pollution between tasks
- Clear git history (one commit = one task)
- Other agents know exactly what each session is doing
- File reservations have well-defined lifetimes

## Agent registration

Agents get registered in the Agent Mail database when they start. There are two paths to registration depending on how the session was launched.

### IDE-spawned agents

When you click "Spawn" in the IDE or use `jat myproject 4 --auto`, the spawn API:

1. Generates an agent name
2. Registers it in the Agent Mail database
3. Creates a tmux session named `jat-{AgentName}`
4. Writes a pre-registration file for the agent to find

The agent reads the pre-registration file during `/jat:start` and skips manual registration entirely.

### CLI-launched agents

When you start a session manually, `/jat:start` handles registration:

```bash
am-register --name "CalmMeadow" --program claude-code --model sonnet-4.5
```

The agent then renames its tmux session and writes the identity file.

## Agent names

JAT generates two-word names from a curated list: an adjective paired with a noun. Names like CalmMeadow, SwiftMoon, JustGrove, FairBay. With 72 adjectives and 72 nouns, theres 5,184 possible combinations.

Names are designed to be:

- Easy to type in commands
- Easy to spot in logs and the IDE
- Distinct enough to avoid confusion between concurrent agents

The naming happens during registration. If a name collision occurs (unlikely but possible with many agents) the system picks a different one.

## Session identity files

JAT uses several files to map between session IDs, agent names, and tmux sessions.

| File | Location | Purpose |
|------|----------|---------|
| Session ID | `/tmp/claude-session-{PPID}.txt` | Maps process to Claude session ID |
| Agent name | `.claude/sessions/agent-{sessionId}.txt` | Maps session ID to agent name |
| Pre-registration | `.claude/sessions/.tmux-agent-{tmuxSession}` | IDE spawn sets name before agent starts |
| Context | `.claude/sessions/context-{sessionId}.json` | Stores epic context and review thresholds |

The lookup chain works like this:

```
Session ID (from hook) --> agent name (from identity file) --> tmux session (jat-{name})
```

Hooks use this chain to write state files that the IDE can find. When a `PreToolUse` hook fires for `AskUserQuestion`, it reads the session ID from the hook input, looks up the agent name, derives the tmux session name, and writes the question data to a temp file keyed by tmux session.

## Session lifecycle

Every session moves through a defined set of states. The IDE tracks these states through signals that the agent emits at each transition.

```
  ┌──────────┐
  │ STARTING │  Agent registered, checking mail, selecting task
  └────┬─────┘
       |
       v
  ┌──────────┐      ┌─────────────┐
  │ WORKING  │ <--> │ NEEDS INPUT │  Bounces between coding and questions
  └────┬─────┘      └─────────────┘
       |
       v
  ┌──────────┐
  │  REVIEW  │  Code done, waiting for user to approve
  └────┬─────┘
       |
       v
  ┌────────────┐
  │ COMPLETING │  Running verification, committing, closing
  └────┬───────┘
       |
       v
  ┌──────────┐
  │ COMPLETE │  Task closed in Beads, session ends
  └──────────┘
```

| State | Signal | What is happening |
|-------|--------|-------------------|
| Starting | `jat-signal starting` | Agent registered, reading mail, picking task |
| Working | `jat-signal working` | Actively coding, testing, iterating |
| Needs Input | `jat-signal needs_input` | Waiting for user clarification or decision |
| Review | `jat-signal review` | Work finished, presenting summary |
| Completing | `jat-step *` | Running commit, close, release, announce steps |
| Complete | `jat-step complete` | Everything done, completion bundle generated |

## tmux session naming

All Claude Code sessions must run inside tmux for the IDE to track them. Session names follow a specific convention:

- `jat-pending-{timestamp}` -- Initial session before `/jat:start`
- `jat-{AgentName}` -- After registration (e.g., `jat-CalmMeadow`)

Sessions NOT running in tmux show as "offline" or "disconnected" in the IDE. This is the most common reason for agents appearing invisible.

```bash
# CORRECT: Launch via jat CLI (creates tmux session)
jat myproject 1 --auto

# CORRECT: Use launcher function (creates tmux session)
jat-myproject

# WRONG: Running claude directly (no tmux)
cd ~/code/myproject && claude "/jat:start"
```

## Attach vs resume

The IDE provides two ways to interact with sessions from the UI:

**Attach** connects to a running session. Your terminal joins the existing tmux session so you can watch or interact with an active agent. Use this when the agent is currently working.

**Resume** restarts a completed session. The IDE looks up the Claude Code session ID from signal files and launches `claude -r {session_id}` in a new tmux session. Use this to ask follow-up questions about completed work.

| Feature | Attach | Resume |
|---------|--------|--------|
| Agent Status | Online (tmux exists) | Offline (tmux gone) |
| Creates Session | No (joins existing) | Yes (new tmux + claude -r) |
| Session ID Needed | No | Yes (auto-looked up) |
| Use Case | Watch or interact with active agent | Continue conversation with finished agent |

## Next steps

- [Task Management](/docs/task-management/) - How Beads tracks work
- [Agent Mail](/docs/agent-mail/) - Coordination between agents
- [Workflow Commands](/docs/workflow-commands/) - /jat:start, /jat:complete in detail
