---
{ "status": "fixed", "specs": ["HG-SPEC-002", "HG-SPEC-008", "HG-SPEC-019"] }
---

# HG-ISSUE-140: Internal tool-result summaries render as assistant output

Repro evidence from latest local session `bf58a803-108f-465f-8c84-bf81a5e3b74b` (`Lets Create Plan For Yt`):

- User message `29`: `title, thumbnail, then script, then sounds, then video`.
- Assistant message `30`: `content_len=0`, `thinking_len=3895`, has image/TTS/video tool calls.
- Tool rows `31`-`33`: persisted asset paths.
- Assistant message `34`: visible content is only internal tool-result guidance: `Generated image with generate_image... Do not embed...`, `Generated audio...`, `Generated video...`.
- User message `35`: `now sounds`.
- Assistant message `36`: tool calls only.
- Assistant message `41`: visible content repeats internal audio tool-result guidance four times.

Observed:

- The user's requested title/script/sounds/video plan was not delivered as normal assistant prose.
- Internal tool-result summaries meant for model context rendered as final assistant text.
- The thinking field did not persist inside `content`; it rendered through the existing thinking UI. The visible leak is tool-result context copy, not DB content/thinking column mixing.

Likely cause:

- `compactToolResultForModel()` returns user-instruction strings like `The UI displays it in a tool card. Do not embed...`.
- After media tools complete, the follow-up model turn can parrot those compact tool-result strings as its final text.
- No guard suppresses exact compact tool-result boilerplate from final assistant output or forces a useful post-tool summary.

Fix:

- Added line-level guard for internal media tool-result boilerplate before text SSE emission and assistant persistence.
- Exact/prefix boilerplate is suppressed; normal text still streams.
- Added regression for a tool-use turn where MiniMax parrots `compactToolResultForModel()` output.
