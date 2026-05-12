---
{ "status": "fixed", "specs": ["HG-SPEC-006", "HG-SPEC-011", "HG-SPEC-012"] }
---

# HG-ISSUE-049: Create actions replay internal tool prompts and burn quota

Repro:

- `just dev`, `just dev-chrome`.
- In Create modal, run real MiniMax tools:
  - Image: `tiny cute neon slime mascot sticker, simple icon`, `1:1`.
  - Voice: `Level up!`.
  - Music: `8-bit victory jingle, upbeat, 10 seconds`, empty lyrics.
  - Lyrics: `kid-safe pixel racing chorus` via `Write lyrics for me`.
  - Search: `Minecraft latest update official`.
- Reload chat history.

Observed:

- Chat transcript shows internal user prompts:
  - `Use generate_image with prompt: ...`
  - `Use text_to_speech with text: ...`
  - `Use generate_music with prompt: ...`
  - `Use generate_lyrics with prompt: ...`
- Search turn caused agent thinking: user wants image + TTS + music + lyrics + search simultaneously.
- App re-ran prior image/voice/music/lyrics tools during search turn.
- Extra assets created. Quota burned again.
- `tool_input_history` recorded duplicate media rows with `origin=agent`.
- Dev log ended with MiniMax 400:
  `invalid params, tool result's tool id(call_function_yqx7y276bjs3_5) not found (2013)`.

Cause:

- Create modal sends implementation commands into normal chat history/model context.
- Later turns treat old Create commands as active user intent.
- Internal tool prompts leak to kid UI and durable DB history.

Fix:

- Create actions must execute deterministic server tool endpoints or isolated tool-intent messages not replayed as user chat.
- Persist compact kid-facing summaries only.
- Exclude internal `Use generate_*` prompts from visible chat and future model context.
- Preserve Create-origin in `tool_input_history` for Create-triggered tools.
- Add live E2E regression: image → voice → music → lyrics → search must run only search on final turn.

Resolution:

- `POST /api/chat` detects explicit Create directives before saving user chat or loading model context.
- Create-origin tools execute directly, record create history, and persist only compact assistant results.
- Regression tests cover direct execution, no user prompt persistence, no duplicate quota burn, and sanitized replay.
