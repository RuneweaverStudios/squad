---
argument-hint: AgentName taskId
---

# /squad:spawn - IDE-Spawned Agent Startup

**Minimal startup for agents spawned by the IDE.**

---

## What's Already Done

| Step | Who Does It |
|------|-------------|
| Generate agent name | Spawn API |
| Register in Agent Registry | Spawn API |
| Create tmux session `squad-{Agent}` | Spawn API |
| Assign task | Spawn API |
| Write `.tmux-agent-{session}` file | Spawn API |
| Write `.claude/sessions/agent-{sessionId}.txt` | SessionStart hook |

**You receive arguments:** `ARGUMENTS: AgentName taskId` (e.g., `ARGUMENTS: WindyRiver squad-abc123`)

---

## Steps

### 1. Emit Starting Signal

Use the agent name and task ID from your arguments:

```bash
squad-signal starting '{"agentName":"WindyRiver","sessionId":"...","taskId":"squad-abc123","project":"squad","model":"claude-opus-4-5-20251101","gitBranch":"master","gitStatus":"clean","tools":[],"uncommittedFiles":[]}'
```

Get session ID with: `get-current-session-id` (or check `/tmp/claude-session-*.txt`)

### 2. Read Task & Plan

```bash
st show squad-abc123 --json
```

### 3. Emit Working Signal & Begin

```bash
squad-signal working '{"taskId":"squad-abc123","taskTitle":"...","approach":"..."}'
```

Then output banner and work:

```
╔════════════════════════════════════════════════════════════════════╗
║         🚀 STARTING WORK: squad-abc123                               ║
╚════════════════════════════════════════════════════════════════════╝

✅ Agent: WindyRiver
📋 Task: {title from st show}

┌─ APPROACH ─────────────────────────────────────────────────────────┐
│  {your approach}                                                   │
└────────────────────────────────────────────────────────────────────┘
```

---

## When Done

Emit `review` signal, then run `/squad:complete` when user approves.
