# Work Sessions

The Work page (`/work`) is the real-time mission control for your agent sessions. Each running agent gets a SessionCard showing its current state, terminal output, and interactive controls.

## SessionCard component

Every active tmux session appears as a card on the Work page. The SessionCard component supports three display modes:

| Mode | Use case | Shows |
|------|----------|-------|
| `agent` | Full agent session | Terminal output, signals, question UI, controls |
| `server` | Dev servers (npm run dev) | Server status, port, restart button |
| `compact` | Collapsed view | Agent name, state badge, task ID only |

Cards are grouped by project. Each project section can be collapsed or expanded independently using the sidebar panel controls.

## Session states

Agents move through a predictable lifecycle. The IDE tracks state via SQUAD signals emitted by the agent and written to `/tmp/squad-signal-*.json` files.

```
STARTING --> WORKING <--> NEEDS INPUT --> REVIEW --> COMPLETING --> COMPLETED
```

| State | Badge color | What's happening |
|-------|-------------|------------------|
| `starting` | Blue | Agent booting, running `/squad:start` |
| `working` | Amber | Agent actively coding |
| `needs-input` | Purple | Agent asked a question, waiting for response |
| `ready-for-review` | Cyan | Work done, agent presenting results |
| `completing` | Teal | Running `/squad:complete` steps (progress bar shown) |
| `completed` | Green | Task closed, session finished |
| `idle` | Gray | Agent registered but no active task |

State detection uses SSE (Server-Sent Events) from the signals API. When an agent runs `squad-signal working '{"taskId":"squad-abc"}'`, the PostToolUse hook captures the signal, and the SSE server broadcasts the state change to connected IDE clients.

## Smart Question UI

When an agent calls the `AskUserQuestion` tool, the IDE renders clickable buttons instead of making you type a number in the terminal.

The flow works like this:

1. Agent calls `AskUserQuestion` with options
2. PreToolUse hook fires, writes question data to `/tmp/claude-question-tmux-{session}.json`
3. IDE polls the question endpoint and renders buttons
4. You click a button
5. IDE sends the answer via `tmux send-keys` to the agent's session
6. IDE deletes the temp file to prevent stale data

A suppress flag prevents race conditions. After clicking an answer, question fetching pauses for 2 seconds so the polling loop doesnt refetch the old question before the file gets deleted.

```typescript
let suppressQuestionFetch = $state(false);

async function submitAnswer() {
    suppressQuestionFetch = true;
    await sendTmuxKeys(answer);
    await deleteQuestionFile();
    setTimeout(() => { suppressQuestionFetch = false }, 2000);
}
```

## Terminal minimap

Each SessionCard shows a scrollable terminal output panel. The minimap provides a compressed overview of the full output on the right edge, similar to VS Code's minimap for files.

Click anywhere on the minimap to jump to that position in the output. The visible viewport is highlighted so you always know where you are relative to the full session history.

## Jump to session

When you have many agents running across multiple projects, finding a specific session can take a few clicks. The sidebar lists all active sessions grouped by project. Click any session name and the Work page scrolls to center that card in your viewport.

From the Agents or Tasks page, clicking an active agent name also jumps you to the Work page with that session focused.

## Instant signal pattern

The IDE uses an instant signal pattern for immediate UI feedback. Instead of waiting for the next polling cycle (which could be 500ms-2s), certain state changes update the UI instantly.

When the IDE itself triggers an action (like sending `/squad:complete` to a session), it writes the expected signal file immediately rather than waiting for the agent to emit it. This makes state transitions feel instantaneous.

```
User clicks "Complete" button
  --> IDE writes completing signal to /tmp/ (instant UI update)
  --> IDE sends /squad:complete via tmux keys
  --> Agent processes command and emits real signals
  --> Real signals replace the pre-written ones
```

The pattern works because signal files are idempotent. Writing a `completing` signal before the agent does causes no harm. When the agent emits its own signal, it overwrites the file with richer data.

## Session controls

Each SessionCard header includes a dropdown with contextual actions based on the current state:

| Action | Shortcut | Available when |
|--------|----------|----------------|
| Attach Terminal | Alt+A | Online sessions |
| Kill Session | Alt+K | Any session |
| Interrupt (Ctrl+C) | Alt+I | Working sessions |
| Pause Session | Alt+P | Working sessions |
| Restart | Alt+R | Offline sessions |
| Resume | - | Completed sessions |
| Copy Contents | Alt+Shift+C | Any session |

Session shortcuts require hovering over the target card first. The hovered session is tracked in component state and used as the target for keyboard actions.

## See also

- [Signals](/docs/signals/) for the signal protocol agents use
- [Automation](/docs/automation/) for auto-responding to agent questions
- [Keyboard Shortcuts](/docs/keyboard-shortcuts/) for session hotkeys
- [Workflow Commands](/docs/workflow-commands/) for agent lifecycle commands
