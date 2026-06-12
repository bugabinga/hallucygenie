# HG-SPEC-003: DB-owned user profile + avatar

## Design decisions

- Default avatar:
  🎮 (gaming YouTuber, not gendered), if no asset ref.
- Profile fields:
  username (40), interests (300), hates (300), favorites (300), avatar (asset
  ref).
  - `interests`:
    topics Genie should mention/use for ideas.
  - `favorites`:
    visual/audio style ingredients for generated media.
- API:
  `GET/PUT/DELETE /api/profile`.
  Server validates types/caps, trims, rejects raw asset data.
- Server injects profile into system prompt as quoted preference data, not
  instructions.
  Under 500 chars.
  No avatar data.
