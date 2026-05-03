# HG-SPEC-003: DB-owned user profile + avatar

## Design decisions

- Default avatar: 🎮 (gaming YouTuber, not gendered).
- Profile stored in SQLite only. No localStorage for profile fields/avatar.
- API: `GET/PUT/DELETE /api/profile`. Server validates types/caps, trims, rejects raw asset data.
- Profile fields: username (40), interests (300), hates (300), favorites (300), avatar (emoji or asset ref).
- Server injects profile into system prompt as quoted preference data, not instructions. Under 500 chars. No avatar data.
- Generated avatar: blocked until asset UI/API foundations land. Button disabled in modal.
