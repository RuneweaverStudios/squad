CREATE TABLE IF NOT EXISTS ingested_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_hash TEXT,
  task_id TEXT,
  title TEXT,
  origin_adapter_type TEXT,
  origin_channel_id TEXT,
  origin_sender_id TEXT,
  origin_thread_id TEXT,
  origin_metadata TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, item_id)
);

CREATE TABLE IF NOT EXISTS adapter_state (
  source_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poll_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  poll_at TEXT NOT NULL DEFAULT (datetime('now')),
  items_found INTEGER DEFAULT 0,
  items_new INTEGER DEFAULT 0,
  error TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS thread_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  parent_item_id TEXT NOT NULL,
  parent_ts TEXT NOT NULL,
  task_id TEXT NOT NULL,
  last_reply_ts TEXT,
  reply_count INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, parent_item_id)
);
