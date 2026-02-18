## Agent/App Interface Pattern

This document describes the architecture for building external applications that interface with Claude Code agents. The SQUAD IDE is an implementation of this pattern.

### Why This Matters

Claude Code runs in a terminal, but many interactions benefit from richer UIs:
- **Questions** - Clickable buttons instead of typing numbers
- **Task management** - Visual boards instead of CLI commands
- **Monitoring** - Real-time IDE tracking instead of polling logs
- **File operations** - Drag-drop instead of path typing

The agent/app interface pattern enables external apps to:
1. **Observe** agent actions (hooks, file watching)
2. **Enhance** the UI (render richer interfaces)
3. **Respond** back to the agent (tmux keys, file writes)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT/APP INTERFACE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │ Claude Code  │ ──────► │  Interface   │ ──────► │  External    │    │
│  │   Agent      │         │   Layer      │         │     App      │    │
│  └──────────────┘         └──────────────┘         └──────────────┘    │
│         │                        │                        │             │
│         │                        │                        │             │
│         ▼                        ▼                        ▼             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │ Tool Calls   │         │ Temp Files   │         │ REST APIs    │    │
│  │ (hooks)      │         │ (/tmp/)      │         │ (SvelteKit)  │    │
│  └──────────────┘         └──────────────┘         └──────────────┘    │
│         │                        │                        │             │
│         │                        │                        │             │
│         ▼                        ▼                        ▼             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │ PreToolUse   │         │ JSON State   │         │ UI Render    │    │
│  │ PostToolUse  │         │ Sharing      │         │ User Input   │    │
│  └──────────────┘         └──────────────┘         └──────────────┘    │
│         │                                                  │            │
│         │                                                  │            │
│         └──────────────────┬───────────────────────────────┘            │
│                            ▼                                            │
│                    ┌──────────────┐                                     │
│                    │ tmux Keys    │                                     │
│                    │ (responses)  │                                     │
│                    └──────────────┘                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Communication Mechanisms

#### 1. Claude Code Hooks

Hooks intercept tool calls before or after execution.

