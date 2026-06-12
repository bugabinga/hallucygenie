ALTER TABLE tool_input_history
ADD COLUMN provider_stage TEXT;

ALTER TABLE tool_input_history
ADD COLUMN provider_status_code INTEGER;

ALTER TABLE tool_input_history
ADD COLUMN provider_status_msg TEXT;

ALTER TABLE tool_input_history
ADD COLUMN provider_task_id TEXT;

ALTER TABLE tool_input_history
ADD COLUMN provider_file_id TEXT;

ALTER TABLE video_tasks
ADD COLUMN provider_stage TEXT;

ALTER TABLE video_tasks
ADD COLUMN provider_status_code INTEGER;

ALTER TABLE video_tasks
ADD COLUMN provider_status_msg TEXT;

ALTER TABLE video_tasks
ADD COLUMN provider_file_id TEXT;

ALTER TABLE async_tts_tasks
ADD COLUMN provider_stage TEXT;

ALTER TABLE async_tts_tasks
ADD COLUMN provider_status_code INTEGER;

ALTER TABLE async_tts_tasks
ADD COLUMN provider_status_msg TEXT;

ALTER TABLE async_tts_tasks
ADD COLUMN provider_file_id TEXT;
