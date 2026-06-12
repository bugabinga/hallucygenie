# MiniMax API Research — 2026-04-19

Crawled from `platform.minimax.io/docs/token-plan/intro`, `platform.minimax.io/docs/token-plan/minimax-cli`, `platform.minimax.io/docs/api-reference/api-overview`, `platform.minimax.io/docs/guides/models-intro`.
Live tested with a real Plus-Highspeed Token Plan API key.

---

## 2026-05-12 docs addendum

Fetched current docs from `https://platform.minimax.io/docs/llms.txt` into `~/.pi/research/pages/`.
Cross-checked `MiniMax-AI/MiniMax-Coding-Plan-MCP` source.

Changed/clarified facts:

- Token Plan docs now say Standard Plus has `speech-2.8` 4,000 chars/day and `image-01` 50 images/day; Plus-Highspeed remains `speech-2.8` 9,000 chars/day and `image-01` 100 images/day.
- Anthropic OpenAPI enum currently lists `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.1`; models/rate-limit pages still mention legacy/highspeed variants.
- TTS enum includes `speech-01-hd` and `speech-01-turbo`; HallucyGenie plan availability for those is untested.
- TTS `voice_setting` now includes `text_normalization` and `latex_read` booleans.
- Public Token Plan MCP docs still describe `understand_image(prompt, image_url)` and support HTTP/HTTPS URLs/local files.
- Direct VLM endpoint `/v1/coding_plan/vlm` is not exposed as a stable OpenAPI page in current docs.
- Official Coding Plan MCP implementation converts HTTP/HTTPS URLs and local files to `data:image/{jpeg|png|webp};base64,...` before posting `{ prompt, image_url }` to `/v1/coding_plan/vlm`.
- Therefore the old statement “Vision works with raw public URL in `image_url`” is incomplete. Direct VLM likely expects a data URL; raw public URLs can fail with `2013 invalid image URL`.

Project impact:

- `src/tools.ts analyzeImage()` should download/validate image input, convert to a data URL in memory, call `/v1/coding_plan/vlm`, and never persist/log raw bytes.
- `scripts/minimax-test.ts` now includes a VLM smoke using a tiny downloaded image converted to data URL.
- Create UI can add Analyze Image after spec approval; history should store URL/ref + prompt only, not base64.

---

## Auth Header — CRITICAL FINDING

**Live test results:**

| Endpoint                      | `x-api-key`                     | `Authorization: Bearer` |
| ----------------------------- | ------------------------------- | ----------------------- |
| `POST /anthropic/v1/messages` | ✅ Works                        | ✅ Works                |
| `POST /v1/t2a_v2`             | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |
| `POST /v1/image_generation`   | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |
| `POST /v1/music_generation`   | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |
| `POST /v1/coding_plan/search` | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |
| `POST /v1/coding_plan/vlm`    | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |
| `GET /v1/token_plan/remains`  | ❌ HTTP 200 + `1004 login fail` | ✅ Works                |

**Conclusion:** Only the Anthropic-compatible chat endpoint (`/anthropic/v1/messages`) accepts both auth styles. Every other endpoint **requires** `Authorization: Bearer`. Using `x-api-key` returns HTTP 200 with a deceptive `{"base_resp":{"status_code":1004,"status_msg":"login fail"}}` JSON body — no HTTP error, silent failure.

All code in `tools.ts` was updated to use `Authorization: Bearer`.

---

## Current Plan: Plus-Highspeed

Quota API (`GET /v1/token_plan/remains`) response:

| Quota bucket | Model name   | Limit             | Used |
| ------------ | ------------ | ----------------- | ---- |
| Chat         | `MiniMax-M*` | 4,500 req / 5hrs  | —    |
| Speech       | `speech-hd`  | 9,000 chars / day | —    |
| Image        | `image-01`   | 100 / day         | —    |
| Music        | `music-2.6`  | 100 / day         | —    |

---

## TTS Model Availability

Tested all models from the docs against Plus-Highspeed:

| Model              | Live Test Result        | Notes                    |
| ------------------ | ----------------------- | ------------------------ |
| `speech-2.8-hd`    | ✅ Works                | Latest HD model          |
| `speech-2.8-turbo` | ❌ `2061 not supported` | Turbo models not in plan |
| `speech-2.6-hd`    | ❌ `2061 not supported` | Older HD, not in plan    |
| `speech-2.6-turbo` | ❌ `2061 not supported` |                          |
| `speech-02-hd`     | ❌ `2061 not supported` |                          |
| `speech-02-turbo`  | ❌ `2061 not supported` |                          |

**Only `speech-2.8-hd` works on Plus-Highspeed.** Code was already using `speech-2.8-hd` — correct.

---

## Music Model Availability

| Model       | Live Test Result      | Notes                             |
| ----------- | --------------------- | --------------------------------- |
| `music-2.6` | ✅ Works              | Has quota on Plus-Highspeed       |
| `music-2.5` | ❌ No quota allocated | `current_interval_total_count: 0` |

Code uses `music-2.6` — correct.

---

## All Endpoints — Code vs Docs

### Chat ✅ CORRECT

```
POST https://api.minimax.io/anthropic/v1/messages
Auth: Authorization: Bearer (also accepts x-api-key)
Model: MiniMax-M2.7-highspeed
Context window: 204,800 tokens
Output speed: ~100 tps (highspeed) vs ~60 tps (standard)
```

Code in `agent.ts`: ✅ Correct base, correct model, correct auth (uses Bearer).