**PreToolUse** - Fires BEFORE tool executes (user hasn't responded yet)
```bash
# .claude/hooks/pre-ask-user-question.sh
# Captures question data before user sees it
TOOL_INFO=$(cat)  # JSON with tool_input, session_id
echo "$TOOL_INFO" > "/tmp/claude-question-${SESSION_ID}.json"
```

**PostToolUse** - Fires AFTER tool completes
```bash
# .claude/hooks/post-bash.sh
# React to bash command results
TOOL_INFO=$(cat)  # JSON with tool_input, output, exit_code
```

**Configuration:** `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/pre-ask-user-question.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/post-bash.sh" }
        ]
      }
    ]
  }
}
```

**Hook Input Format:**
```json
{
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [...]
  },
  "session_id": "abc123-def456"
}
```

**When to use PreToolUse vs PostToolUse:**
| Scenario | Hook Type | Why |
|----------|-----------|-----|
| Show question UI before user answers | PreToolUse | Need data BEFORE interaction |
| Log command results | PostToolUse | Need output AFTER execution |
| Block dangerous operations | PreToolUse | Can return non-zero to abort |
| Update state after changes | PostToolUse | React to completed actions |

#### 2. File-Based State Sharing

Temp files enable cross-process communication without sockets.

**Naming Conventions:**
```
/tmp/claude-question-{sessionId}.json     # Question data by session ID
/tmp/claude-question-tmux-{tmuxSession}.json  # Question data by tmux session
/tmp/claude-session-{PPID}.txt            # Session ID lookup by process
.claude/sessions/agent-{sessionId}.txt    # Agent name for session (in sessions/ subdirectory)
.claude/sessions/context-{sessionId}.json # Session context (epic settings, reviewThreshold)
```

**Why both session ID and tmux session?**
- Session ID: Unique per Claude Code instance, stable across restarts
- tmux session: Human-readable, matches IDE naming (`squad-AgentName`)
- Write to both for flexible lookup

**File Lifecycle:**
1. Hook writes file when event occurs
2. App polls or watches for file
3. App processes data, renders UI
4. App deletes file after handling (prevents stale data)

#### 3. tmux Integration

tmux provides session management and bidirectional communication.

**Session Naming:**
```
squad-pending-{timestamp}  → Initial session (before registration)
squad-{AgentName}          → After /squad:start renames session
```

**Sending Input to Agent:**
```bash
# Send keystrokes to agent's terminal
tmux send-keys -t "squad-AgentName" "2" Enter

# Send text without executing
tmux send-keys -t "squad-AgentName" "some text"

# Send special keys
tmux send-keys -t "squad-AgentName" Escape
tmux send-keys -t "squad-AgentName" Tab
```

**Reading Terminal Output:**
```bash
# Capture visible pane content
tmux capture-pane -t "squad-AgentName" -p

# Capture with history
tmux capture-pane -t "squad-AgentName" -p -S -100
```

**Terminal Parsing (Fallback):**
When hooks aren't available, parse terminal output directly:
```typescript
// Strip ANSI escape codes first!
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '');
}

// Look for question patterns
const lines = stripAnsi(terminalOutput).split('\n');
const questionMatch = lines.find(l => l.includes('Enter to select'));
```

#### 4. REST API Layer

The app exposes APIs that bridge file state to HTTP.

**Pattern:**
```
GET  /api/work/{sessionId}/question  → Read /tmp/claude-question-*.json
POST /api/work/{sessionId}/answer    → tmux send-keys to session
DELETE /api/work/{sessionId}/question → Remove temp file
```

**Example Implementation:**
```typescript
// +server.ts
export async function GET({ params }) {
    const questionFile = `/tmp/claude-question-tmux-squad-${params.sessionId}.json`;
    if (existsSync(questionFile)) {
        const data = JSON.parse(readFileSync(questionFile, 'utf-8'));
        return json({ hasQuestion: true, question: data });
    }
    return json({ hasQuestion: false });
}
```

### Session Identity Mapping

Understanding how session IDs map to agent names is critical.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION IDENTITY FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Claude Code starts                                          │
│     └─► Generates unique session_id (e.g., "abc123-def456")    │
│                                                                 │
│  2. Process writes PPID mapping                                 │
│     └─► /tmp/claude-session-{PPID}.txt contains session_id     │
│                                                                 │
│  3. User runs /squad:start, picks agent name "FreeMarsh"         │
│     └─► Writes "FreeMarsh" to .claude/sessions/agent-{id}.txt  │
│     └─► Renames tmux session to "squad-FreeMarsh"                │
│                                                                 │
│  4. Hooks can now map session_id → agent name → tmux session   │
│     └─► session_id from hook input                              │
│     └─► agent name from .claude/sessions/agent-{session_id}.txt│
│     └─► tmux session is "squad-{agent_name}"                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Lookup Chain in Hooks:**
```bash
# 1. Get session_id from hook input
SESSION_ID=$(echo "$TOOL_INFO" | jq -r '.session_id')

# 2. Find agent name from session file (in sessions/ subdirectory)
AGENT_NAME=$(cat ".claude/sessions/agent-${SESSION_ID}.txt")

# 3. Derive tmux session name
TMUX_SESSION="squad-${AGENT_NAME}"

# 4. Write state file for IDE
echo "$DATA" > "/tmp/claude-question-tmux-${TMUX_SESSION}.json"
```

### Race Condition Handling

Async systems need careful timing management.

**Problem: Polling Refetches Stale Data**
```
1. User clicks answer button
2. App sends tmux keys
3. App calls DELETE /api/question
4. Polling interval fires BEFORE delete completes
5. App refetches question, shows it again!
```

**Solution: Suppress Flag**
```typescript
let suppressQuestionFetch = $state(false);

async function submitAnswer() {
    suppressQuestionFetch = true;  // Stop polling
    await sendTmuxKeys(answer);
    await fetch(`/api/question/${sessionId}`, { method: 'DELETE' });
    setTimeout(() => { suppressQuestionFetch = false }, 2000);
}

// In polling effect
$effect(() => {
    if (suppressQuestionFetch) return;  // Skip this cycle
    fetchQuestionData();
});
```

**Problem: Hook Subprocess Missing Environment**
```
1. Hook runs as subprocess of Claude Code
2. Environment variables like $TMUX not inherited
3. Hook can't determine tmux session name
```

**Solution: Multiple Lookup Methods**
```bash
# Method 1: Try $TMUX env var (may not be passed)
if [[ -n "${TMUX:-}" ]]; then
    TMUX_SESSION=$(tmux display-message -p '#S')
fi

# Method 2: Look up from agent session file (more reliable)
if [[ -z "$TMUX_SESSION" ]]; then
    # Check sessions/ subdirectory first, then legacy location
    AGENT_FILE=".claude/sessions/agent-${SESSION_ID}.txt"
    if [[ ! -f "$AGENT_FILE" ]]; then
        AGENT_FILE=".claude/agent-${SESSION_ID}.txt"
    fi
    if [[ -f "$AGENT_FILE" ]]; then
        AGENT_NAME=$(cat "$AGENT_FILE")
        TMUX_SESSION="squad-${AGENT_NAME}"
    fi
fi
```

**Problem: Terminal Output Has ANSI Codes**
```
Raw output: "\x1b[32m❯\x1b[0m 1. Yes, create task"
Regex looking for "❯" fails!
```

**Solution: Strip ANSI Before Parsing**
```typescript
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '');
}

const cleanOutput = stripAnsi(terminalOutput);
const match = cleanOutput.match(/❯\s+(\d+\.\s+.+)/);
```

### Extension Points

Other tools that could benefit from app interfaces:

| Tool | Enhancement | Implementation |
|------|-------------|----------------|
| **Bash** | Show command output in IDE | PostToolUse hook, stream to app |
| **Edit** | Visual diff before/after | PreToolUse captures old, PostToolUse captures new |
| **Read** | File browser integration | Log accessed files, show in sidebar |
| **WebFetch** | Preview fetched content | Cache responses, render in app |
| **TodoWrite** | Visual task board | Sync todo state to app database |

### Implementation Checklist

When building a new agent/app interface:

- [ ] **Define the interaction** - What data flows agent → app → agent?
- [ ] **Choose hook type** - PreToolUse (before) or PostToolUse (after)?
- [ ] **Design file format** - JSON schema for temp files
- [ ] **Handle session mapping** - session_id → agent name → tmux session
- [ ] **Build API endpoints** - REST layer over file state
- [ ] **Implement UI** - Render data, capture user input
- [ ] **Add response mechanism** - tmux keys or file writes
- [ ] **Handle race conditions** - Suppress flags, debouncing
- [ ] **Test terminal fallback** - Parse output when hooks unavailable
- [ ] **Clean up state** - Delete temp files after handling

### Example: Question UI Implementation

**Files involved:**
```
.claude/hooks/pre-ask-user-question.sh    # Hook script
.claude/settings.json                      # Hook configuration
/tmp/claude-question-tmux-{session}.json  # State file
ide/src/routes/api/work/[sessionId]/question/+server.ts  # API
ide/src/lib/components/work/SessionCard.svelte           # UI
```

**Data flow:**
```
1. Agent calls AskUserQuestion
2. PreToolUse hook fires, writes question JSON to /tmp/
3. IDE polls /api/work/{session}/question
4. API reads temp file, returns question data
5. SessionCard renders options as buttons
6. User clicks button
7. SessionCard sends tmux keys: "2" + Enter
8. Agent receives input, continues
9. SessionCard calls DELETE to clear question file
```

See `ide/CLAUDE.md` section "SMART QUESTION UI FLOW" for detailed implementation.

### References

- **Hooks documentation**: Claude Code docs on PreToolUse/PostToolUse
- **tmux manual**: `man tmux` for send-keys, capture-pane
- **Implementation**: `ide/src/lib/components/work/SessionCard.svelte`
- **Hook script**: `.claude/hooks/pre-ask-user-question.sh`
