-- Add durable MiniMax async long TTS task state.
CREATE TABLE IF NOT EXISTS async_tts_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    provider_task_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending',
            'running',
            'succeeded',
            'failed',
            'timeout',
            'cancelled'
        )
    ),
    text_summary TEXT NOT NULL,
    voice_id TEXT,
    file_id TEXT,
    asset_id TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_async_tts_tasks_session ON async_tts_tasks (session_id, updated_at DESC);
