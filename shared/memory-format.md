## Agent Persistent Memory

Agents build project memory automatically. When a task completes, key context is saved to `.jat/memory/`. When the next agent starts a related task, relevant memories are loaded automatically.

### Storage Design

```
.jat/
├── tasks.db              # Task database (existing)
├── memory.db             # Search index (SQLite, gitignored, rebuilt from .md files)
├── memory.db-wal         # WAL journal (gitignored)
├── memory/               # Memory entries (Markdown, committed to git)
│   ├── 2026-02-08-jat-abc-fix-oauth-timeout.md
│   ├── 2026-02-09-jat-def-add-login-page.md
│   └── 2026-02-10-jat-ghi-refactor-auth-module.md
└── .gitignore            # Ignores *.db, *.db-wal, *.db-shm
```

**Markdown files are the source of truth.** The SQLite index (`memory.db`) is derived and can be rebuilt at any time. Memory files are committed to git so the entire team (human and agent) benefits from accumulated knowledge.

### File Naming Convention

```
{YYYY-MM-DD}-{taskId}-{slug}.md
```

| Component | Source | Example |
|-----------|--------|---------|
| `YYYY-MM-DD` | Task completion date | `2026-02-10` |
| `taskId` | Task ID from JAT | `jat-abc` |
| `slug` | Slugified task title (lowercase, hyphens, max 50 chars) | `fix-oauth-timeout` |

**Slugification rules:**
1. Lowercase the title
2. Replace non-alphanumeric characters with hyphens
3. Collapse consecutive hyphens
4. Trim leading/trailing hyphens
5. Truncate to 50 characters (break at word boundary)

**Examples:**
```
2026-02-10-jat-abc-fix-oauth-timeout.md
2026-02-10-jat-def-add-user-authentication-page.md
2026-02-10-chimaro-x4k-refactor-payment-processing.md
```

### Markdown File Format

Each memory file has YAML frontmatter followed by structured sections.

```markdown
---
task: jat-abc
agent: FairBay
project: chimaro
completed: 2026-02-10T15:30:00Z
files:
  - src/auth/refresh.ts
  - src/config.ts
tags:
  - auth
  - timeout
  - oauth
labels:
  - security
  - backend
priority: 1
type: bug
risk: medium
---

## Summary

- Increased token refresh timeout from 5s to 15s
- Added retry logic for OAuth provider calls that take longer than 10s

## Approach

Investigated the auth timeout by tracing the OAuth flow end-to-end. Found that
the refresh endpoint was timing out because the upstream provider occasionally
takes 8-12 seconds under load. The original 5s timeout was set during initial
development when the provider was faster.

## Decisions

- Increased timeout to 15s rather than adding retry logic. Retries would
  complicate error handling and the provider's slow responses are transient,
  not failures.
- Added a `OAUTH_TIMEOUT` environment variable so the value can be tuned
  per deployment without code changes.

## Key Files

- `src/auth/refresh.ts:45` - timeout value, now reads from env
- `src/config.ts:12` - new OAUTH_TIMEOUT constant with 15s default
- `src/auth/__tests__/refresh.test.ts` - added timeout test cases

## Lessons

- The OAuth provider sometimes takes 8s+ to respond under load
- Always use environment variables for timeout values, not hardcoded constants
- The provider returns 200 even on partial failures - check response body

## Cross-Agent Intel

### Patterns

- Use environment variables for timeout values, not hardcoded constants
- The auth module uses a retry wrapper from `src/lib/retry.ts`

### Gotchas

- The refresh endpoint returns 200 even on partial failures
- `src/auth/types.ts` has a `RefreshResponse` type but the actual response
  includes undocumented fields
```

### Frontmatter Fields

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `task` | string | Yes | Task ID |
| `agent` | string | Yes | Agent name that completed the task |
| `project` | string | Yes | Project name |
| `completed` | ISO datetime | Yes | Task completion timestamp |
| `files` | string[] | Yes | Files modified during the task |
| `tags` | string[] | Yes | Semantic tags (derived from content + labels) |
| `labels` | string[] | No | Task labels from JAT |
| `priority` | integer | No | Task priority (0-4) |
| `type` | string | No | Task type (bug, feature, task, chore) |
| `risk` | string | No | Risk level (low, medium, high) |

**Tags vs Labels:**
- **Tags** are semantic descriptors of what the memory is about (auth, timeout, oauth, database, css)
- **Labels** are the original task labels from JAT (security, backend, frontend, urgent)
- Both are indexed for search. Tags are generated from content; labels are copied from the task.

### Sections

Each section maps to a `section` value in the search index chunks table.

