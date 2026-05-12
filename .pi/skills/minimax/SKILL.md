---
name: minimax
description: MiniMax API integration for HallucyGenie. Use when working with MiniMax APIs (chat, TTS, image, music, web search, vision, video).
---

# MiniMax API — HallucyGenie

Current docs crawl: 2026-05-12 from `https://platform.minimax.io/docs/llms.txt` into `~/.pi/research/pages/`. Cross-checked `MiniMax-AI/MiniMax-Coding-Plan-MCP` source via `git_clone_safe`.

## Base URLs

- Global API: `https://api.minimax.io`
- Anthropic SDK base: `https://api.minimax.io/anthropic` → raw endpoint `POST /anthropic/v1/messages`
- OpenAI SDK base: `https://api.minimax.io/v1`
- TTS low-TTFA alt: `https://api-uw.minimax.io/v1/t2a_v2`
- China docs mention `https://api.minimaxi.com` for CN users.

## Authentication

- Use `Authorization: Bearer <key>` for all endpoints.
- CRITICAL: `/anthropic/v1/messages` docs now specify `X-Api-Key`; earlier project testing found both `Authorization: Bearer` and `x-api-key` accepted in practice.
- All other endpoints (TTS, image, music, web search, VLM, video, file mgmt) **ONLY** accept `Authorization: Bearer`.
- Using `x-api-key` on other endpoints returns `{"base_resp":{"status_code":1004}}`.
- Token Plan API keys are separate from pay-as-you-go keys.

## Text / Chat

### Anthropic-compatible chat

- `POST /anthropic/v1/messages`
- Models: `MiniMax-M2.7-highspeed`, `MiniMax-M2.7`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.1-highspeed`, `MiniMax-M2.1`, `MiniMax-M2`. Current Anthropic OpenAPI enum lists `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.1`; models/rate-limit pages still mention legacy/highspeed variants.
- Context window: 204,800 tokens. Max token count means input + output.
- `max_tokens` request max is now documented as 204,800 tokens.
- Highspeed output: ~100 tps. Standard: ~60 tps.
- Supported params: `model`, `messages`, `max_tokens`, `stream`, `system`, `temperature`, `tool_choice`, `tools`, `top_p`, `metadata`, `thinking`.
- Ignored params: `top_k`, `stop_sequences`, `service_tier`, `mcp_servers`, `context_management`, `container`.
- Message blocks supported: `text`, `tool_use`, `tool_result`, `thinking`.
- Message blocks NOT supported: `image`, `document`.
- Thinking: response uses Anthropic `thinking` content blocks; no tag parsing needed.
- Tool use critical: for multi-turn tool calls, append the full assistant response content back into history, including `thinking` blocks + `signature` + `tool_use`. Dropping thinking/signature can break reasoning continuity.

### OpenAI-compatible chat

- `POST /v1/chat/completions`
- Base for SDK: `https://api.minimax.io/v1`
- Supports M2.7/M2.5/M2.1/M2 models.

### Model list endpoints

- `GET /anthropic/v1/models`
- `GET /anthropic/v1/models/{model_id}`
- `GET /v1/models`
- `GET /v1/models/{model}`

## TTS / Speech

### Sync TTS

- `POST /v1/t2a_v2` — synchronous, up to **10,000 chars/request**.
- Model for HallucyGenie Plus-Highspeed: `speech-2.8-hd`.
- Output: `output_format: "hex"` by default. Convert with `Buffer.from(hex, "hex").toString("base64")` → data URL.
- Text >3,000 chars: streaming recommended.
- Pause markers: `<#1.5#>` range `[0.01, 99.99]`, between speakable segments, no consecutive pauses.
- Inline pronunciation: wrap pinyin tone numbers or IPA in half-width parentheses, e.g. `(he2)` or `(lɪv)`.
- Speech-2.8 interjection tags: `(laughs)`, `(chuckle)`, `(coughs)`, `(clear-throat)`, `(groans)`, `(breath)`, `(pant)`, `(inhale)`, `(exhale)`, `(gasps)`, `(sniffs)`, `(sighs)`, `(snorts)`, `(burps)`, `(lip-smacking)`, `(humming)`, `(hissing)`, `(emm)`, `(sneezes)`.
- `voice_setting`: `voice_id`, `speed` `[0.5,2]`, `vol` `(0,10]`, `pitch` `[-12,12]`, `emotion`, plus newer booleans `text_normalization` and `latex_read`.
- `audio_setting`: `sample_rate` `8000|16000|22050|24000|32000|44100`, `bitrate` `32000|64000|128000|256000`, `format` `mp3|pcm|flac|wav|pcmu_raw|pcmu_wav|opus`, `channel` `1|2`, `force_cbr` for streamed MP3.
- `voice_modify`: `pitch/intensity/timbre` `[-100,100]`, `sound_effects`: `spacious_echo|auditorium_echo|lofi_telephone|robotic`.
- `language_boost`: 40 language values or `auto`.
- `subtitle_enable`: returns `subtitle_file` URL.
- `subtitle_type`: `sentence` (default), `word`, `word_streaming` (only valid with `stream=true`).
- System voices: docs list `English_expressive_narrator` and many others; latest list also via `GET /v1/voice/get`.

