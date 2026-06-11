---
{ "status": "fixed", "specs": ["HG-SPEC-019"] }
---

Repro: `bun scripts/verify-new-specs.ts` fails HG-SPEC-019 checks.

Missing:
- Create Video tab/panel.
- Direct `generate_video` create path.
- MiniMax `/v1/video_generation`, `/v1/query/video_generation`, and file retrieve/download wiring.
- Durable video task state for reload survival.
- `video` asset type plus native video preview/download rendering.

Already present:
- Generic DB guard rejects `data:image|audio|video` in message/profile text.
- Live provider proof 2026-06-11: `POST /v1/video_generation` accepted `MiniMax-Hailuo-02`; query reached `Success`; file retrieve returned `output.mp4`, `purpose=video_generation`, provider `bytes: 0`, working download URL; sampled download returned HTTP 206 `video/mp4`.
- Live quota proof 2026-06-11: `/v1/token_plan/remains` reported `video total=0 used=0` before/after while video generation still succeeded. Do not use this endpoint as authoritative video availability.

Cause: video spec exists; implementation has no video flow. Existing `video` references are YouTube/search text and markdown sanitization only.

Fix: implemented kid-facing Video create flow, MiniMax create/query/retrieve/download path, durable local video task state, video asset save with prompt/tool/model/params/mime/size, chat result card from `/asset/{id}`, native Assets preview/download, failure/timeout states, and no raw video bytes/provider URLs in chat history.
