# HG-ISSUE-004: MiniMax Create UI and LLM tools do not expose full API params

**Status:** fixed-v1  
**Severity:** medium  
**Area:** Create modal / MiniMax wrappers / LLM tool schemas  
**Devil verdict:** valid product gap, but blocked by API research + tool-call stability

## Report

Tools under **Create** for image, music, and voice were supposed to expose all relevant MiniMax API params, but do not. Presumably same limitation applies to LLM tool schemas.

## Actual

Create UI exposes only a small subset:

- Image: prompt + aspect ratio text folded into prompt
- Music: prompt + lyrics + instrumental flag folded into prompt
- Voice: text + speed text folded into prompt

LLM tool schemas are also minimal in `src/tools.ts`:

- `generate_image`: only `prompt`
- `text_to_speech`: `text`, `voice_id`
- `generate_music`: `prompt`, `lyrics`

Tool execution ignores most potential API params:

- `generateImage(prompt, apiKey)` sends only `{ model: "image-01", prompt }`
- `textToSpeech(text, apiKey, voiceId)` sends only model/text/voice_id
- `generateMusic(prompt, apiKey, lyrics)` sends only model/prompt/lyrics

## Expected

- Create UI exposes supported MiniMax params for image/music/TTS where safe and useful.
- LLM tool schemas expose same params so agent can call tools precisely.
- Server/tool wrapper passes through validated params to MiniMax API payloads.
- Unsupported plan/model params are omitted or clearly disabled.

## Devil review

“Expose all params” is dangerous unless scoped. Some MiniMax params may be unsupported by current plan, unstable, unsafe for child UX, or bad for mobile UI.

Do not implement by dumping every API field into UI.

Required before implementation:

1. MiniMax docs audit with current plan constraints.
2. Decide supported param allowlist per tool.
3. Separate advanced params behind small “Advanced” section.
4. Validate all params server-side.
5. Keep LLM tool schema in lockstep with wrapper payload allowlist.
6. Fix general tool-result id bug first; otherwise richer params cannot be tested reliably.

## Recommended scope

V1 should expose “useful safe params”, not everything:

- image: prompt, aspect ratio, style/size/count if supported, seed if supported
- music: prompt, lyrics, instrumental, duration/style if supported
- voice: text, voice id, speed, volume, pitch/emotion if supported by `speech-2.8-hd`

Explicitly document unsupported params and plan constraints.

## Required design changes

1. Option objects:
   - `GenerateImageOptions`
   - `TextToSpeechOptions`
   - `GenerateMusicOptions`
2. Tool wrappers accept options object, not positional args.
3. Tool schemas generated from same allowlist/constants as server validation.
4. Create UI sends structured metadata, not only natural-language prompt.
5. Payload tests assert exact MiniMax req body.
6. UI labels avoid exposing confusing raw API names unless necessary.

## Tests required

- Unit: each tool validates and serializes supported params.
- Unit: unsupported/unknown params are dropped or rejected predictably.
- Unit: LLM `input_schema` includes allowlisted params only.
- Integration: Create structured params reach tool wrapper.
- E2E: Create image/music/voice advanced params persist and submit.
- Static: docs/AGENTS plan constraints match UI options.

## Logs

Checked `logs/dev.log` on 2026-05-01.

No recent backend errors linked to this report. Recent app/quota/chat requests are normal. This is product/API coverage gap, not observed runtime failure.

## Fix

Implemented 2026-05-01 as safe allowlist v1:

- Added typed option objects for image, TTS, music.
- Tool schemas now expose allowlisted params:
  - image: `aspect_ratio`
  - TTS: `speed`, `volume`, `pitch`
  - music: `instrumental`
- Server-side wrapper validation/clamping added.
- Create prompts now name intended tool + params explicitly instead of vague folded prose.
- Payload regression tests added for option serialization.

Remaining richer controls belong in spec/ticket work, not this bug.

## Related

- `HG-ISSUE-001`, `HG-ISSUE-005`, `HG-ISSUE-006` must be fixed before reliable media tool param E2E.
- `HG-SPEC-006` requires structured tool input history; this issue should share the same structured input model.
