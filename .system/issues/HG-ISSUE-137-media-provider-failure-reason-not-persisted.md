---
{ "status": "fixed", "specs": ["HG-SPEC-019", "HG-SPEC-006", "HG-SPEC-021"] }
---

Repro: localhost Create Video failed for prompt `fat mermaid singing in the moonlight`.
Log had provider reason: `Video query failed: output new_sensitive`.
UI, `messages`, and `video_tasks.error` only stored `Couldn't generate the video. Try a shorter, clearer prompt.`
`video_tasks.provider_task_id` stored local `direct_*`, not MiniMax task id.
`tool_input_history` stored failed status and input, not provider failure stage/reason.
Related: HG-ISSUE-132 fixed video flow. HG-ISSUE-136 quota unknown is not the observed cause.

Cause: `safeToolResultForUser()` logs provider detail then replaces it with kid-safe text before task/history/message persistence. This affects image, sync TTS, async TTS, music, lyrics, image analysis, and video. Async media task rows do not keep safe diagnostic fields for provider stage, provider status code, provider status message, MiniMax task id, or file id.

Experiment 2026-06-12: direct MiniMax retry with the same video prompt returned create success and query `Success` for task `408410934861902`. So `output new_sensitive` is likely generated-output moderation and nondeterministic, not a deterministic prompt validation error.

Fix: keep kid-safe UI text, but persist sanitized diagnostic metadata for failed media tools. Store actual provider task/file identifiers where available. Never persist raw asset bytes, base64/data URLs, provider download URLs, keys, secrets, or full provider bodies.

Proof: unit tests cover all media sanitizer diagnostics, migration columns, provider diagnostic history rows, and failed Create Video `output new_sensitive` persistence without exposing provider detail to SSE/messages.