### Async long TTS

- `POST /v1/t2a_async_v2` — create task, up to **1,000,000 chars/request**.
- `file_id` text-file input is now documented up to **1,000,000 chars**; supported file formats: `txt`, `zip`.
- Async `audio_setting.format`: `mp3|pcm|flac|wav|pcmu_raw|pcmu_wav|opus`; `voice_modify` supports `mp3|wav|flac` only.
- `GET /v1/query/t2a_async_query_v2` — query task → get `file_id` → use File API retrieve/download.
- Returned audio URL valid 9 hours (32,400 seconds).

### Voice APIs

- Upload clone audio: `POST /v1/files/upload` for `purpose=voice_clone` (per voice clone docs) then clone endpoint.
- Voice clone: `POST /v1/voice_clone`; temp voice must be used within 168 hours (7 days) to keep permanently.
- Voice design: `POST /v1/voice_design`; generated voice also temp until first use.
- Voice management: `POST /v1/get_voice`, `POST /v1/delete_voice`.

### Plan model availability (tested 2026-04-19)

| Model              | Status         | Notes                                                                                    |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| `speech-2.8-hd`    | ✅ Works       | Latest HD TTS                                                                            |
| `speech-2.8-turbo` | ❌ Unsupported | Plan only has `speech-hd` quota                                                          |
| `speech-2.6-hd`    | ❌ Unsupported | Docs say Token Plan TTS HD includes HD models, but HallucyGenie key returned unsupported |
| `speech-2.6-turbo` | ❌ Unsupported |                                                                                          |
| `speech-02-hd`     | ❌ Unsupported |                                                                                          |
| `speech-02-turbo`  | ❌ Unsupported |                                                                                          |

Unsupported TTS models returned `{"base_resp":{"status_code":2061,"status_msg":"your current token plan not support model"}}` in project testing.

## Image Generation

- `POST /v1/image_generation`
- Text-to-image model: `image-01`.
- Image-to-image docs enum includes `image-01` and `image-01-live`; models overview only lists `image-01`.
- Prompt max length: 1,500 chars.
- Aspect ratios: `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9`.
- Custom `width` + `height`: each `[512,2048]`, divisible by 8. If `aspect_ratio` is present, it takes priority.
- `response_format`: `url` (default, expires 24h) or `base64`.
- `n`: 1–9 images/request.
- `seed`: reproducible generations.
- `prompt_optimizer`: boolean.
- Image-to-image: `subject_reference: [{ type: "character", image_file }]`; image file can be public URL or data URL, JPG/JPEG/PNG, <10MB, best with single front-facing portrait.

## Music Generation

- `POST /v1/music_generation`
- HallucyGenie model: `music-2.6`.
- Docs model enum: `music-2.6`, `music-cover`, `music-2.6-free`, `music-cover-free`.
- IMPORTANT: instrumental flag is `is_instrumental`, not `instrumental`.
- `output_format`: `hex` (default) or `url`; URL expires 24h.
- `stream`: boolean; streaming only supports `hex`.
- `audio_setting`: `sample_rate` `16000|24000|32000|44100`, `bitrate` `32000|64000|128000|256000`, `format` `mp3|wav|pcm`.
- For `music-2.6` with `is_instrumental: true`: `prompt` required 1–2000 chars, `lyrics` not required.
- For non-instrumental: `lyrics` required 1–3500 chars, `prompt` optional 0–2000 chars.
- `lyrics_optimizer: true` can auto-generate lyrics from prompt when `lyrics` empty.
- Lyrics support structure tags: `[Intro]`, `[Verse]`, `[Pre Chorus]`, `[Chorus]`, `[Interlude]`, `[Bridge]`, `[Outro]`, `[Post Chorus]`, `[Transition]`, `[Break]`, `[Hook]`, `[Build Up]`, `[Inst]`, `[Solo]`.
- Lyrics helper: `POST /v1/lyrics_generation`.
- Cover generation: `music-cover` with `audio_url` or `audio_base64`, or `cover_feature_id` from `POST /v1/music_cover_preprocess`; feature id valid 24h.
- `music-2.5` has no HallucyGenie quota allocated in project testing.

## Web Search / Vision

- Token Plan MCP exposes tools: `web_search` and `understand_image`.
- HallucyGenie uses direct internal endpoints:
  - `POST /v1/coding_plan/search` with `{ q }` → organic results.
  - `POST /v1/coding_plan/vlm` with `{ prompt, image_url }` → text description.
