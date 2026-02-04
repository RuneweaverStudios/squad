# Introduction

JAT (Jomarchy Agent Tools) is an **agentic IDE** — a system that lets you run, monitor, and coordinate multiple AI coding agents working in parallel across your codebases.

## What JAT Does

JAT sits on top of your existing AI coding tools (Claude Code, Codex CLI, Gemini CLI, etc.) and provides:

- **A visual IDE** for monitoring agent sessions in real-time
- **Task management** with dependency tracking (Beads)
- **Agent coordination** via async messaging (Agent Mail)
- **Browser automation** for testing and verification
- **Multi-project support** with unified views

## The Problem

Modern AI coding assistants are powerful, but using them at scale creates chaos:

- **No visibility** — What are your agents doing right now?
- **No coordination** — Agents step on each other's files
- **No task tracking** — Which tasks are done? Which are blocked?
- **No automation** — Manual intervention for every question and error

## The Solution

JAT provides a two-layer architecture:

**Layer 1: Transparent Enhancement** — Works with any CLI agent. Hooks capture tool calls, temp files share state, tmux manages sessions. The agent doesn't know the IDE exists.

**Layer 2: Explicit Coordination** — Agents participate in the system via workflow commands, Agent Mail messaging, and Beads task management.

```
┌─────────────────────────────────────────────────────┐
│  Layer 2: Agent Orchestration (JAT-specific)        │
│  • Agent Mail • Beads • Workflow Commands            │
├─────────────────────────────────────────────────────┤
│  Layer 1: Transparent Enhancement (agent-agnostic)  │
│  • PostToolUse Hooks • tmux • Temp Files • SSE      │
└─────────────────────────────────────────────────────┘
```

## Key Principles

1. **One agent = one session = one task** — Each session handles exactly one task
2. **File reservations prevent conflicts** — Agents lock files before editing
3. **Messages coordinate work** — Check mail before starting, announce completions
4. **Beads is the task queue** — Pick from ready work, update status, close when done

## Supported Agents

| Agent | Auth Method | Status |
|-------|-------------|--------|
| Claude Code | Subscription (Pro/Max) | Full support |
| Codex CLI | Subscription (Plus/Pro) | Supported |
| OpenCode | OAuth | Supported |
| Gemini CLI | Google Account | Supported |
| Aider | API keys | Supported |
| Any CLI tool | Configurable | Via agent programs |

## Requirements

- **OS**: Linux or macOS
- **Shell**: bash or zsh
- **Required**: tmux, sqlite3, jq
- **Optional**: Node.js (for IDE and browser tools)

## Next Steps

- [Installation](/docs/installation/) — Get JAT installed
- [Quick Start](/docs/quick-start/) — Build something in 5 minutes
- [Architecture](/docs/architecture/) — Understand the design
