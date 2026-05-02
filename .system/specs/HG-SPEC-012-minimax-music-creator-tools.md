# HG-SPEC-012 — MiniMax music creator tools: lyrics + song generation

**Status:** Draft
**Created:** 2026-05-01
**Scope:** Product/design first. Future: `src/tools.ts`, `src/agent.ts`, `src/server.ts`, `src/db.ts`, `public/app.ts`, tests

## Tickets

- `HG-TICKET-046-minimax-lyrics-api-research.md`
- `HG-TICKET-047-generate-lyrics-tool.md`
- `HG-TICKET-048-create-write-lyrics-button.md`
- `HG-TICKET-049-agent-song-sequence.md`
- `HG-TICKET-050-music-asset-params-lyrics.md`

## Problem

Fresh MiniMax quota shows a new lyrics helper capability:

```txt
lyrics_generation: 100
```

This opens useful song workflows, but raw API-shaped tools are not kid-friendly. A child should not need to understand “lyrics generation endpoint” or “is_instrumental”.

`music-cover: 100` is split into HG-SPEC-013.

The app needs a simple music creation flow that helps an 11-year-old gaming YouTuber make:

- instrumental background music
- songs with generated lyrics
- songs from hand-written lyrics
  Cover/remix is split to HG-SPEC-013.

## Fresh MiniMax API facts

From updated MiniMax skill (`~/.pi/agent/skills/minimax/SKILL.md`):

- `POST /v1/music_generation`
  - model: `music-2.6`
  - instrumental flag: `is_instrumental`, not `instrumental`
  - instrumental: `is_instrumental: true`, `prompt` required, `lyrics` not required
  - non-instrumental: `is_instrumental: false`, `lyrics` required
  - `lyrics_optimizer: true` can generate/improve lyrics from prompt
- `POST /v1/lyrics_generation`
  - dedicated lyrics helper
  - quota present: `lyrics_generation: 100`

## Goal

Add kid-friendly music creation without exposing API complexity:

- “Make instrumental music” works when lyrics are empty.
- “Make a song” can generate lyrics first, then generate music.
- “Write lyrics only” gives editable lyrics draft.
- Cover/remix is out of this spec and covered by HG-SPEC-013.
- Tool outputs stay explainable and previewable.
- No raw audio bytes in agent context or chat history.

## Non-goals

Do not build in v1:

- Full DAW / audio editor
- Timeline editing / stems / mixing UI
- Public upload or sharing
- Music cover/remix workflow; see HG-SPEC-013
- Copyrighted-song cover workflow from arbitrary YouTube/Spotify URLs without a policy/rights model
- Celebrity voice/song imitation
- External audio upload from device unless safety/product questions are resolved
- Background async job framework unless required by MiniMax endpoint behavior

## Product model

### Kid-facing Create UI

One integrated **Music** tab, not separate API tabs.

Suggested sections:

```txt
Music idea
[describe vibe: spooky 8-bit boss fight]

Lyrics
[ optional text area ]
(empty = instrumental)

[✨ Write lyrics for me]
[🎵 Generate music]
```

The UI should use kid terms:

- “Write lyrics for me” not `lyrics_generation`
- “Instrumental” means lyrics box empty

Cover/remix UI is out of scope here; see HG-SPEC-013.

### Agent-facing tools

Recommendation: **separate LLM tools, integrated Create UI**.

Why separate for LLM:

- More controllable multi-step planning.
- Agent can show intermediate lyrics draft before spending music quota.
- Lyrics can be edited/reused.
- Failures are easier to isolate: lyrics failed vs music failed.
- Cover/remix is distinct and handled by HG-SPEC-013.

Why integrated for Create UI:

- Kid should not orchestrate multiple APIs manually.
- UI can sequence calls for common paths:
  - generate lyrics → show/edit → generate music
  - empty lyrics → instrumental music
  - cover/remix belongs to HG-SPEC-013

## Proposed tools

### 1. `generate_lyrics`

Purpose: text-only lyrics draft.

Inputs:

```ts
{
  prompt: string;
  style?: string;
  mood?: string;
  length?: "short" | "medium";
}
```

Output:

```ts
{ type: "text", content: "[Verse]..." }
```

Rules:

- No asset created by default.
- Save in chat history as text.
- UI can copy result into Music lyrics field.
- Kid-safe prompt guard should reject sexual/violent hate lyrics if needed.

### 2. `generate_music`

Purpose: create music MP3.

Inputs:

```ts
{
  prompt: string;
  lyrics?: string;
  lyrics_optimizer?: boolean;
}
```

Mapping:

