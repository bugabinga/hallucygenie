---
{ "status": "open", "specs": ["HG-SPEC-005", "HG-SPEC-012"] }
---

# HG-ISSUE-081: Write lyrics draft lost after success

Repro:

- Open Create → Music.
- Enter prompt.
- Click Write lyrics for me.
- Let lyrics fill textarea.
- Reload before editing/submitting music.

Observed:

- Create draft may be cleared after successful `generate_lyrics` tool result.
- Filled lyrics are not persisted immediately after textarea mutation.

Expected:

- Generated lyrics remain in Create draft after reload/crash.
- Music can be tweaked before spending music quota.

Cause:

- `finishStreaming()` clears Create draft after any successful Create tool result.
- Lyrics helper fills `#music-lyrics` via callback but does not persist draft after fill.

Fix:

- Treat `generate_lyrics` helper as draft-producing, not draft-clearing.
- Persist Create draft after setting generated lyrics.
- Add reload test for Write lyrics flow.
