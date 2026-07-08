CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY, -- noqa: RF04
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