```ts
const lyricsText = lyrics?.trim() ?? "";
if (lyricsText) {
  payload = {
    model: "music-2.6",
    prompt,
    lyrics: lyricsText,
    is_instrumental: false,
  };
} else {
  payload = { model: "music-2.6", prompt, is_instrumental: true };
}
```

Optional future:

- `lyrics_optimizer: true` when user asks “make lyrics for me and song in one step”.
- But v1 should prefer explicit `generate_lyrics` → preview/edit → `generate_music` for better kid control.

## Create UI flows

### Flow A — Instrumental music

1. Kid enters prompt.
2. Lyrics field empty.
3. UI sends `generate_music` with prompt only.
4. Server sends `is_instrumental: true`, omits lyrics.
5. Tool card shows audio player.
6. Asset library stores params:

```json
{
  "model": "music-2.6",
  "prompt": "spooky 8-bit boss fight",
  "is_instrumental": true
}
```

### Flow B — Song with kid-written lyrics

1. Kid enters prompt.
2. Kid types lyrics.
3. UI sends `generate_music` with prompt + lyrics.
4. Server sends `is_instrumental: false`.
5. Asset params include lyrics excerpt, not raw audio.

### Flow C — Write lyrics first

1. Kid enters idea.
2. Clicks “Write lyrics for me”.
3. App calls `generate_lyrics`.
4. Lyrics appear in editable lyrics field and as chat text if initiated from chat.
5. Kid can edit.
6. Kid clicks “Generate music”.

### Flow D — One-shot song from idea

If user asks chat: “make a song about X”, agent may:

1. Call `generate_lyrics`.
2. Call `generate_music` with generated lyrics.
3. Reply briefly: “Song ready — lyrics and audio are in the cards.”

If user asks: “make instrumental music about X”, agent calls only `generate_music`.

## DB / asset implications

Needed or strongly recommended:

- Store asset params JSON (already covered by HG-SPEC-008).
- Store generated lyrics as either:
  - normal assistant text message, or
  - future “draft” table if Create UI needs persistent draft state.
    Cover/remix asset metadata belongs to HG-SPEC-013.

## Agent prompt updates

Agent must know:

- Empty lyrics means instrumental.
- Use `generate_lyrics` first when user wants a song but did not provide lyrics.
- Do not invent that music was generated without tool success.
- Do not embed raw audio or external audio URLs in final text.
- For cover/remix behavior, see HG-SPEC-013.

## Safety / kid-friendly rules

- Keep lyrics PG.
- Refuse or steer away from sexual lyrics, hate, self-harm, graphic threats.
- Cover/remix safety belongs to HG-SPEC-013.
- No autoplay. Always visible native audio controls.

## Open questions

1. Does `POST /v1/lyrics_generation` return structured sections or plain text for our plan/account?
2. Should `lyrics_optimizer` be exposed as a UI checkbox, or internal-only?
3. Should generated lyrics be saved as reusable drafts outside chat history?
4. Does music generation take long enough to require async/progress UI?

## Suggested v1 slice

Do **not** start with cover/remix.

V1:

1. Fix `generate_music` payload to current docs.
2. Add `generate_lyrics` tool.
3. Add Create→Music “Write lyrics for me” button.
4. Keep `music-cover` out of this implementation; see HG-SPEC-013.

Why:

- Lyrics generation ties directly into current failing music flow.
- It is easy to explain to kids.
- It is text-only, low storage risk.
- Cover/remix is split into HG-SPEC-013 because it needs YouTube/audio ingestion research plus a rights/safety model.

## Acceptance criteria

- Empty lyrics generate instrumental music using `is_instrumental: true` and no `lyrics` field.
- Non-empty lyrics generate song using `is_instrumental: false` and `lyrics`.
- Create UI has a kid-friendly lyrics-generation action.
- Agent can call `generate_lyrics` and then `generate_music` in one turn when useful.
- Generated lyrics are visible/editable before UI spends music quota when user starts from Create UI.
- Music assets save local audio file and compact DB message only.
- No raw audio bytes enter agent context or chat history.
- Tests cover payload shape, lyrics tool, UI flow, and history/asset persistence.

## Tests needed

- Unit: `generate_music` payload shape for instrumental vs lyrics.
- Unit: `generate_lyrics` request/response handling.
- Unit: Create UI empty lyrics → music request with no lyrics param.
- Unit: Create UI “Write lyrics for me” populates lyrics field.
- Agent unit: song request can sequence `generate_lyrics` → `generate_music`.
- Integration: generated music from lyrics saves asset and compact tool message.
- Cover tests belong to HG-SPEC-013.
