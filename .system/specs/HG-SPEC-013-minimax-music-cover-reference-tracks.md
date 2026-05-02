# HG-SPEC-013 — MiniMax music-cover from reference tracks

**Status:** Draft
**Created:** 2026-05-01
**Scope:** Research/product first. Future: YouTube ingestion, `src/tools.ts`, `src/server.ts`, `src/db.ts`, `public/app.ts`, tests

## Problem

MiniMax quota now includes:

```txt
music-cover: 100
```

The exciting use case is **not** covering HallucyGenie-generated assets. A kid can usually recreate or tweak generated music by changing prompts.

The exciting use case is reference-track based:

```txt
paste YouTube URL → app gets/derives audio → MiniMax cover → new creator-safe music asset
```

This could be magical for an 11-year-old creator, but it is also the riskiest music feature:

- YouTube Terms / extraction legality
- Copyright / permissions
- Celebrity / artist imitation
- Kid safety
- Long-running audio processing
- Deploy footprint (`yt-dlp`, ffmpeg, temp files)
- Public URL vs base64/preprocess requirements for MiniMax

So cover must be its own research-first spec.

## Fresh MiniMax API facts

From updated MiniMax skill:

- `music-cover` quota exists: 100.
- Cover generation uses `music-cover` model.
- Inputs may include `audio_url`, `audio_base64`, or `cover_feature_id` from `POST /v1/music_cover_preprocess`.
- `cover_feature_id` valid 24h.

Need live verification for our plan/account.

## Goal

Design a kid-friendly cover/remix workflow around reference tracks.

Ideal UX:

```txt
Cover a song / Remix a reference
[Paste a YouTube URL]
[Describe new vibe: spooky boss battle]
[Confirm: I own this / have permission / royalty-free]
[Make cover]
```

Output:

- New music asset with visible audio controls.
- Source metadata saved (title/channel/url/thumbnail), not raw source audio in chat history.
- Clear explanation: “Made a transformed cover/remix from your reference.”

## Relationship to YouTube spec

This spec depends on or extends HG-SPEC-010.

Possible YouTube pipeline:

1. User pastes YouTube URL.
2. App fetches metadata via YouTube oEmbed/Data API:
   - title
   - thumbnail
   - channel
   - video id
3. App checks/asks rights:
   - “Is this your video?”
   - “Do you have permission?”
   - “Is it royalty-free/public-domain?”
4. Server extracts audio only if policy allows.
5. Server sends audio to MiniMax cover API.
6. Server saves output as local music asset.

`yt-dlp` is a possible extraction tool, but not automatically approved. Research must answer:

- Is `yt-dlp` acceptable for our intended use and deployment?
- Does it violate YouTube Terms in this context?
- Can we restrict to own-channel videos or explicit-permission sources?
- Do we need ffmpeg for audio extraction/transcoding?
- Can this work on Termux/Android/local dev and container deploy?

## Non-goals

Do not build v1 cover for:

- Arbitrary copyrighted YouTube songs with no permission
- Spotify/Apple Music extraction
- Celebrity voice/song imitation
- “Make this sound exactly like [artist]”
- Full audio editor / DAW
- Hidden background extraction without user confirmation
- Raw audio in agent context or chat history

## Proposed UX constraints

### Kid-friendly labels

Use:

- “Cover a song”
- “Remix a reference”
- “Use my video/audio as inspiration”

Avoid:

- `music-cover`
- `preprocess`
- `cover_feature_id`
- `audio_base64`

### Rights/safety gate

Before extraction/generation:

```txt
Can you use this music?
[ ] This is my own video/music
[ ] This is royalty-free/public-domain
[ ] I have permission
```

If no box checked, do not continue. Offer safer alternative:

```txt
I can make a new song with a similar vibe from your description instead.
```

### Prompt transformation

The app should encourage transformed, creator-safe output:

- “make it spooky boss battle”
- “make it 8-bit gaming intro”
- “make it silly reggae background”

Not:

- “copy exactly”
- “sound like Taylor Swift”
- “make a fake official song”

## Proposed tool shape

Do not add this LLM tool until ingestion/policy is decided.

