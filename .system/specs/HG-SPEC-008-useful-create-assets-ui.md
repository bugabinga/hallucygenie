# HG-SPEC-008 — Useful Create→Assets UI

**Status:** Open
**Created:** 2026-05-01
**Scope:** `public/app.ts`, `public/style.css`, `src/server.ts`, `src/db.ts`, migrations, tests

## Tickets

- `HG-TICKET-012-generated-profile-avatar-asset.md`
- `HG-TICKET-033-asset-params-db.md`
- `HG-TICKET-034-assets-api-details.md`
- `HG-TICKET-035-assets-image-card-download.md`
- `HG-TICKET-036-assets-audio-controls.md`
- `HG-TICKET-037-assets-card-polish.md`
- `HG-TICKET-050-music-asset-params-lyrics.md`

## Problem

Create→Assets is currently too thin to be useful.

It shows small cards with a prompt snippet and minimal icon/thumbnail. The kid cannot easily remember what each asset was, what parameters created it, preview it reliably, or download it.

Assets are supposed to be a media library, not just a debug list.

## Goal

Make Create→Assets useful for an 11-year-old creator:

- Help remember what the asset was
- Show key generation details/params
- Preview the media appropriately by type
- Make download obvious and easy
- Audio previews must be interruptible/natural (use real HTML audio controls)

## Current UI

`loadAssets()` renders:

- image → thumbnail image
- audio/music → emoji icon
- prompt snippet
- click image → lightbox
- click audio/music → `new Audio(url).play()`

Problems:

- Music/voice has no visible player or duration
- Audio playback is hidden and hard to stop
- No download button
- Only prompt shown, and truncated
- Params are not shown
- Cards do not clearly explain media type/tool/model/settings
- Click behavior is too implicit

## Desired UI

Each asset card should show:

- Media type badge: Image / Voice / Music
- Preview area:
  - Image: thumbnail; click opens lightbox
  - Voice/Music: `<audio controls preload="metadata">`
- Prompt/title text
- Tool name, model, created date/time
- Important params used to generate it
- File size/duration if available
- Download button/link

## Preview behavior

### Image

- Card preview: `<img>` thumbnail
- Click thumbnail/card preview → open lightbox
- Lightbox should show full image
- Download button downloads original asset

### Voice / Music

- Card preview: real `<audio controls preload="metadata" src="...">`
- Do **not** use hidden `new Audio(...).play()` for asset library previews
- Native controls make playback interruptible (pause/seek/stop by starting another audio where browser behavior allows)
- Download button downloads MP3

## Download behavior

Each card needs a visible download action:

```html
<a href="/asset/{id}" download="...">Download</a>
```

After DB-first state spec, URLs should not require session query params. Until then, include whatever auth/session URL is required.

Suggested filename:

```txt
hallucygenie-{type}-{created_at}-{short-id}.{ext}
```

## Params to display

Assets should include generation params in the UI.

Current `assets` table stores:

- `id`
- `session_id`
- `type`
- `filename`
- `mime_type`
- `prompt`
- `tool_name`
- `size_bytes`
- `created_at`

Missing params:

### Image

- model (`image-01`)
- aspect ratio
- prompt

### Voice

- model (`speech-2.8-hd`)
- voice id
- speed
- volume
- pitch
- text

### Music

- model (`music-2.6`)
- prompt
- lyrics present? / excerpt
- instrumental

## Data model

Add a JSON params column to assets:

```sql
ALTER TABLE assets
ADD COLUMN params_json TEXT;
```

When saving an asset, persist original tool args + model/tool metadata. Example:

```json
{
  "model": "image-01",
  "prompt": "wizard cat",
  "aspect_ratio": "1:1"
}
```

For audio:

```json
{
  "model": "speech-2.8-hd",
  "text": "...",
  "voice_id": "English_expressive_narrator",
  "speed": 1,
  "volume": 1,
  "pitch": 0
}
```

For music:

```json
{
  "model": "music-2.6",
  "prompt": "dark Minecraft boss theme",
  "lyrics": "...",
  "instrumental": true
}
```

Keep JSON display simple. No schema framework.

## Server/API changes

`GET /assets` should return enough fields for UI:

- current fields
- `params` object parsed from `params_json`
- `url` or stable asset URL
- `download_url`

Or keep URL generation frontend-side if DB-first state removes session tokens.

## UI layout idea

```txt
┌──────────────────────────────┐
│ [Image]       2026-05-01     │
│ ┌ thumbnail ┐                │
│ │          │  wizard cat     │
│ └──────────┘  image-01 · 1:1 │
│ Prompt: wizard cat in lava   │
│ [Preview] [Download]         │
└──────────────────────────────┘
```

Audio/music:

```txt
┌──────────────────────────────┐
│ [Music]       2026-05-01     │
│ dark boss theme              │
│ <audio controls>             │
│ music-2.6 · instrumental     │
│ [Download]                   │
└──────────────────────────────┘
```

## UX rules

- Do not auto-play audio on card click
- Audio preview must use visible native controls
- Card click should not hijack clicks on audio controls/download links
- Long prompts/lyrics should be collapsible or truncated with title tooltip
- Cards should be compact but readable on mobile
- Empty state should suggest what to create next

## Relationship to open issues/specs

This spec depends on or overlaps:

- HG-ISSUE-007 — audio asset URLs/playback
- HG-ISSUE-009 — assets tab missing media
- HG-ISSUE-011 — generated images not saved as assets
- HG-SPEC-007 — DB-first single-user state

Implementing DB-first first will simplify URLs and download links.

## Acceptance Criteria

- Assets tab shows images, voice, and music
- Image cards show thumbnails and lightbox preview
- Voice/music cards show real native audio controls
- Audio can be paused/interrupted via visible controls
- Every asset has visible Download action
- Prompt and important params are visible
- Params are persisted in DB and survive reload
- No hidden `new Audio(...).play()` for asset library previews
- Mobile layout remains usable

## Tests Needed

- Migration test: `assets.params_json` exists
- Unit: asset params saved for image/music/TTS
- Unit: `loadAssets()` renders params and download links
- Unit: audio assets render `<audio controls preload="metadata">`
- Unit: image assets render thumbnail + download link
- E2E: generate/download/preview image asset
- E2E: generate/play/pause/download audio asset