### TTS ✅ FIXED (was broken, now fixed)

```
POST https://api.minimax.io/v1/t2a_v2
Auth: Authorization: Bearer ONLY (x-api-key silently fails)
Model: speech-2.8-hd
Max chars per request: 10,000 (sync endpoint)
Returns: hex MP3 (convert: Buffer.from(hex, "hex").toString("base64") → data URL)
Languages: 40
```

Code in `tools.ts textToSpeech()`: ✅ Fixed auth, correct model.

### Image ✅ CORRECT

```
POST https://api.minimax.io/v1/image_generation
Auth: Authorization: Bearer ONLY
Model: image-01
Supports: text-to-image, image-to-image
```

Code in `tools.ts generateImage()`: ✅ Fixed auth, correct model.

### Music ✅ CORRECT

```
POST https://api.minimax.io/v1/music_generation
Auth: Authorization: Bearer ONLY
Model: music-2.6
Instrumental: is_instrumental=true, prompt required, omit lyrics
Non-instrumental: is_instrumental=false, lyrics required
Returns: hex MP3 by default
```

Code in `tools.ts generateMusic()`: ✅ Fixed auth, correct model, correct `is_instrumental` parameter.

### Web Search ✅ WORKS

```
POST https://api.minimax.io/v1/coding_plan/search
Auth: Authorization: Bearer ONLY
Returns: { organic: [{ title, link, snippet }] }
```

Code in `tools.ts webSearch()`: ✅ Fixed auth, correct endpoint.

### Vision ⚠️ DIRECT CONTRACT DRIFT

```
POST https://api.minimax.io/v1/coding_plan/vlm
Auth: Authorization: Bearer ONLY
Params: { prompt, image_url }
Returns: { content: "..." }
```

Direct endpoint docs are not stable. Current MCP source posts `image_url` as a data URL. Raw public URLs can fail with `2013 invalid image URL`.

Code in `tools.ts analyzeImage()`: ❌ correct auth and endpoint, stale raw URL payload.

---

## Quota Tracking — Design Limitation

`db.ts` tracks speech usage as **count of calls** (increments by 1 per TTS invocation), not character count. So:

- 9,000 char/day limit → enforced as max 9,000 TTS calls/day
- One 500-char call uses 1 of the counter
- One 9,000-char call uses 1 of the counter

This is a known limitation — quota enforcement is per-call, not per-character.

---

## Deprecated/Unavailable Models (from docs)

These appear in documentation but are **not available** on Plus-Highspeed:

- `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo` — all return 2061 unsupported
- `music-2.5` — no quota allocated
- Video generation (`MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02`) — no quota allocated on Plus-Highspeed

---

## API Base URL — CORRECT ✅

```
https://api.minimax.io
```

Confirmed correct for all endpoints. Used in `tools.ts`, `agent.ts`, and `server.ts`.

---

## File Management API

```
POST https://api.minimax.io/v1/files/upload
GET  https://api.minimax.io/v1/files/list
GET  https://api.minimax.io/v1/files/{file_id}
GET  https://api.minimax.io/v1/files/{file_id}/content
DELETE https://api.minimax.io/v1/files/{file_id}
```

Supported: `pdf`, `docx`, `txt`, `jsonl`, `mp3`, `m4a`, `wav`.
Total capacity: 100GB. Single file: 512MB.
**Not currently used by HallucyGenie.**

---

## Video Generation API (Not Used)

Async workflow:

1. `POST /v1/video_generation` → returns `task_id`
2. `GET /v1/video_generation?task_id=...` → poll until `status: success`
3. `GET /v1/files/{file_id}` → download video

Plus-Highspeed has no video quota (`current_interval_total_count: 0`).

---

## MCP Tools (Not Used)

MiniMax provides official MCP server (Python and JS):

- https://github.com/MiniMax-AI/MiniMax-MCP
- https://github.com/MiniMax-AI/MiniMax-MCP-JS

These handle the same capabilities as our `tools.ts` (speech, voice cloning, video, music) via MCP protocol. Could replace direct API calls in future.

---

## Summary of Fixes Applied

| # | Issue                                             | Severity | Fix                                              |
| - | ------------------------------------------------- | -------- | ------------------------------------------------ |
| 1 | All tools used `x-api-key` auth (failed silently) | CRITICAL | Changed to `Authorization: Bearer` in `tools.ts` |
| 2 | TTS model already `speech-2.8-hd`                 | —        | Already correct, no change needed                |
| 3 | AGENTS.md had wrong auth note                     | LOW      | Updated auth header docs                         |
| 4 | AGENTS.md quotas didn't note per-call limitation  | LOW      | Added tracking limitation note                   |
| 5 | AGENTS.md missing unsupported models              | LOW      | Added model availability table                   |

---

## How to Re-Run This Research

```bash
# Check current API key is set
echo $MINIMAX_API_KEY

# Test auth header formats for any endpoint
curl -s -X POST "https://api.minimax.io/v1/t2a_v2" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MINIMAX_API_KEY" \
  -d '{"model":"speech-2.8-hd","text":"test","voice_setting":{"voice_id":"English_expressive_narrator"}}'

curl -s -X POST "https://api.minimax.io/v1/t2a_v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -d '{"model":"speech-2.8-hd","text":"test","voice_setting":{"voice_id":"English_expressive_narrator"}}'

# Check quota
curl -s "https://api.minimax.io/v1/token_plan/remains" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "User-Agent: hallucygenie/1.0"
```
