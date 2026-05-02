# HG-ISSUE-022 — Music generation fails without lyrics

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/tools.ts`, `src/server.ts`, `public/app.ts`

## Symptom

Generate music failed in the live Chrome session. UI showed safe generic tool error.

## Relevant log excerpts

```json
{"level":"warn","msg":"tool returned error","time":"2026-05-01T21:23:47.803Z","service":"agent","toolName":"generate_music","error":"Music generation returned empty audio data"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T21:24:03.673Z","service":"agent","toolName":"generate_music","error":"Music generation returned empty audio data"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T21:24:54.668Z","service":"agent","toolName":"generate_music","error":"Music generation returned empty audio data"}
```

## Latest DB conversation excerpts

```json
{"id":6,"role":"user","content":"Use generate_music with prompt: dramtic violing universion riff\nTool params: instrumental=true"}
{"id":7,"role":"assistant","tool_calls_json":"[{\"id\":\"direct_000012\",\"name\":\"generate_music\",\"input\":{\"instrumental\":true,\"prompt\":\"dramtic violing universion riff\"}}]"}
{"id":8,"role":"tool","content":"Error: Couldn't generate music. Try a shorter prompt or lyrics."}
{"id":9,"role":"user","content":"Use generate_music with prompt: dramtic violing universion riff"}
{"id":10,"role":"assistant","tool_calls_json":"[{\"id\":\"direct_000015\",\"name\":\"generate_music\",\"input\":{\"prompt\":\"dramtic violing universion riff\"}}]"}
{"id":11,"role":"tool","content":"Error: Couldn't generate music. Try a shorter prompt or lyrics."}
{"id":15,"role":"user","content":"make music fitting the image"}
{"id":16,"role":"assistant","tool_calls_json":"[{\"id\":\"call_function_ote07mp5yqvn_1\",\"name\":\"generate_music\",\"input\":{\"prompt\":\"epic dramatic orchestral music, intense violin crescendo, cosmic orchestral explosion, powerful cinematic tension, dramatic string section building to climax, universal scale, Hans Zimmer meets interstellar soundtrack style, building energy, theatrical, epic conclusion\",\"instrumental\":true}}]"}
{"id":17,"role":"tool","content":"Error: Couldn't generate music. Try a shorter prompt or lyrics."}
```

## Prior successful counterexample

Manual verification earlier succeeded when `lyrics` was present:

```txt
Create two tiny media tools in one turn: generate music with prompt "8 bit spooky boss sting, very short, crunchy bass" and lyrics "boo"; ...
```

DB from that run:

```json
{
  "role": "tool",
  "head": "Generated audio with generate_music. The UI displays it in a tool card. Do not embed audio data, audio URLs, or markdown media in your reply."
}
```

## Likely root cause

`docs/MINIMAX_API_RESEARCH.md` says MiniMax `POST /v1/music_generation` requires `lyrics`:

```txt
Requires: lyrics parameter (confirmed by live test: "invalid params, lyrics is required")
```

Current tool schema and direct Create flow treat `lyrics` as optional. The failing requests omitted `lyrics`, including `instrumental=true` requests. MiniMax returned HTTP 200 but no `data.audio`, so `generateMusic()` returned `Music generation returned empty audio data`.

## Not caused by image asset download fix

Image saving worked in the same session:

```json
{
  "id": "00000e",
  "type": "image",
  "filename": "00000e.jpg",
  "mime_type": "image/jpeg",
  "tool_name": "generate_image",
  "size_bytes": 366538
}
```

TTS also worked:

```json
{
  "id": "000019",
  "type": "audio",
  "filename": "000019.mp3",
  "mime_type": "audio/mp3",
  "tool_name": "text_to_speech",
  "size_bytes": 15602
}
```

## Fix applied

- Removed Create→Music instrumental checkbox.
- Create UI label now says: `Lyrics (optional, empty = instrumental)`.
- Create UI sends only `lyrics=...` when lyrics are non-empty.
- `generate_music` tool schema no longer exposes `instrumental`.
- Server direct directive parser ignores stale `instrumental=...` params.
- `generateMusic()` uses current MiniMax payload shape:
  - empty/blank lyrics → omit `lyrics`, send `is_instrumental: true`
  - non-empty lyrics → trimmed `lyrics`, send `is_instrumental: false`
  - never send stale `instrumental` field

## Verification

- `bun test test/tools.test.ts test/server.test.ts test/static.test.ts test/app.test.ts --timeout 30000` → 338 pass.

## 2026-05-01 retest — still failing

Latest DB conversation after `fresh-dev`:

```json
{"id":4,"role":"user","head":"Use generate_music with prompt: donkey kong bong bong raegge"}
{"id":5,"role":"assistant","tool_calls_json":"[{\"id\":\"direct_00000c\",\"name\":\"generate_music\",\"input\":{\"prompt\":\"donkey kong bong bong raegge\"}}]"}
{"id":6,"role":"tool","head":"Error: Couldn't generate music. Try a shorter prompt or lyrics."}
```

Latest log:

```json
{
  "level": "warn",
  "msg": "tool returned error",
  "time": "2026-05-01T21:49:45.212Z",
  "service": "agent",
  "toolName": "generate_music",
  "error": "Music generation returned empty audio data"
}
```

Direct MiniMax test with exact empty-lyrics instrumental payload:

```json
{
  "data": null,
  "trace_id": "0644535a5d1495f59313191f377a8116",
  "base_resp": {
    "status_code": 2013,
    "status_msg": "invalid params, lyrics is required"
  }
}
```

Conclusion at this point was incomplete: `lyrics: ""` is not accepted with the old `instrumental` field.

## 2026-05-01 fresh MiniMax research

`just minimax-research` completed after a longer run and updated `/home/me/.pi/agent/skills/minimax/SKILL.md`.

Fresh docs say:

- Music instrumental flag is `is_instrumental`, not `instrumental`.
- For `music-2.6` with `is_instrumental: true`: `prompt` required, `lyrics` not required.
- For non-instrumental: `lyrics` required.

Direct live test:

```json
{
  "request": {
    "model": "music-2.6",
    "prompt": "short upbeat chiptune game loop",
    "is_instrumental": true,
    "output_format": "hex"
  },
  "response": {
    "data": { "audio": "<hex len=2047400>", "status": 2 },
    "base_resp": { "status_code": 0, "status_msg": "success" }
  }
}
```

Updated conclusion: app wrapper should use `is_instrumental: true` and omit `lyrics` for empty-lyrics instrumental music. Dummy lyrics are not the right fix.

Final fix applied in `src/tools.ts`:

- Empty lyrics → `{ model: "music-2.6", prompt, is_instrumental: true }`
- Non-empty lyrics → `{ model: "music-2.6", prompt, lyrics, is_instrumental: false }`
- Added MiniMax `base_resp.status_code !== 0` handling for clearer internal tool errors.

Final verification:

- `bun test test/tools.test.ts --timeout 30000` → 77 pass.
- `just check` passed.
- `just test-unit` passed.

## 2026-05-02 manual Chrome verification

Create→Music UI now matches the fixed payload model:

- no stale `#music-instrumental` checkbox exists
- lyrics label reads `Lyrics (optional, empty = instrumental)`
- unit tests verify empty lyrics send `is_instrumental: true` and omit `lyrics`