| Section | Required | Purpose | Chunk Section ID |
|---------|----------|---------|------------------|
| `## Summary` | Yes | What was accomplished (bullet points) | `summary` |
| `## Approach` | Yes | How the work was done | `approach` |
| `## Decisions` | Recommended | Key decisions and rationale | `decisions` |
| `## Key Files` | Recommended | Important file locations with line numbers | `key_files` |
| `## Lessons` | Recommended | Non-obvious learnings | `lessons` |
| `## Cross-Agent Intel` | Optional | Patterns and gotchas for other agents | `cross_agent_intel` |

**Section generation source mapping** (during `/jat:complete`):

| Section | Generated From |
|---------|---------------|
| Summary | CompletionBundle.summary |
| Approach | Agent's working signal approach + task description |
| Decisions | Extracted from commit messages and code comments |
| Key Files | CompletionBundle.crossAgentIntel.files + git diff |
| Lessons | CompletionBundle.crossAgentIntel.gotchas |
| Cross-Agent Intel | CompletionBundle.crossAgentIntel.patterns + gotchas |

### Search Index Schema

The search index lives in `.jat/memory.db` and provides two search modes:

1. **BM25 full-text search** via FTS5 - keyword matching with relevance ranking
2. **Vector similarity search** via sqlite-vec - semantic similarity using embeddings

See `lib/memory-schema.sql` for the complete schema.

**Key tables:**

| Table | Purpose |
|-------|---------|
| `chunks` | Text segments (~500 tokens) with optional embeddings |
| `chunks_fts` | FTS5 virtual table for BM25 search |
| `vec_chunks` | sqlite-vec virtual table for vector search (created at runtime) |
| `file_meta` | Per-file metadata for incremental sync |
| `config` | Embedding model and index settings |

**Chunking strategy:**
- Target chunk size: ~500 tokens
- Overlap: ~50 tokens between adjacent chunks
- Chunks respect section boundaries (never span sections)
- Short sections (< 100 tokens) are kept as single chunks
- Frontmatter is not chunked; its fields are stored in `file_meta`

**Incremental sync:**
- `file_meta.file_hash` stores SHA-256 of each .md file
- On re-index, only files with changed hashes are re-processed
- `--force` flag re-indexes everything

### Search Flow

```
Query ("oauth timeout")
       │
       ├──► BM25 search (chunks_fts)
       │    → Top 20 by relevance score
       │
       ├──► Vector search (vec_chunks)
       │    → Top 20 by cosine distance
       │
       └──► Reciprocal Rank Fusion
            → Merge + deduplicate
            → Return top 5 with scores
```

**Search result format:**
```json
{
  "path": "2026-02-08-jat-abc-fix-oauth-timeout.md",
  "taskId": "jat-abc",
  "section": "approach",
  "snippet": "Investigated the auth timeout by tracing...",
  "score": 0.87,
  "startLine": 15,
  "endLine": 22,
  "source": "hybrid"
}
```

### Embedding Providers

Configured in `.jat/memory.db` config table or `~/.config/jat/projects.json`.

| Provider | Model | Dimensions | Cost |
|----------|-------|------------|------|
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens |
| OpenAI | text-embedding-3-large | 3072 | $0.13/1M tokens |
| Gemini | text-embedding-004 | 768 | Free tier available |
| Voyage | voyage-3 | 1024 | $0.06/1M tokens |

**Fallback:** If no embedding provider is configured, vector search is disabled and only BM25 full-text search is used. This still provides useful results for keyword-based queries.

### .gitignore Updates

Add to `.jat/.gitignore`:
```gitignore
# Existing
tasks.db
tasks.db-wal
tasks.db-shm

# Memory search index (rebuilt from .md files)
memory.db
memory.db-wal
memory.db-shm
```

The `memory/` directory is NOT gitignored - memory files are committed to the repository.

### Integration Points

**Write (during `/jat:complete` Step 4.5):**
1. Gather context: task details, approach, git diff, key decisions
2. Agent generates memory .md file directly (no LLM call needed)
3. Write to `.jat/memory/{date}-{taskId}-{slug}.md`
4. Run `jat-memory index` to incrementally update search index

**Read (during `/jat:start` Step 4):**
1. Extract key terms from task title + description
2. Run `jat-memory search` with those terms
3. Display relevant snippets to the agent
4. Agent incorporates context into approach planning

**CLI tools:**
```bash
jat-memory index [--force] [--project path]   # Build/rebuild search index
jat-memory search 'query' [--limit 5]         # Search memory entries
jat-memory stats [--project path]             # Show memory statistics
```
