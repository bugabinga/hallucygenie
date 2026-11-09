---
name: minimax
description: MiniMax API integration for HallucyGenie. Use when working with MiniMax APIs (chat, TTS, image, music, web search, vision, video).
---

# MiniMax API — HallucyGenie

Baseline docs crawl: 2026-06-11 from `https://platform.minimax.io/docs/llms.txt` into `~/.pi/research/pages/`.
Models, M Plan billing, music access, and H3 V2 contracts rechecked on 2026-11-09.
Unrevised API facts retain the baseline date.
Cross-checked `MiniMax-AI/MiniMax-Coding-Plan-MCP` source via `git_clone_safe` on earlier crawls.

## Base URLs

- Global API: `https://api.minimax.io`
- Anthropic SDK base: `https://api.minimax.io/anthropic` → raw endpoint `POST /anthropic/v1/messages`
- OpenAI SDK base: `https://api.minimax.io/v1`
- TTS low-TTFA alt: `https://api-uw.minimax.io/v1/t2a_v2`
- China docs mention `https://api.minimaxi.com` for CN users.

## Authentication

- Use `Authorization: Bearer <key>` for all endpoints.
- `/anthropic/v1/messages` docs list both `Authorization: Bearer` and `x-api-key`; `Authorization` is recommended and takes precedence when both are present.
- All other endpoints (TTS, image, music, web search, VLM, video, file mgmt) **ONLY** accept `Authorization: Bearer`.
- Using `x-api-key` on other endpoints returns `{"base_resp":{"status_code":1004}}`.
- Subscription Keys are separate from pay-as-you-go API keys.
- Subscription Keys now also spend prepaid Credits. Credits use Subscription Key auth, not pay-as-you-go API key auth.
- Each user has a dedicated Subscription Key per Team. The key can exist with no usable paid resources until a Token Plan seat or Credits access is available.
- If Token Plan quota and Credits both apply, MiniMax consumes Token Plan quota first, then Credits automatically.

## Text / Chat

### Anthropic-compatible chat

- `POST /anthropic/v1/messages`
- Current text models: `MiniMax-M3.1-Flash`, `MiniMax-M3`; older M2.x models are on retirement schedules.
- `MiniMax-M3.1-Flash` always thinks and supports `output_config.effort`: `low`, `medium`, `high`, `xhigh`, `max` (default `max`).
- HallucyGenie uses `MiniMax-M3.1-Flash` with adaptive thinking, streaming, and its existing 4096 output-token cap.
- Current contract: https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md
- Context window: M3.1 Flash and M3 support 1,000,000 tokens; legacy M2.x 204,800 tokens. Max token count means input + output.
- `max_tokens`: M3 recommended 131,072 and max 524,288; M2.x recommended 65,536 and max 204,800.
- Highspeed M2.x output: ~100 tps. Standard M2.x: ~60 tps.
- Supported params: `model`, `messages`, `max_tokens`, `stream`, `system`, `temperature`, `tool_choice`, `tools`, `top_p`, `metadata`, `thinking`.
- Explicit prompt caching: add `cache_control: {"type":"ephemeral"}` to content/tool blocks that should be cached. HallucyGenie caches the system block and last tool definition.
- Ignored params: `top_k`, `stop_sequences`, `service_tier`, `mcp_servers`, `context_management`, `container`.
- Message blocks supported on M2.x: `text`, `tool_use`, `tool_result`, `thinking`.
- Message blocks supported on M3: `text`, `image`, `video`, `tool_use`, `tool_result`, `thinking`, `mid_conv_system`.
- Message blocks NOT supported: `document`.
- Thinking: response uses Anthropic `thinking` content blocks; no tag parsing needed.
- M3 thinking is disabled by default unless `thinking: {"type":"adaptive"}` is sent. M2.x thinking cannot be disabled.
- Tool use critical: for multi-turn tool calls, append the full assistant response content back into history, including `thinking` blocks + `signature` + `tool_use`. Dropping thinking/signature can break reasoning continuity.
- Token count endpoint: `POST /anthropic/v1/messages/count_tokens`.

### OpenAI-compatible chat

- `POST /v1/chat/completions`
- Base for SDK: `https://api.minimax.io/v1`
- Supports M3/M2.7/M2.5/M2.1/M2 models.

### OpenAI Responses API

- `POST /v1/responses`
- `POST /v1/responses/input_tokens`
- Supports text input/output, image input, and video input content parts.

