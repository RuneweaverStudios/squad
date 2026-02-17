# Architecture

JAT is built on two distinct layers. The first layer works with any CLI agent without modification. The second layer requires agents to participate in a coordination protocol. You can use either layer independently, but they work best together.

## Two-layer design

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   LAYER 2: Agent Orchestration (JAT-specific)                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Agent Registry (identity)                                    │  │
│   │  JAT Tasks (task management)                                     │  │
│   │  CLAUDE.md (agent instructions)                              │  │
│   │  Workflow commands (/jat:start, /jat:complete)              │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ^                                      │
│                              | built on                             │
│                              |                                      │
│   LAYER 1: Transparent Enhancement (agent-agnostic)                │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  PostToolUse hooks                                           │  │
│   │  Temp file state sharing                                     │  │
│   │  tmux session management                                     │  │
│   │  SSE for real-time updates                                   │  │
│   │  IDE UI rendering                                            │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Layer 1: Transparent enhancement

The agent is completely oblivious to the IDE. This layer uses a "sidecar" pattern where external applications enhance the agent experience without the agent knowing or caring.

### How it works

```
CLI Agent (any) --> PostToolUse Hooks --> Temp Files --> IDE UI
                                                           |
                                                           v
                                                      tmux keys
                                                           |
                                                           v
                                             Agent receives input
```

**Hooks** intercept tool calls before or after execution. A `PreToolUse` hook fires before a tool runs. A `PostToolUse` hook fires after. The hook scripts live in `.claude/hooks/` and are configured in `.claude/settings.json`.

**Temp files** enable cross-process communication. When a hook fires, it writes JSON data to `/tmp/`. The IDE polls or watches for these files, processes the data, renders it in the UI, and deletes the file after handling.

**tmux** provides session management and bidirectional communication. The IDE can send keystrokes to an agent's terminal with `tmux send-keys` and read terminal output with `tmux capture-pane`.

**SSE (Server-Sent Events)** push real-time updates from the IDE server to the browser without polling.

### Practical example

When an agent calls the `AskUserQuestion` tool, here is what happens:

1. `PreToolUse` hook fires, captures the question data
2. Hook writes question JSON to `/tmp/claude-question-tmux-{session}.json`
3. IDE polls the API endpoint, finds the question file
4. IDE renders clickable buttons in the browser
5. User clicks a button
6. IDE sends the answer via `tmux send-keys -t "jat-AgentName" "2" Enter`
7. Agent receives the input and continues working
8. IDE deletes the temp file

The agent never knew it was talking to a web UI. It just asked a question and got an answer.

### What Layer 1 supports

| Feature | Mechanism |
|---------|-----------|
| Smart Question UI | PreToolUse hook + tmux keys |
| Session monitoring | tmux capture-pane + SSE |
| Real-time status | Signal files in /tmp/ |
| Terminal output | ANSI rendering in browser |
| Agent-agnostic | Works with Claude Code, Codex, Aider, etc. |

## Layer 2: Explicit coordination

The agent actively participates in the system. It reads `CLAUDE.md` for instructions, uses the Agent Registry for identity, and follows JAT Tasks for task management.

### Components

**Agent Registry** is a coordination layer built on SQLite (`~/.agent-mail.db`). Agents register identities and look up other active agents. Core tools: `am-register`, `am-whoami`, `am-agents`. Cross-session context is handled by agent memory (`.jat/memory/`).

**JAT Tasks** is a dependency-aware task database. Each project has a `.jat/` directory with a SQLite database. The `jt` CLI handles task creation, status updates, dependency tracking, and priority-based work selection.

**Workflow commands** (`/jat:start`, `/jat:complete`, `/jat:pause`) are JAT-specific slash commands that handle the full lifecycle: registration, memory search, task selection, file declarations, status signals, and completion protocols.

**Signals** are JSON payloads that agents emit at state transitions (`starting`, `working`, `needs_input`, `review`, `completing`, `complete`). The IDE reads these signals to display accurate session state.

### Typical flow

```bash
# 1. Agent starts, registers, and declares files
/jat:start myproject-abc

# 2. Agent works on the task...

# 3. Agent completes
/jat:complete
# --> commits, closes task, clears file declarations
```

## Why this split matters

**For users:** Layer 1 gives you a better UI immediately. No agent training required. Layer 2 unlocks multi-agent orchestration when you need it.

**For developers:** Clean separation of concerns. Layer 1 patterns (hooks + temp files + tmux) work for any CLI tool, not just AI agents. Layer 2 can evolve independently.

**For the ecosystem:** Layer 1 could be adopted by other tools. The enhancement pattern is universal. Theres no vendor lock-in at the UI layer.

## Files reference

| Layer | Files |
|-------|-------|
| Layer 1 | `.claude/hooks/`, `.claude/settings.json`, `/tmp/claude-question-*.json`, `ide/src/routes/api/sessions/` |
| Layer 2 | `CLAUDE.md`, `shared/*.md`, `tools/agents/`, `commands/jat/`, `.jat/` |

## Next steps

- [Sessions & Agents](/docs/sessions/) - How the session lifecycle works
- [Agent Registry](/docs/agent-registry/) - Agent identity management
- [Signals](/docs/signals/) - The state tracking system