Possible future tool:

```ts
{
  name: "generate_music_cover",
  input_schema: {
    type: "object",
    properties: {
      source_asset_id: { type: "string" },
      source_url: { type: "string" },
      prompt: { type: "string" },
      rights_attestation: {
        type: "string",
        enum: ["own_video", "royalty_free", "permission"]
      }
    },
    required: ["prompt", "rights_attestation"]
  }
}
```

But preferred architecture may be server/UI-driven, not LLM-driven, because rights prompts and extraction are product flow, not agent improvisation.

## Server pipeline options

### Option A — YouTube URL → yt-dlp → audio_base64

```txt
YouTube URL → metadata → rights gate → yt-dlp/ffmpeg → audio_base64 → MiniMax cover → save MP3
```

Pros:

- No public storage required if MiniMax accepts `audio_base64`.
- Good local dev story if yt-dlp/ffmpeg installed.

Cons:

- Terms/copyright risk.
- Extra deps.
- Slow/fragile extraction.
- Need temp file cleanup.

### Option B — Public URL only

```txt
source audio URL → MiniMax cover
```

Pros:

- Simple if source is already a legal direct audio URL.

Cons:

- YouTube does not provide stable direct audio URLs through official API.
- Local assets are not publicly reachable in dev.

### Option C — App-owned sample/reference pack

```txt
choose bundled royalty-free reference → MiniMax cover
```

Pros:

- Safest v1.
- No YouTube extraction.
- Kid-friendly.

Cons:

- Less magical than paste URL.

### Option D — Own-channel YouTube only

```txt
OAuth / channel verification → own uploaded video → extract/use audio
```

Pros:

- Stronger rights story.

Cons:

- OAuth and YouTube account complexity.
- Likely too much for v1.

## Data model

Cover output asset should store params:

```json
{
  "model": "music-cover",
  "source_kind": "youtube",
  "source_url": "https://www.youtube.com/watch?v=...",
  "source_video_id": "...",
  "source_title": "...",
  "source_channel": "...",
  "source_thumbnail": "...",
  "rights_attestation": "own_video",
  "prompt": "make it spooky boss battle"
}
```

Never store raw source audio in messages.

Temporary extraction files:

- live under `data/tmp/cover/{reqId}` or OS temp
- deleted on success/failure
- never served publicly unless explicitly designed

## Open research questions

1. Exact MiniMax `music-cover` request/response schema for Token Plan.
2. Does `music-cover` accept `audio_base64` directly?
3. Is `music_cover_preprocess` required or optional?
4. Does output come as hex audio, URL, task id, or polling status?
5. How long does cover generation take?
6. Does MiniMax reject copyrighted-looking input or artist names?
7. Can `yt-dlp` be used legally/appropriately for this app?
8. Does `yt-dlp` need ffmpeg for usable MP3/WAV extraction?
9. Can YouTube API identify own-channel videos without OAuth?
10. What is the safest valuable v1: bundled samples, own assets, own YouTube videos, or arbitrary URL with attestation?

## Suggested path

Do not implement cover in the same change as lyrics generation.

Step 1 — research only:

- Run live MiniMax cover smoke tests with a tiny known legal audio sample.
- Test `audio_base64` vs `audio_url` vs preprocess.
- Record response shape and timing.
- Research `yt-dlp` legality/deploy constraints.
- Update HG-SPEC-010 with YouTube URL/audio extraction findings.

Step 2 — choose product boundary:

- safest: bundled/sample/reference pack
- useful: user-provided legal direct audio URL
- magical but risky: YouTube URL extraction
- account-heavy: own-channel OAuth

Step 3 — implement smallest safe slice.

## Acceptance criteria for future implementation

- User understands they need rights/permission.
- Arbitrary URL extraction is blocked or gated by final policy.
- Cover output saves as local music asset.
- Source metadata is saved; raw source audio is not saved in chat history.
- Temporary files are cleaned up.
- No raw audio bytes enter agent context.
- UI shows visible native audio controls.
- Tests cover rights gate, source metadata, MiniMax payload, asset save, temp cleanup.
