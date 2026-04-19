-- Store generated asset metadata (files stored on disk at data/assets/{sessionId}/)
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('image', 'audio', 'music')),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  prompt      TEXT,
  tool_name   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_session ON assets(session_id, created_at DESC);
