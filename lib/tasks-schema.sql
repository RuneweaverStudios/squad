-- SQUAD task database schema
-- Lightweight task tracking with 4 clean tables

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 2,
    issue_type TEXT NOT NULL DEFAULT 'task',
    assignee TEXT,
    reserved_files TEXT,
    parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    command TEXT DEFAULT '/squad:start',
    agent_program TEXT,
    model TEXT,
    schedule_cron TEXT,
    next_run_at TEXT,
    due_date TEXT,
    labels_text TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    close_reason TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dependencies (
    issue_id TEXT NOT NULL,
    depends_on_id TEXT NOT NULL,
    type TEXT DEFAULT 'blocks',
    PRIMARY KEY (issue_id, depends_on_id),
    FOREIGN KEY (issue_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS labels (
    issue_id TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (issue_id, label),
    FOREIGN KEY (issue_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_deps_issue ON dependencies(issue_id);
CREATE INDEX IF NOT EXISTS idx_deps_depends ON dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_labels_label ON labels(label);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- FTS5 full-text search index over tasks (porter stemming + unicode)
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
    title, description, labels_text,
    content=tasks,
    content_rowid=rowid,
    tokenize='porter unicode61'
);

-- Sync triggers: tasks table → FTS index
CREATE TRIGGER IF NOT EXISTS tasks_fts_ai AFTER INSERT ON tasks BEGIN
    INSERT INTO tasks_fts(rowid, title, description, labels_text)
    VALUES (new.rowid, new.title, COALESCE(new.description, ''), COALESCE(new.labels_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_bd BEFORE DELETE ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description, labels_text)
    VALUES('delete', old.rowid, old.title, COALESCE(old.description, ''), COALESCE(old.labels_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_bu BEFORE UPDATE OF title, description, labels_text ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description, labels_text)
    VALUES('delete', old.rowid, old.title, COALESCE(old.description, ''), COALESCE(old.labels_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_au AFTER UPDATE OF title, description, labels_text ON tasks BEGIN
    INSERT INTO tasks_fts(rowid, title, description, labels_text)
    VALUES (new.rowid, new.title, COALESCE(new.description, ''), COALESCE(new.labels_text, ''));
END;

-- Sync triggers: labels table → tasks.labels_text → FTS index (cascading)
CREATE TRIGGER IF NOT EXISTS labels_ai_fts AFTER INSERT ON labels BEGIN
    UPDATE tasks SET labels_text = COALESCE(
        (SELECT GROUP_CONCAT(label, ' ') FROM labels WHERE issue_id = NEW.issue_id), ''
    ) WHERE id = NEW.issue_id;
END;

CREATE TRIGGER IF NOT EXISTS labels_ad_fts AFTER DELETE ON labels BEGIN
    UPDATE tasks SET labels_text = COALESCE(
        (SELECT GROUP_CONCAT(label, ' ') FROM labels WHERE issue_id = OLD.issue_id), ''
    ) WHERE id = OLD.issue_id;
END;
