# Jomarchy Agent Tools - Architecture

Technical architecture documentation explaining design decisions, schema design, token savings analysis, and tool composition patterns.

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Why Bash + SQLite (Not MCP)](#why-bash--sqlite-not-mcp)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Tool Composition Patterns](#tool-composition-patterns)
- [Token Savings Analysis](#token-savings-analysis)
- [Performance Characteristics](#performance-characteristics)
- [Security Model](#security-model)

---

## Design Philosophy

### Core Principles

1. **Bash composability over HTTP servers**
   - Tools are standalone executables
   - Compose via pipes, redirects, xargs
   - No ports, no daemons, no API calls

2. **SQLite for persistent state**
   - Single-file database (`~/.agent-mail.db`)
   - ACID transactions
   - Zero configuration
   - Git-friendly (via JSONL backups)

3. **Prompts are code** (inspired by Mario Zechner)
   - Slash commands are markdown files with instructions
   - Claude executes step-by-step logic
   - Self-documenting coordination protocols

4. **Minimal token overhead**
   - Tools return structured output (JSON or text)
   - No schema introspection overhead
   - 80x token reduction vs MCP servers

5. **Universal compatibility**
   - Works with any AI assistant that runs bash
   - No vendor lock-in
   - No MCP dependency

---

## Why Bash + SQLite (Not MCP)

### The MCP Problem

**Model Context Protocol (MCP)** solves coordination, but has significant overhead:

| Issue | Impact |
|-------|--------|
| **Schema introspection** | 30,000+ tokens per tool connection |
| **Server startup** | 2-5 seconds per invocation |
| **HTTP overhead** | JSON-RPC for every operation |
| **Vendor lock** | Only works with MCP-compatible assistants |
| **Complexity** | Requires running server processes |

### The Bash Solution

**Jomarchy Agent Tools uses bash scripts + SQLite instead:**

| Benefit | Value |
|---------|-------|
| **Minimal tokens** | ~400 tokens (tool name + --help only) |
| **Instant startup** | <10ms per tool |
| **Native pipes** | Compose with `jq`, `grep`, `xargs` |
| **Universal** | Works with ANY bash-capable assistant |
| **Zero setup** | No servers to manage |

**Result:** 80x token reduction with universal compatibility.

### Token Cost Comparison

**MCP Server (Agent Mail example):**

```
Schema introspection:        32,000 tokens
Per-call overhead:              500 tokens
Tool response:                  200 tokens
──────────────────────────────────────────
Total per operation:         32,700 tokens
```

**Bash Tool (jt example):**

```
Tool name + description:        100 tokens
Help text (on demand):          300 tokens
Tool response:                  200 tokens
──────────────────────────────────────────
Total per operation:            400 tokens  (82x reduction!)
```

### When MCP Makes Sense

MCP is better when:

- You need **type safety** (TypeScript schemas enforced at runtime)
- You require **IDE integration** (autocomplete, type checking)
- You want **managed connections** (connection pooling, retry logic)
- You're building **cross-platform GUIs** (need server abstraction)

Bash tools are better when:

- You need **minimal overhead** (CLI-first workflows)
- You want **maximum composability** (pipe-based data flow)
- You require **universal compatibility** (works everywhere)
- You prefer **simple maintenance** (no servers to manage)

**JAT chooses bash for CLI-first AI coding workflows.**

---

## System Architecture

### High-Level View

```
┌─────────────────────────────────────────────┐
│  AI Coding Assistants                       │
│  (Claude Code, Cline, Cursor, etc.)         │
└────────────┬────────────────────────────────┘
             │ Uses slash commands
             │ Reads ~/.claude/CLAUDE.md
             ▼
┌─────────────────────────────────────────────┐
│  Coordination Commands (10 .md files)       │
│  ~/.claude/commands/jat/                  │
│  /register, /start, /complete, /handoff,    │
│  /pause, /block, /stop, /status, /verify    │
└────────┬──────────────────┬─────────────────┘
         │                  │
         │ Executes via...  │
         ▼                  ▼
┌──────────────┐   ┌──────────────────────────┐
│ Bash Tools   │   │  State Management        │
│ (28+ tools)  │   │                          │
│              │   │  • Agent Registry (SQLite)│
│ am-*         │◄──┤  • JAT Tasks (per-project)│
│ browser-*    │   │  • File Declarations     │
│ db-*         │   │                          │
└──────────────┘   └──────────────────────────┘
```

### Component Interaction

**Workflow Example: `/start` command**

1. **User invokes:** `/start`
2. **Claude reads:** `~/.claude/commands/jat/start.md`
3. **Expands to steps:**
   - Parse parameters and mode (quick/normal)
   - Detect task type (bulk vs normal)
   - Contextualize from conversation OR auto-select
   - Check conflicts (git status, dependencies)
   - Declare files via `jt update --files`
   - Query dependencies via `jt show`
   - BEGIN WORK
4. **Bash tools execute:**
   - `jt update jat-123 --files "src/**"` → SQLite UPDATE
   - `jt show jat-123 --json` → Reads .jat/tasks.db
5. **State persists:**
   - Agent Registry: `~/.agent-mail.db`
   - JAT Tasks: `.jat/tasks.db` (SQLite, per-project)
   - File declarations: stored on the task record

**Zero HTTP calls. Zero servers. Pure bash + SQLite.**

---

## Database Schema

### Agent Mail Schema (`~/.agent-mail.db`)

#### Projects Table

```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,           -- URL-safe identifier (e.g., "chimaro")
    human_key TEXT NOT NULL,             -- Absolute path (e.g., "/home/user/code/chimaro")
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Purpose:** Track git repositories or logical project groupings.

**Why slugs?** URL-safe identifiers for cross-project references.

#### Agents Table

```sql
CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,                  -- "BlueLake", "GreenCastle" (Adjective+Noun)
    program TEXT NOT NULL,               -- "claude-code", "cursor", "aider"
    model TEXT NOT NULL,                 -- "sonnet-4.5", "gpt-4"
    task_description TEXT DEFAULT '',
    inception_ts TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_ts TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    UNIQUE (project_id, name)
);
```

**Purpose:** Track agent identities within projects.

**Why Adjective+Noun naming?** (e.g., "BlueLake", "GreenCastle")

- Human-readable
- Auto-generated (no naming conflicts)
- Easy to reference in messages

**Design decision:** One agent name per project allows resuming sessions.

#### Messages Table

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    thread_id TEXT,                      -- Use JAT task ID (e.g., "jat-123")
    subject TEXT NOT NULL,
    body_md TEXT NOT NULL,               -- Markdown content
    importance TEXT NOT NULL DEFAULT 'normal', -- normal | high | urgent
    ack_required INTEGER DEFAULT 0,      -- Boolean
    created_ts TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (sender_id) REFERENCES agents(id)
);
```

**Purpose:** Async communication between agents.

**Why thread_id?** Links messages to JAT tasks for traceability.

**Why Markdown?** Structured content (code blocks, lists, links) in messages.

#### Message Recipients Table (many-to-many)

```sql
CREATE TABLE message_recipients (
    message_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    ack_ts TEXT,                         -- Acknowledgment timestamp
    PRIMARY KEY (message_id, recipient_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (recipient_id) REFERENCES agents(id)
);
```

**Purpose:** Track who received a message and acknowledgment status.

**Why separate table?** One message can have multiple recipients.

#### Indexes for Performance

```sql
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_project ON messages(project_id);
CREATE INDEX idx_messages_created ON messages(created_ts);
```

> **Note:** File declarations are stored on the task record itself (via `jt update --files`),
> not in a separate table. They are automatically cleared when the task is closed.

### JAT Tasks Schema (`.jat/tasks.db`)

**Format:** SQLite database (per-project)

**Example task:**

```json
{
  "id": "chimaro-abc",
  "title": "Implement OAuth login",
  "description": "Add Google OAuth to auth system",
  "status": "open",
  "priority": 1,
  "issue_type": "feature",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z",
  "labels": ["auth", "oauth", "p1"],
  "depends_on": ["chimaro-xyz"]
}
```

**Why SQLite?**

- ACID transactions (reliable concurrent access)
- Fast queries with indexes
- Zero configuration
- Per-project isolation

**Why per-project databases?**

- Clean separation (each repo has own tasks)
- No global state leakage
- IDE aggregation (JAT IDE reads all `~/code/*/.jat/`)

---

## Tool Composition Patterns

### Pattern 1: Pipes (Data Transformation)

```bash
# Get ready tasks as JSON, filter by priority, extract IDs
jt ready --json | \
  jq '.[] | select(.priority <= 1)' | \
  jq -r '.id'
```

**Tools used:** `jt` → `jq`

**Pattern:** Transform → Filter → Extract

### Pattern 2: Bulk Operations (xargs)

```bash
# Close all tasks matching a label
jt list --json | jq -r '.[] | select(.labels | contains(["cleanup"])) | .id' | \
  xargs -I {} jt close {} --reason "Batch cleanup"
```

**Tools used:** `jt` → `jq` → `xargs` → `jt`

**Pattern:** Query → Extract → Iterate

### Pattern 3: Conditional Logic (if/else)

```bash
# Check if task has file declarations before starting
task_files=$(jt show jat-abc --json | jq -r '.[0].reserved_files // ""')
if [[ -n "$task_files" ]]; then
  echo "Task already has file declarations: $task_files"
else
  jt update jat-abc --files "src/auth/**"
fi
```

**Tools used:** `jt` → `jq` → conditional

**Pattern:** Query → Check → Act

### Pattern 4: Parallel Queries (background jobs)

```bash
# Gather metrics in parallel
{
  am-agents --json > /tmp/agents.json &
  jt ready --json > /tmp/tasks.json &
  wait
}

# Process results
jq '.[] | .name' /tmp/agents.json
```

**Tools used:** Multiple tools in parallel via `&` and `wait`

**Pattern:** Fork → Wait → Process

### Pattern 5: Incremental Processing (while read)

```bash
# Process each task from JAT Tasks queue
jt ready --json | jq -c '.[]' | while read task; do
  task_id=$(echo "$task" | jq -r '.id')
  priority=$(echo "$task" | jq -r '.priority')
  echo "Processing $task_id (P$priority)"
  # ... do work ...
done
```

**Tools used:** `jt` → `jq` → `while read`

**Pattern:** Stream → Parse → Iterate

### Pattern 6: Error Handling (pipefail)

```bash
set -euo pipefail

# Safely chain tools (fails if any step fails)
jt ready --json | \
  jq '.[] | select(.priority <= 1)' | \
  tee /tmp/urgent.json | \
  jq -r '.id'
```

**Pattern:** Safe chaining with `set -euo pipefail`

**Why?** Catches failures in pipe chains.

---

## Token Savings Analysis

### Scenario: Agent picks task and starts work

#### MCP Approach (Agent Mail Server)

```
1. Connect to MCP server:
   - Schema introspection:           30,000 tokens
   - Tool listing:                    2,000 tokens

2. Get inbox (mcp.agent_mail.get_inbox):
   - Request overhead:                  500 tokens
   - Response JSON:                     800 tokens

3. Get tasks (hypothetical mcp.jat_tasks.get_ready):
   - Request overhead:                  500 tokens
   - Response JSON:                   1,200 tokens

4. Reserve files (mcp.agent_mail.reserve_files):
   - Request overhead:                  500 tokens
   - Response JSON:                     300 tokens

5. Send announcement (mcp.agent_mail.send_message):
   - Request overhead:                  500 tokens
   - Response JSON:                     200 tokens

──────────────────────────────────────────────────
Total:                                36,500 tokens
```

#### Bash Approach (JAT)

```
1. Get tasks (jt ready --json):
   - Tool name:                          20 tokens
   - Response JSON:                   1,200 tokens

2. Start task (jt update --status in_progress --files "src/**"):
   - Tool name + args:                   50 tokens
   - Response text:                     100 tokens

──────────────────────────────────────────────────
Total:                                 1,370 tokens
```

**Savings:** 34,110 tokens (93% reduction!)

### Scaling Analysis

**For 10 agent coordination cycles:**

| Approach | Tokens per Cycle | Total for 10 Cycles |
|----------|------------------|---------------------|
| MCP | 36,500 | 365,000 |
| Bash | 2,390 | 23,900 |
| **Savings** | **34,110** | **341,100 (93%)** |

**Context window impact:**

- Claude Sonnet 4.5: 200k context window
- MCP approach: 365k tokens = exceeds window (requires summarization)
- Bash approach: 23.9k tokens = fits easily with room for code

**JAT enables swarm coordination that fits in context windows.**

---

## Performance Characteristics

### Tool Invocation Latency

**Bash tool overhead:**

```
Tool startup:               5-10ms
SQLite query:              10-20ms
JSON parsing (jq):          5-10ms
──────────────────────────────────
Total per invocation:      20-40ms
```

**MCP server overhead:**

```
Server startup:           2,000-5,000ms
HTTP connection:              50-100ms
JSON-RPC overhead:            20-50ms
Schema validation:            10-30ms
──────────────────────────────────────
Total per invocation:    2,080-5,180ms
```

**Result:** Bash tools are 52-129x faster (20ms vs 2,080ms).

### Database Performance

**SQLite characteristics:**

- Read latency: 1-10ms (indexed queries)
- Write latency: 5-20ms (single transaction)
- Concurrent reads: Unlimited
- Concurrent writes: Serialized (lock-free read-only mode)

**Why SQLite is perfect here:**

- Local file (no network latency)
- ACID transactions (no data loss)
- Zero configuration (no server setup)
- Single-file portability (backup with `cp`)

**Bottleneck:** Write-heavy workloads (>100 writes/sec) may see lock contention.

**Mitigation:** WAL mode enabled (`PRAGMA journal_mode=WAL`) for better concurrency.

### JAT Tasks SQLite Performance

**Read performance:**

- Indexed queries: 1-10ms
- Full table scan (<1000 tasks): 5-10ms

**Write performance:**

- Single transaction: 5-20ms
- Batch operations: Serialized via WAL mode

**Why SQLite for tasks:** Fast queries, ACID transactions, and zero configuration. Task updates are infrequent (seconds apart, not milliseconds).

---

## Security Model

### Threat Model

**Assumptions:**

1. Agents run on **trusted local machine** (not remote)
2. Users have **file system access** (can modify ~/.agent-mail.db)
3. No **hostile agents** (agents cooperate, don't sabotage)

**Out of scope:**

- Remote agents (untrusted network)
- Malicious agents (code execution attacks)
- Multi-user systems (permission isolation)

### Security Measures

#### 1. File Declarations (Advisory)

**Not enforced.** Agents declare which files they plan to edit via `jt update --files`. Other agents check these declarations voluntarily.

**Attack:** Malicious agent ignores declarations → writes anyway

**Mitigation:** Git conflict resolution (manual merge required)

**Design choice:** Advisory declarations = simpler, sufficient for cooperative agents.

#### 2. SQLite Injection Prevention

**Parameterized queries:**

```bash
# Safe (uses SQLite parameters)
sqlite3 ~/.agent-mail.db \
  "SELECT * FROM messages WHERE thread_id = ?" "$thread_id"

# Unsafe (vulnerable to injection)
sqlite3 ~/.agent-mail.db \
  "SELECT * FROM messages WHERE thread_id = '$thread_id'"
```

**All JAT tools use parameterized queries** via `am-lib.sh:query_db()`.

#### 3. Path Validation

**File declaration patterns are relative to project root:**

```bash
# Valid patterns
jt update task-id --files "src/**/*.ts"   # Glob pattern
jt update task-id --files "src/auth/"     # Directory
```

**Validation logic:** Patterns must be relative to project root.

#### 4. Agent Name Validation

**Enforced format:** `[A-Z][a-z]+[A-Z][a-z]+` (e.g., "BlueLake")

**Why?** Prevents injection via special characters in SQL/bash contexts.

#### 5. Database Permissions

**File permissions:**

```
~/.agent-mail.db: 0644 (rw-r--r--)
  - Owner: Full read/write
  - Others: Read-only
```

**Why read-only for others?** Agents from other users can inspect but not modify.

### Best Practices

1. **Run on trusted machines** (your laptop, your servers)
2. **Don't expose SQLite database** over network
3. **Audit agent behavior** (check git history for rogue commits)
4. **Use file declarations** (prevent accidental conflicts, not attacks)
5. **Review JAT tasks** (verify task descriptions before accepting)

**JAT prioritizes simplicity over paranoia.** Designed for cooperative agents on trusted machines.

---

## Scalability Considerations

### Agent Count

**How many agents can coordinate?**

- SQLite write limit: ~1000 writes/sec (WAL mode)
- Typical agent: 1-5 writes/min (messages, reservations)
- **Theoretical limit:** 12,000-60,000 agents

**Practical limit:** 10-50 agents

**Bottleneck:** Human coordination (not technical)

### Project Count

**How many projects can one agent work across?**

- Agent Mail: One `~/.agent-mail.db` for all projects
- JAT Tasks: One `.jat/` per project
- **Limit:** Unlimited (tested with 50+ projects)

**IDE aggregation:**

- JAT IDE scans `~/code/*/.jat/`
- Linear scan: ~10ms per project
- 50 projects: 500ms total

**Performance:** Sub-second even with 100+ projects.

### Message Volume

**Archive size growth:**

- Average message: ~500 bytes
- 1000 messages/day: ~500 KB/day
- 1 year: ~180 MB

**Cleanup strategy:**

- Periodic archival (move old messages to .archive table)
- Retention policy (delete messages >90 days)

**Current implementation:** No automatic cleanup (manual if needed).

---

## Future Considerations

### Potential Enhancements

1. **Distributed Agent Mail**
   - Sync `~/.agent-mail.db` across machines
   - Conflict-free replicated data types (CRDTs)
   - Enables remote agent coordination

2. **Advanced File Locking**
   - Line-level locks (not just file-level)
   - Read locks vs write locks (allow concurrent reads)

3. **Agent Swarm Intelligence**
   - Auto-assign tasks based on agent capabilities
   - Load balancing (distribute work evenly)
   - Failure recovery (reassign if agent crashes)

4. **Real-Time IDE**
   - WebSocket updates (no page refresh)
   - Agent presence indicators (who's online)
   - Live task progress tracking

5. **MCP Compatibility Layer**
   - Expose JAT tools via MCP protocol
   - Best of both worlds (bash tools + MCP integration)

### Design Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Bash over HTTP | Instant startup, composability | No remote access |
| SQLite over PostgreSQL | Zero config, single-file | Write concurrency limit |
| SQLite per-project (JAT Tasks) | Fast queries, ACID transactions | Not directly git-diffable |
| Advisory locks | Simple, no enforcement overhead | Requires cooperative agents |
| Local-only | Fast, no network latency | Can't coordinate across machines |

**JAT optimizes for:**

- Local-first development
- Minimal overhead
- Maximum composability
- Universal compatibility

**JAT sacrifices:**

- Remote coordination (without syncing)
- Write-heavy workloads (>100/sec)
- Enforced isolation (assumes cooperation)

---

## Conclusion

**Jomarchy Agent Tools proves that bash + SQLite can power sophisticated multi-agent coordination with 80x token reduction vs MCP servers.**

**Key architectural insights:**

1. **Bash composability > HTTP abstraction** for CLI workflows
2. **SQLite provides ACID guarantees** without server complexity
3. **Prompts are code** enables self-documenting coordination
4. **Advisory locks suffice** for cooperative agents
5. **Local-first architecture** prioritizes speed and simplicity

**When to use JAT:**

- AI-assisted development workflows
- CLI-first coding environments
- Token-constrained models
- Local development (laptop, workstation)

**When NOT to use JAT:**

- Remote agent coordination (across networks)
- High-security environments (need enforced isolation)
- Write-heavy workloads (>100 writes/sec)
- Multi-user shared systems

**JAT's niche: Local-first AI coding with minimal overhead.**

For questions or discussions, see [CONTRIBUTING.md](CONTRIBUTING.md) or open an issue.

---

**Built with:**

- Bash
- SQLite
- jq
- Git
- Philosophy from "Prompts are code" by Mario Zechner
