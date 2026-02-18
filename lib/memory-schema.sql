-- SQUAD Agent Memory: Search Index Schema
-- Stored in: .squad/memory.db (per project, alongside tasks.db)
-- Rebuilt from .squad/memory/*.md files (Markdown is source of truth)
--
-- This database provides fast search over memory entries. The Markdown
-- files in .squad/memory/ are the canonical source; this index can be
-- rebuilt at any time with: squad-memory index --force

-- ─────────────────────────────────────────────────────────────────────
-- Chunks: text segments from memory files, with optional embeddings
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,              -- relative to .squad/memory/ (e.g. "2026-02-10-squad-abc-auth-timeout.md")
    task_id TEXT NOT NULL,           -- from frontmatter: task field
    section TEXT NOT NULL,           -- heading name: "summary", "approach", "decisions", "key_files", "lessons", "cross_agent_intel"
    start_line INTEGER NOT NULL,     -- 1-indexed line in source .md file
    end_line INTEGER NOT NULL,
    content TEXT NOT NULL,           -- chunk text (target ~500 tokens, with overlap)
    embedding BLOB,                 -- float32 vector from embedding provider (NULL until indexed)
    token_count INTEGER DEFAULT 0,  -- approximate token count of content
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
CREATE INDEX IF NOT EXISTS idx_chunks_task ON chunks(task_id);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(section);

-- ─────────────────────────────────────────────────────────────────────
-- FTS5: BM25 full-text search over chunk content
-- ─────────────────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    task_id UNINDEXED,
    section,
    content=chunks,
    content_rowid=id,
    tokenize='porter unicode61'
);

-- Keep FTS in sync with chunks table via triggers
CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, content, task_id, section)
    VALUES (new.id, new.content, new.task_id, new.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, task_id, section)
    VALUES ('delete', old.id, old.content, old.task_id, old.section);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, task_id, section)
    VALUES ('delete', old.id, old.content, old.task_id, old.section);
    INSERT INTO chunks_fts(rowid, content, task_id, section)
    VALUES (new.id, new.content, new.task_id, new.section);
END;

-- ─────────────────────────────────────────────────────────────────────
-- Vector search: sqlite-vec virtual table (created at runtime)
-- ─────────────────────────────────────────────────────────────────────
--
-- The vec_chunks table dimension depends on the embedding model:
--   OpenAI text-embedding-3-small: 1536
--   OpenAI text-embedding-3-large: 3072
--   Gemini text-embedding-004:     768
--   Voyage voyage-3:               1024
--
-- Created dynamically by the indexer after reading config:
--
--   CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
--       chunk_id INTEGER PRIMARY KEY,
--       embedding float[{DIMENSION}]
--   );
--
-- The indexer inserts rows that reference chunks.id:
--   INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?);
--
-- Query with cosine distance:
--   SELECT chunk_id, distance
--   FROM vec_chunks
--   WHERE embedding MATCH ?
--   ORDER BY distance
--   LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────
-- Metadata: per-file tracking for incremental sync
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS file_meta (
    path TEXT PRIMARY KEY,           -- relative to .squad/memory/
    task_id TEXT NOT NULL,
    project TEXT NOT NULL,
    agent TEXT,
    completed_at TEXT,               -- from frontmatter
    file_hash TEXT NOT NULL,         -- SHA-256 of file content (for change detection)
    chunk_count INTEGER DEFAULT 0,
    indexed_at TEXT NOT NULL,
    -- Denormalized frontmatter fields for fast filtering
    tags TEXT DEFAULT '[]',          -- JSON array: ["auth", "timeout"]
    labels TEXT DEFAULT '[]',        -- JSON array: ["security", "backend"]
    files_touched TEXT DEFAULT '[]', -- JSON array: ["src/auth/refresh.ts"]
    priority INTEGER,
    issue_type TEXT,
    risk TEXT                        -- "low", "medium", "high"
);

CREATE INDEX IF NOT EXISTS idx_meta_task ON file_meta(task_id);
CREATE INDEX IF NOT EXISTS idx_meta_project ON file_meta(project);
CREATE INDEX IF NOT EXISTS idx_meta_completed ON file_meta(completed_at);

-- ─────────────────────────────────────────────────────────────────────
-- Config: embedding model and index settings
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default config values (inserted by indexer on first run):
--   embedding_provider: "openai" | "gemini" | "voyage"
--   embedding_model:    model ID string
--   embedding_dimension: integer (e.g. 1536)
--   chunk_target_tokens: 500
--   chunk_overlap_tokens: 50
