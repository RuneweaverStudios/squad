# Multi-Agent Swarm

JAT's swarm mode launches multiple agents that independently pick and work on tasks from your backlog. A single command spawns 4+ agents, each grabbing the highest-priority ready task from JAT Tasks.

## Launching a swarm

The `jat` CLI accepts a project name and agent count:

```bash
# Launch 4 agents on the chimaro project
jat chimaro 4 --auto

# Claude-only mode (no npm dev server, browser, or IDE)
jat chimaro 4 --claude --auto
```

Without `--claude`, the full launch sequence runs:

1. Start the npm dev server for the project
2. Launch the browser with remote debugging
3. Start the IDE
4. Spawn 4 Claude Code sessions in tmux (staggered)
5. Each session runs `/jat:start auto` which picks the top ready task

With `--claude`, only steps 4 and 5 run. This is faster and uses fewer system resources when you dont need the browser or dev server.

## Agent stagger timing

Agents spawn with a configurable delay between each launch. The default is 15 seconds.

```json
{
  "defaults": {
    "agent_stagger": 15
  }
}
```

Staggering prevents race conditions. Without it, multiple agents might query `jt ready` at the same instant and grab the same task. The 15-second gap gives each agent time to register, reserve files, and update the task status before the next one starts.

If you have a large backlog with no shared files, you can reduce the stagger to 5 seconds. For repos with lots of overlapping code paths, 20-30 seconds is safer.

## Epic swarm attack

The Epic Swarm feature (Alt+E) spawns agents specifically for the subtasks of an epic.

```
Epic: "Improve IDE Performance" (jat-abc)
  |
  +-- jat-def: "Add caching layer"      --> Agent 1
  +-- jat-ghi: "Optimize queries"       --> Agent 2
  +-- jat-jkl: "Add performance tests"  --> Agent 3
```

The IDE reads the epic's child tasks, filters to those with `open` status, and spawns one agent per ready child. Dependencies between children are respected. If `jat-jkl` depends on `jat-ghi`, only `jat-def` and `jat-ghi` spawn initially. When `jat-ghi` completes, `jat-jkl` becomes ready and the IDE auto-spawns an agent for it.

Epic Swarm uses a special `auto_proceed` completion mode. When an agent finishes a child task, the completion bundle tells the IDE to immediately spawn the next available child. No human review needed between subtasks.

## Max concurrent sessions

System resources limit how many agents you can run simultaneously. Each Claude Code session uses roughly 200-300MB of RAM and generates sustained API traffic.

| Agents | RAM estimate | Good for |
|--------|-------------|----------|
| 1-2 | 0.5-1 GB | Development, testing |
| 3-4 | 1-2 GB | Standard backlog attack |
| 5-8 | 2-4 GB | Large feature rollout |
| 8+ | 4+ GB | Parallel epic swarm |

The `claude_startup_timeout` setting controls how long the IDE waits for each agent's Claude TUI to initialize. Default is 20 seconds. On slower machines, increase this to avoid false timeout errors:

```json
{
  "defaults": {
    "claude_startup_timeout": 30
  }
}
```

## Review rules for auto-proceed

Review rules control whether a completed task needs human review or auto-proceeds to the next task. Configure these in `.jat/review-rules.json` or through Settings in the IDE.

| Rule condition | Action | Example use case |
|----------------|--------|------------------|
| Priority P3-P4 + type chore | Auto-proceed | Low-risk cleanup tasks |
| Priority P0-P1 + type bug | Always review | High-priority bug fixes |
| Label "security" | Always review | Security-sensitive changes |
| Type "epic" | Always review | Epic verification needs human |
| Default (no match) | Review required | Safe fallback |

When an agent's completion bundle has `completionMode: "auto_proceed"`, the IDE kills the completed session and immediately spawns a new agent on the `nextTaskId`. The entire cycle runs without human intervention.

Per-task overrides are possible. Add `[REVIEW_OVERRIDE:auto_proceed]` or `[REVIEW_OVERRIDE:always_review]` to a task's notes field to override project-level rules.

The detection order is:

1. Task notes override
2. Session epic context (`.claude/sessions/context-{sessionId}.json`)
3. Project review rules (`.jat/review-rules.json`)
4. Default: review required

## Coordination via Agent Mail

When multiple agents work in the same repository, Agent Mail prevents conflicts.

**File reservations** lock file patterns before editing:

```bash
am-reserve "src/lib/cache/**" --agent FairBay --ttl 3600 --reason "jat-def"
```

If another agent tries to reserve overlapping files, it gets a `FILE_RESERVATION_CONFLICT` error and picks a different task.

**Broadcast messages** keep agents informed:

```bash
am-send "[jat-def] Starting: Add cache layer" "Working on Redis integration" \
  --from FairBay --to @active --thread jat-def
```

The `@active` recipient sends to all agents that checked in within the last 60 minutes. Other broadcast targets include `@recent` (24 hours), `@all`, and `@project:name`.

**Completion announcements** let other agents know when files are released:

```bash
am-send "[jat-def] Completed" "Cache layer done, files released" \
  --from FairBay --to @active --thread jat-def
```

Agents check their inbox at the start and end of every task. Messages that say "stop" or "requirements changed" halt work before completion. This prevents agents from committing work that's already been superseded.

## Agent routing

The IDE routes tasks to specific agent programs and models based on configurable rules in `~/.config/jat/agents.json`.

| Rule | Condition | Routes to |
|------|-----------|-----------|
| Security tasks | Label contains "security" | Claude Code + Opus |
| Chores | Type equals "chore" | Claude Code + Haiku |
| Frontend work | Label contains "frontend" | Claude Code + Sonnet |
| Default fallback | No rule matches | Claude Code + Opus |

This lets you optimize cost by routing low-risk tasks to cheaper models while keeping high-stakes work on the most capable model.

## See also

- [Workflow Commands](/docs/workflow-commands/) for the agent lifecycle
- [Automation](/docs/automation/) for auto-recovery during swarm runs
- [Signals](/docs/signals/) for how agents report state to the IDE
- [Work Sessions](/docs/work-sessions/) for monitoring running agents
