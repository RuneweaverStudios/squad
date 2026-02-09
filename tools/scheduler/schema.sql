CREATE TABLE IF NOT EXISTS scheduled_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  source_id TEXT,
  project TEXT NOT NULL,
  command TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('once', 'delay', 'time', 'cron')),
  schedule_value TEXT NOT NULL,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'paused', 'completed', 'cancelled', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_status ON scheduled_actions(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_next_run ON scheduled_actions(next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_project ON scheduled_actions(project);
