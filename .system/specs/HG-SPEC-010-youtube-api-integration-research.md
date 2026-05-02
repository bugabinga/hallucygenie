# HG-SPEC-010 — Research YouTube API integration for small creator tools

**Status:** Open
**Created:** 2026-05-01
**Scope:** Research first. Possible future: `src/tools.ts`, `src/agent.ts`, `src/server.ts`, `public/app.ts`, DB migrations, tests

## Problem

HallucyGenie is for an 11-year-old gaming YouTuber. YouTube integration could help with creator inspiration, titles, thumbnails, and asset planning.

But the app is **not** a video editor and not for uploading/managing videos. Scope must stay small and useful.

## Goal

Research YouTube API integration and identify safe, useful, small-scope tools that help a kid create assets and ideas around YouTube content.

The research should answer:

- Which YouTube APIs are useful?
- Which features need API key only vs OAuth?
- Which use cases are actually useful for a kid creator?
- Which use cases are too risky/large/out of scope?
- What is the smallest useful v1?

## Non-goals

Do **not** build:

- Video upload tool
- Video editor
- Comment moderation bot
- Comment reading/summarization for kids
- Subscriber analytics dashboard
- Monetization/revenue tracking
- YouTube account management
- Automatic posting/publishing
- Mass scraping
- Anything requiring broad OAuth scopes in v1

## Research targets

### YouTube Data API v3

Research:

- Search videos by query
- Fetch video metadata by ID
- Fetch channel metadata
- Fetch recent uploads from channel
- Fetch thumbnails/title/description/tags/category where available
- Quotas/cost per endpoint
- API key requirements
- OAuth requirements
- Terms/policy constraints

### YouTube Analytics API

Research only. Likely out of v1 because OAuth + account data.

Questions:

- Can it help with creator planning?
- What OAuth scopes are required?
- Is it worth it for a kid-focused asset app?

### YouTube oEmbed / public page metadata

Research lightweight alternatives:

- oEmbed endpoint for title/thumbnail/author
- No API key maybe enough for a URL-import feature
- Compare reliability and limits

## Kid-useful use cases to evaluate

### 1. Import a YouTube video URL as context

User pastes video URL → app fetches title, thumbnail, channel, description excerpt.

Useful for:

- Generate matching thumbnail ideas
- Generate sequel/spinoff title ideas
- Generate short description variants
- Generate image prompt based on video theme

Small scope. Likely best v1.

### 2. Channel recent videos inspiration

User gives channel URL/handle → app lists recent video titles/thumbnails.

Useful for:

- Remember own recent themes
- Avoid duplicate titles
- Create asset prompts in same style
- Generate next-video idea list

Must avoid doom-scrolling/trend addiction. Keep it focused.

### 3. Topic search for safe inspiration

Search YouTube for a topic like `minecraft cat boss` → return a few video titles/thumbnails.

Useful for:

- Title pattern inspiration
- Thumbnail composition ideas
- Trends around a game/topic

Risk:

- Search results may include unsafe content
- Requires strict safe-search options if available
- Results should be minimal and filtered

### 4. Thumbnail reference helper

Given a video URL, show thumbnail and let user ask:

- “Make a prompt for an image like this but original”
- “What colors/composition does this thumbnail use?”
- “Generate 5 thumbnail concepts inspired by this”

Useful because app creates assets, not videos.

### 5. Title pattern helper

Fetch titles from own/referenced videos → identify patterns:

- mystery
- challenge
- boss fight
- story
- POV
- countdown

Then generate new title ideas.

Small and aligned with current chat behavior.

## Likely v1 tool set

Keep tiny:

### `youtube_video_info`

Input:

```json
{ "url_or_id": "https://www.youtube.com/watch?v=..." }
```

Output:

```json
{
  "title": "...",
  "channel": "...",
  "thumbnail_url": "...",
  "description_excerpt": "...",
  "published_at": "..."
}
```

### `youtube_channel_recent`

Input:

```json
{ "channel_url_or_handle": "@channel", "limit": 5 }
```

Output: recent titles/thumbnails only.

### Optional later: `youtube_search_inspiration`

Input:

```json
{ "query": "minecraft cat boss", "limit": 5, "safe": true }
```

Output: titles/thumbnails/channel names.

## UI ideas

Do not make a giant YouTube dashboard.

Possible simple additions:

- Create modal tab: `YouTube`
- Paste YouTube URL field
- “Use as inspiration” button
- Result card with title + thumbnail + channel
- Buttons:
  - “Make thumbnail prompts”
  - “Make title ideas”
  - “Make image asset prompt”

Or keep as chat tools only first.

## Safety / privacy rules

- Prefer API key / public metadata first
- Avoid OAuth in v1
- No reading comments in v1
- No posting or account modification
- Do not store YouTube auth tokens until absolutely necessary
- Do not show large feeds or infinite scroll
- Treat fetched content as untrusted text
- Sanitize rendered metadata
- Keep results small (`limit <= 5`)

## Config

If implemented:

- `process.env.YOUTUBE_API_KEY`
- Fail gracefully if missing
- Do not require it for app startup unless tool is enabled
- Never log API key

## Research deliverable

Create `.system/research/YT-API-INTEGRATION.md` with:

- API options summary
- Auth requirements
- Quota/cost notes
- Useful kid-focused use cases
- Out-of-scope/risky use cases
- Recommended v1
- Open questions
- Links to docs reviewed

## Acceptance Criteria

Research phase complete when:

- Useful APIs identified
- Auth model known
- Quota basics documented
- Small v1 tool set proposed
- Safety and kid-appropriateness reviewed
- Clear build/no-build recommendation written

Implementation phase should not start until research is reviewed.

## Tests Needed If Implemented

- Unit: parse YouTube video IDs from URL variants
- Unit: parse channel handle/channel URL variants
- Unit: tool returns friendly error when API key missing
- Unit: tool clamps `limit` to safe max
- Unit: metadata output sanitized/trimmed
- Integration: mocked YouTube API video info
- Integration: mocked channel recent videos
- Frontend: YouTube result card renders title/thumbnail safely
