# Multi-Agent Swarm

JAT enables running multiple AI coding agents in parallel, each working on a separate task from your backlog. This is the "swarm attack" pattern — launch a team of agents, let them coordinate via Agent Mail, and monitor everything from the IDE.

## Launching a Swarm

```bash
# Launch 4 agents that each auto-start the highest priority task
jat chimaro 4 --auto

# Claude-only (no npm server, browser, or IDE)
jat chimaro 4 --claude --auto
```

This will:
1. Start npm dev server + browser + IDE (unless `--claude`)
2. Launch 4 Claude sessions in tmux (with stagger delay between each)
3. Each session runs `/jat:start auto` → picks the top ready task

### Spawn Options

| Flag | Description |
|------|-------------|
| `--auto` | Auto-pick highest priority ready task |
| `--claude` | Claude sessions only (no npm/browser/IDE) |
| `--model opus` | Specify model (opus, sonnet, haiku) |

## From the IDE

The IDE provides several ways to spawn agents:

### Start Next Task
Click the **Start Next** dropdown (or `Alt+S`) to spawn an agent for the next ready task. The IDE uses routing rules to select the right agent and model.

### Epic Swarm
Open the **Epic Swarm Modal** (`Alt+E`) to launch agents for all ready subtasks of an epic simultaneously.

### Manual Spawn
From any task in the task table, click **Launch** to spawn an agent for that specific task.

## Agent Stagger

When launching multiple agents, JAT staggers their startup to avoid resource contention:

```json
{
  "defaults": {
    "agent_stagger": 15
  }
}
```

The `agent_stagger` setting (seconds) controls the delay between spawning each agent. Default is 15 seconds.

## Max Concurrent Sessions

```json
{
  "defaults": {
    "max_sessions": 12
  }
}
```

The IDE enforces a maximum number of concurrent tmux sessions to prevent system overload. Configure in Settings → Autopilot.

## Coordination

Agents coordinate through several mechanisms:

### File Reservations
Before editing files, agents reserve them via Agent Mail:

```bash
am-reserve "src/**/*.ts" --agent AgentName --ttl 3600 --exclusive --reason "jat-abc"
```

Other agents see the reservation and avoid those files.

### Message Threads
Agents communicate via threaded messages:

```bash
am-send "[jat-abc] Starting" "Working on auth module" \
  --from AgentA --to @active --thread jat-abc
```

### Dependency Tracking
Beads tracks task dependencies. Agents only pick tasks whose dependencies are satisfied (`bd ready`).

## Review Rules

Not all completions need human review. The review rules matrix controls which tasks auto-proceed:

```
              P0        P1        P2        P3        P4
bug         review    review    review    auto      auto
feature     review    review    review    auto      auto
task        review    review    auto      auto      auto
chore       review    auto      auto      auto      auto
```

Configure in Settings → Autopilot → Review Rules.

## Monitoring

The IDE provides real-time monitoring:

- **Work page** — Live terminal output from all agents
- **Tasks page** — Active tasks with session state badges
- **Agents page** — Agent grid with token usage and activity
- **Kanban** — Visual task board with drag-drop

### Session States

Each agent session displays its current state:

| State | Meaning |
|-------|---------|
| Starting | Agent initializing |
| Working | Actively coding |
| Needs Input | Waiting for user decision |
| Review | Work complete, presenting results |
| Completing | Running /jat:complete |
| Completed | Task done |

## See Also

- [Automation Rules](/docs/automation/) — Auto-recovery and auto-continue
- [Agent Mail](/docs/agent-mail/) — Coordination between agents
- [Review Rules](/docs/review-rules/) — Auto-proceed configuration
- [Sessions & Agents](/docs/sessions/) — Agent lifecycle