### Model list endpoints

- `GET /anthropic/v1/models`
- `GET /anthropic/v1/models/{model_id}`
- `GET /v1/models`
- `GET /v1/models/{model}`

## TTS / Speech

### Sync TTS

- `POST /v1/t2a_v2` — synchronous, up to **10,000 chars/request**.
- Docs models: `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo`, `speech-01-hd`, `speech-01-turbo`.
- HallucyGenie currently uses `speech-2.8-hd`.
- Output: `output_format: "hex"` by default. Convert with `Buffer.from(hex, "hex").toString("base64")` → data URL.
- Text >3,000 chars: streaming recommended.
- Pause markers: `<#1.5#>` range `[0.01, 99.99]`, between speakable segments, no consecutive pauses.
- Inline pronunciation: wrap Mandarin pinyin tone numbers, IPA, or Cantonese Jyutping tone numbers in half-width parentheses, e.g. `(he2)`, `(lɪv)`, `(sung3)`.
- Speech-2.8 interjection tags: `(laughs)`, `(chuckle)`, `(coughs)`, `(clear-throat)`, `(groans)`, `(breath)`, `(pant)`, `(inhale)`, `(exhale)`, `(gasps)`, `(sniffs)`, `(sighs)`, `(snorts)`, `(burps)`, `(lip-smacking)`, `(humming)`, `(hissing)`, `(emm)`, `(sneezes)`.
- `voice_setting`: `voice_id`, `speed` `[0.5,2]`, `vol` `(0,10]`, `pitch` `[-12,12]`, `emotion`, plus newer booleans `text_normalization` and `latex_read`.
- `audio_setting`: `sample_rate` `8000|16000|22050|24000|32000|44100`, `bitrate` `32000|64000|128000|256000`, `format` `mp3|pcm|flac|wav|pcmu_raw|pcmu_wav|opus`, `channel` `1|2`, `force_cbr` for streamed MP3.
- `voice_modify`: `pitch/intensity/timbre` `[-100,100]`, `sound_effects`: `spacious_echo|auditorium_echo|lofi_telephone|robotic`.
- `language_boost`: 40 language values or `auto`.
- `subtitle_enable`: returns `subtitle_file` URL.
- `subtitle_type`: `sentence` (default), `word`, `word_streaming` (only valid with `stream=true`).
- System voices: docs list `English_expressive_narrator` and many others; latest list also via `POST /v1/get_voice`.
- Cantonese system voices now documented: `Cantonese_GentleLady`, `Cantonese_podacast_host_1`; set `language_boost` to `Chinese,Yue`.

### Async long TTS

- `POST /v1/t2a_async_v2` — create async speech task; current direct text input max **100,000 characters**; HallucyGenie intentionally retains its 50,000-character cap.
- `text_file_id` input max **1,000,000 characters**; supported file formats: `txt`, `zip`.
- Async `audio_setting.audio_sample_rate`: `8000|16000|22050|24000|32000|44100`; unlike sync TTS, async uses `audio_sample_rate`, not `sample_rate`.
- Async `audio_setting.format`: `mp3|pcm|flac|wav|pcmu_raw|pcmu_wav|opus`; `voice_modify` supports `mp3|wav|flac` only.
- Async `audio_setting.format=opus` only supports sample rates `8000|12000|16000|24000|48000`; other sample rates fail.
- Async `audio_setting.channel` docs default is `2`.
- Async `voice_setting.english_normalization` enables English text normalization; sync TTS uses `text_normalization`.
- Async extra interjection tags: `(whistles)`, `(crying)`, `(applause)`.
- Async now includes `subtitle_enable`, `subtitle_type`, and `continuous_sound` (`speech-2.8-hd|speech-2.8-turbo`; default `false`; `true` keeps model-side continuous inference for better long-text prosody, `false` splits text for lower latency).
- `GET /v1/query/t2a_async_query_v2` — query task → get `file_id` → use File API retrieve/download.
- Returned audio URL valid 9 hours (32,400 seconds).

### Voice APIs

- Upload clone audio: `POST /v1/files/upload` for `purpose=voice_clone` (per voice clone docs) then clone endpoint.
- Voice clone: `POST /v1/voice_clone`; temp voice must be used within 168 hours (7 days) to keep permanently.
- Voice design: `POST /v1/voice_design`; generated voice also temp until first use.
- Voice management: `POST /v1/get_voice`, `POST /v1/delete_voice`.
- Get voice requires `voice_type`; values: `all|system|voice_cloning|voice_generation`.