- Current public docs describe MCP tool schema, not a stable OpenAPI contract for direct HTTP search/VLM endpoints.
- `understand_image` docs accept `prompt` + `image_url`; docs say JPEG/PNG/GIF/WebP, max 20MB, HTTP/HTTPS URL or local file path in MCP.
- Official `MiniMax-Coding-Plan-MCP` source currently normalizes `understand_image` input before the direct VLM call: HTTP/HTTPS URLs are downloaded, local files are read, existing data URLs pass through, and `/v1/coding_plan/vlm` receives `image_url` as a `data:image/{jpeg|png|webp};base64,...` URL. Raw public URLs can return `2013 invalid image URL` on the direct endpoint.
- HallucyGenie must never persist or log raw image data. If it calls VLM directly, convert image bytes in memory only, send to provider only, and store compact text/history only.

## Video Generation

- No Plus-Highspeed video quota. Max/Ultra plans include limited 768P 6s video quota.
- Create/query/download async flow: create task → `task_id` → query → `file_id` → download.
- Endpoints:
  - `POST /v1/video_generation` variants: text-to-video, image-to-video, first+last frame, subject-reference video.
  - `GET /v1/query/video_generation` — query by `task_id`.
  - `GET /v1/files/retrieve` — download/retrieve video by `file_id`.
- Models:
  - `MiniMax-Hailuo-2.3`: T2V + I2V; 1080p 6s, 768p 6s/10s.
  - `MiniMax-Hailuo-2.3-Fast`: I2V; 1080p 6s, 768p 6s/10s.
  - `MiniMax-Hailuo-02`: T2V + I2V; 1080p 6s, 768p 6s/10s, 512p 6s/10s.
- Video Agent API: template-based videos; create + query endpoints. Docs list templates.

## File Management

Used by async TTS/video and uploads.

- `POST /v1/files/upload`
- `GET /v1/files/list`
- `GET /v1/files/retrieve`
- `GET /v1/files/retrieve_content`
- `POST /v1/files/delete`
- Formats: documents `pdf|docx|txt|jsonl`; audio `mp3|m4a|wav`.
- Limits: 100GB total capacity, 512MB single document.

## Quotas — Token Plan Plus-Highspeed

| Feature        | Limit                 | Model                                  |
| -------------- | --------------------- | -------------------------------------- |
| M2.7-highspeed | 4,500 requests/5hrs   | `MiniMax-M2.7-highspeed`               |
| Speech 2.8     | 9,000 chars/day       | `speech-2.8-hd` works for HallucyGenie |
| Images         | 100/day               | `image-01`                             |
| Music          | 100 songs/day (≤5min) | `music-2.6`                            |
| Video          | ❌ No quota           | —                                      |

Token Plan quotas:

- Text resets on rolling 5-hour window.
- Non-text resets daily.
- Weekly text quota may apply to users purchased from 2026-03-23 onward: 10× 5-hour quota.
- Peak dynamic limits: Starter/Plus ~1 continuous agent, Max ~2, Ultra ~4.

## Rate Limits

| Feature      | RPM | TPM/Conn       |
| ------------ | --- | -------------- |
| Text M2.x    | 500 | 20,000,000 TPM |
| TTS          | 60  | —              |
| Voice clone  | 60  | —              |
| Voice design | 20  | —              |
| Image        | 10  | —              |
| Music        | 120 | 20 conn        |
| Video        | 5   | —              |

## Common error codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| 1002 | rate limit                                         |
| 1004 | auth failed / wrong auth header                    |
| 1008 | insufficient balance                               |
| 1026 | sensitive input                                    |
| 1027 | sensitive output                                   |
| 1039 | token limit                                        |
| 1042 | invisible/illegal char ratio limit                 |
| 2013 | invalid params                                     |
| 2049 | invalid API key                                    |
| 2056 | usage limit exceeded                               |
| 2061 | model unsupported by current token plan (observed) |

## Quick Test Commands

```bash
# TTS test
curl -s -X POST "https://api.minimax.io/v1/t2a_v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -d '{"model":"speech-2.8-hd","text":"test","output_format":"hex","voice_setting":{"voice_id":"English_expressive_narrator"}}'

# Image test
curl -s -X POST "https://api.minimax.io/v1/image_generation" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -d '{"model":"image-01","prompt":"test","response_format":"url"}'

# Music instrumental test (note is_instrumental)
curl -s -X POST "https://api.minimax.io/v1/music_generation" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -d '{"model":"music-2.6","prompt":"upbeat gaming intro","is_instrumental":true,"output_format":"hex"}'

# Check quota
curl -s "https://api.minimax.io/v1/token_plan/remains" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json"
```
