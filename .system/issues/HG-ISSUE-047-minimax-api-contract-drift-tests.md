---
{
  "status": "fixed",
  "specs": ["HG-SPEC-005", "HG-SPEC-008", "HG-SPEC-011", "HG-SPEC-012"],
}
---

# HG-ISSUE-047: MiniMax API contract drift lacks tests

Repro:

- MiniMax docs crawl 2026-05-11 changed Anthropic auth docs to `X-Api-Key`, `max_tokens` max to `204800`, TTS formats/subtitles/pronunciation, async TTS `file_id` char cap, and removed TTS/image TPM docs.
- Live quota endpoint returned model names: `MiniMax-M*`, `speech-hd`, `music-2.6`, `music-cover`, `lyrics_generation`, `image-01`, `coding-plan-vlm`, `coding-plan-search`.
- `src/agent.ts` streamed `thinking_delta` but dropped `signature_delta`; `toAnthropicPayload()` did not replay `thinking` blocks with signatures before `tool_use`.
- `src/tools.ts` checked `base_resp.status_code` for music/lyrics/VLM, not image/TTS.
- `src/tools.ts` and schema allowed TTS `volume=0`; docs require `vol` `(0,10]`.
- `src/db.ts`/`src/server.ts` counted speech quota per request; MiniMax quota is chars/day.
- `logs/dev.log`: `{"level":"warn","msg":"asset save failed","time":"2026-05-11T19:20:08.779Z","service":"hallucygenie","toolName":"generate_image","error":"Error: image download failed: 404"}`

Cause:

- MiniMax contract facts changed after tests were written.
- Tests covered generic thinking stream and per-call quota, but not signature replay, HTTP-200 `base_resp` failures for image/TTS, `vol` lower bound, or speech char quota.

Fix:

- Captured `signature_delta`; replay `thinking` + `signature` before `tool_use`.
- Image/TTS now fail on `base_resp.status_code != 0`.
- TTS `volume=0` omitted; schema uses `exclusiveMinimum: 0`.
- Speech quota now consumes/release text char count.
- Regression tests added.
- Cross-ref HG-ISSUE-004, HG-ISSUE-011, HG-ISSUE-014, HG-ISSUE-018.
