-- Agent Mail SQLite Schema
-- Minimal coordination system for multi-agent workflows
-- Based on mcp_agent_mail models but simplified for bash tools

-- Projects: Each git repository or logical grouping
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,           -- URL-safe identifier
    human_key TEXT NOT NULL,             -- Absolute path or human name
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_human_key ON projects(human_key);

-- Agents: Coding assistants working in projects
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,                  -- Adjective+Noun (e.g., "BlueLake", "GreenCastle")
    program TEXT NOT NULL,               -- e.g., "claude-code", "cursor", "aider"
    model TEXT NOT NULL,                 -- e.g., "sonnet-4.5", "gpt-4"
    task_description TEXT DEFAULT '',
    inception_ts TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_ts TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (project_id) REFERENCES projects(id),
    UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active_ts);

-- Messages: Communication between agents
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,          -- Agent who sent the message
    thread_id TEXT,                      -- Group related messages (use SQUAD task ID!)
    subject TEXT NOT NULL,
    body_md TEXT NOT NULL,               -- Markdown content
    importance TEXT NOT NULL DEFAULT 'normal', -- normal | high | urgent
    ack_required INTEGER DEFAULT 0,      -- Boolean: requires acknowledgment
    created_ts TEXT NOT NULL DEFAULT (datetime('now')),
    expires_ts TEXT DEFAULT NULL,        -- Optional expiry time for broadcasts (NULL = never expires)

    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (sender_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_ts ON messages(created_ts);
CREATE INDEX IF NOT EXISTS idx_messages_expires_ts ON messages(expires_ts);

-- Full-text search on message bodies
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    subject,
    body_md,
    content=messages,
    content_rowid=id
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, subject, body_md)
    VALUES (new.id, new.subject, new.body_md);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.id;
    INSERT INTO messages_fts(rowid, subject, body_md)
    VALUES (new.id, new.subject, new.body_md);
END;

-- Message Recipients: Who receives each message
CREATE TABLE IF NOT EXISTS message_recipients (
    message_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'to',     -- to | cc
    read_ts TEXT,                        -- When message was read
    ack_ts TEXT,                         -- When message was acknowledged

    PRIMARY KEY (message_id, agent_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_recipients_agent_id ON message_recipients(agent_id);
CREATE INDEX IF NOT EXISTS idx_recipients_read_ts ON message_recipients(read_ts);

-- Views for common queries

-- Unread messages per agent (excluding expired broadcasts)
CREATE VIEW IF NOT EXISTS unread_messages AS
SELECT
    mr.agent_id,
    a.name AS agent_name,
    m.*
FROM message_recipients mr
JOIN messages m ON mr.message_id = m.id
JOIN agents a ON mr.agent_id = a.id
WHERE mr.read_ts IS NULL
  AND (m.expires_ts IS NULL OR datetime('now') < datetime(m.expires_ts))
ORDER BY m.created_ts DESC;

-- Messages requiring acknowledgment (excluding expired broadcasts)
CREATE VIEW IF NOT EXISTS pending_acks AS
SELECT
    mr.agent_id,
    a.name AS agent_name,
    m.*
FROM message_recipients mr
JOIN messages m ON mr.message_id = m.id
JOIN agents a ON mr.agent_id = a.id
WHERE m.ack_required = 1
  AND mr.ack_ts IS NULL
  AND (m.expires_ts IS NULL OR datetime('now') < datetime(m.expires_ts))
ORDER BY m.created_ts DESC;