### Plan model availability (tested 2026-04-19)

| Model              | Status         | Notes                                                                                    |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| `speech-2.8-hd`    | ✅ Works       | Latest HD TTS                                                                            |
| `speech-2.8-turbo` | ❌ Unsupported | Plan only has `speech-hd` quota                                                          |
| `speech-2.6-hd`    | ❌ Unsupported | Docs say Token Plan TTS HD includes HD models, but HallucyGenie key returned unsupported |
| `speech-2.6-turbo` | ❌ Unsupported |                                                                                          |
| `speech-02-hd`     | ❌ Unsupported |                                                                                          |
| `speech-02-turbo`  | ❌ Unsupported |                                                                                          |
| `speech-01-hd`     | not tested     | Documented current API model; no HallucyGenie plan smoke result                          |
| `speech-01-turbo`  | not tested     | Documented current API model; no HallucyGenie plan smoke result                          |

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

- Access change effective 2026-08-20: paid Music Generation and Lyrics Generation APIs are closed to new users; existing paying users may continue.
- Free music APIs were discontinued.
- Official notices: [Music Generation](https://platform.minimax.io/docs/api-reference/music-generation.md), [Lyrics Generation](https://platform.minimax.io/docs/api-reference/lyrics-generation.md).
- [Model list](https://platform.minimax.io/docs/faq/models.md) labels music models retired but explicitly preserves the existing-paying-user exception.
- `music-3.0` appears in the same legacy API contract; switching models does not bypass the access restriction.
- HallucyGenie observed HTTP `410` with provider code `2153` for this restriction; the numeric code is an observation, not a published error-code definition.
- No supported replacement hosted endpoint or Subscription Key migration was found.
- MiniMax Audio is a consumer alternative; open-source MiniMax Music 3 is a separate self-hosting integration, not a drop-in API replacement.
- Do not tell users to shorten or retry prompts when this permanent access restriction occurs.

Legacy-account API contract:

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
- Music generation lyrics support structure tags: `[Intro]`, `[Verse]`, `[Pre Chorus]`, `[Chorus]`, `[Interlude]`, `[Bridge]`, `[Outro]`, `[Post Chorus]`, `[Transition]`, `[Break]`, `[Hook]`, `[Build Up]`, `[Inst]`, `[Solo]`.
- Lyrics helper: `POST /v1/lyrics_generation`; output tags include `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Hook]`, `[Drop]`, `[Bridge]`, `[Solo]`, `[Build-up]`, `[Instrumental]`, `[Breakdown]`, `[Break]`, `[Interlude]`, `[Outro]`.
- Cover generation: `music-cover` with `audio_url` or `audio_base64`, or `cover_feature_id` from `POST /v1/music_cover_preprocess`; feature id valid 24h.
- `music-2.5` has no HallucyGenie quota allocated in project testing.

## Web Search / Vision

- Token Plan MCP exposes tools: `web_search` and `understand_image`.
- HallucyGenie uses direct internal endpoints:
  - `POST /v1/coding_plan/search` with `{ q }` → organic results.
  - `POST /v1/coding_plan/vlm` with `{ prompt, image_url }` → text description.
- Official M Plan CLI uses these exact direct routes: https://github.com/MiniMax-AI/cli/blob/main/src/client/endpoints.ts
- Successful subscription-key search and image-understanding calls were observed on 2026-11-09; backend model selection is provider-managed.
- `understand_image` docs accept `prompt` + `image_url`; docs say JPEG/PNG/GIF/WebP, max 20MB, HTTP/HTTPS URL or local file path in MCP.
- Official `MiniMax-Coding-Plan-MCP` source currently normalizes `understand_image` input before the direct VLM call: HTTP/HTTPS URLs are downloaded, local files are read, existing data URLs pass through, and `/v1/coding_plan/vlm` receives `image_url` as a `data:image/{jpeg|png|webp};base64,...` URL. Raw public URLs can return `2013 invalid image URL` on the direct endpoint.
- HallucyGenie must never persist or log raw image data. If it calls VLM directly, convert image bytes in memory only, send to provider only, and store compact text/history only.

## Video Generation

- Base `MiniMax-H3` is current; Highspeed/Lite/Max are distinct variants, not verified by a base-model test.
- H3 is documented in M Plan Explore/Build; not included in Go or legacy Token Plan.
- A base H3 4-second 768P task completed successfully with the operator's Explore key on 2026-11-09, resolving conflicting generic PAYG guidance for that tested case.
- Create: `POST /v2/video_generation` with `model`, `content: [{type:"text",text:prompt}]`, `duration`, `resolution`, and text-to-video `ratio`.
- Query: `GET /v2/query/video_generation/{task_id}`; success is `task.status: "succeeded"` with `task.content.url`.
- H3 output is downloaded directly; do not use V1 `file_id` retrieval.
- Base H3 supports 4–15 seconds and `768P`/`2K`; Genie exposes 4/6/10-second presets, defaults to 4 seconds and 768p, with 16:9 output.
- Failed/cancelled/expired tasks are terminal; do not silently resubmit or switch credentials.
- Contracts: https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md and https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md
- Hailuo V1 remains a separate legacy contract, not compatible with H3 payload/query shapes.
- Video Agent API: template-based videos; create + query endpoints. Example templates: `392747428568649728` Diving (image required, prompt not required), `393769180141805569` Run for Life (image + prompt required).

## File Management

Used by async TTS, legacy video, and uploads; H3 V2 returns its output URL directly.

- `POST /v1/files/upload`
- `GET /v1/files/list`
- `GET /v1/files/retrieve`
- `GET /v1/files/retrieve_content`
- `POST /v1/files/delete`
- `GET /v1/files/retrieve` requires query `file_id` and returns metadata plus `download_url`.
- `GET /v1/files/retrieve_content` requires query `file_id` and returns raw file bytes.
- `GET /v1/files/list` requires query `purpose`.
- `POST /v1/files/delete` requires JSON `file_id` plus `purpose`.
- Delete `purpose` values: `voice_clone|prompt_audio|t2a_async|t2a_async_input|video_generation`.
- Upload `purpose` values: `voice_clone|prompt_audio|t2a_async_input`.
- Upload formats by purpose: `voice_clone` and `prompt_audio` support `mp3|m4a|wav`; `t2a_async_input` text file for async long TTS; `t2a_async_input` supports `txt|zip` for async long TTS.
- Limits: 100GB total capacity, 512MB single document.

## Quotas and billing — M Plan

- Current tiers: Go, Explore, Build; text, image, audio, search, and understanding share plan usage, while H3 is included in Explore/Build.
- Non-video usage has rolling 5-hour and weekly windows; video uses the weekly window.
- Subscription keys consume plan quota and eligible credit packs; standard PAYG keys consume account balance.
- PAYG-priced endpoints can still consume M Plan quota; a listed monetary price does not establish a PAYG-key requirement.
- Do not automatically switch billing credentials after a failed request.
- Music/lyrics access denial was observed with both the subscription and supplied PAYG key (HTTP 410, code 2153); this is not a general proof about every historical account.
- Source: https://platform.minimax.io/docs/m-plan/faq.md

### Historical Token Plan baseline (2026-06-11)

The following retained observations predate M Plan and must not override current access restrictions.
The 2026-06-11 docs no longer published fixed per-model daily/request quota tables.

| Tier  | Price      | Quota windows                     | Agent usage | Resource coverage          |
| ----- | ---------- | --------------------------------- | ----------- | -------------------------- |
| Plus  | $20/month  | 5-hour rolling and weekly windows | 3-4 agents  | All models on API Platform |
| Max   | $50/month  | 5-hour rolling and weekly windows | 4-5 agents  | All models on API Platform |
| Ultra | $120/month | 5-hour rolling and weekly windows | 6-7 agents  | All models on API Platform |

Token Plan quotas:

- Usage is shown as a shared usage bar in the console.
- Text, image, speech, music, and eligible video draw from shared Token Plan coverage.
- Plus-Highspeed and Starter are preserved only for existing legacy subscribers; no longer offered to new users.
- M3 access is included in current and preserved legacy plans, sharing quota with M2.7.
- Credits can automatically cover usage after Token Plan quota is exhausted, or covered resources outside current subscription quota.
- Credits price: 1,000 credits = $1. Credits expire 365 days after purchase.

## Rate Limits

| Feature      | RPM | TPM/Conn       |
| ------------ | --- | -------------- |
| Text M3      | 200 | 10,000,000 TPM |
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
