# YouTube API integration research

**Ticket:** `HG-TICKET-038-youtube-api-research.md`  
**Spec:** `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** research-only recommendation

## APIs reviewed

- YouTube Data API v3
- YouTube Analytics API
- YouTube oEmbed endpoint
- Public watch/channel metadata behavior

## Findings

### Data API v3

Use for public video/channel metadata with API key, or private channel/account
data with OAuth.

Useful public endpoints:

- `videos.list` with `part=snippet,contentDetails,statistics`
- `channels.list` with `part=snippet,statistics`
- `search.list` for channel/video search

Costs matter. `search.list` is expensive compared with direct `videos.list`.
Prefer parsing known URLs and fetching exact IDs over search.

### Analytics API

Requires OAuth and channel ownership. Not v1. It adds account management,
privacy questions, consent screens, refresh tokens, and permissions that do not
fit the current single-user local app.

### oEmbed

No API key. Good for tiny public URL previews:

```txt
https://www.youtube.com/oembed?url={video_url}&format=json
```

Returns title, author, thumbnail HTML/URL-ish data. It does not return stats,
recent videos, or channel analytics.

## Auth

- Public exact-video metadata: API key.
- Own/private channel data: OAuth.
- oEmbed preview: no auth.

## Kid-useful safe v1

Build a URL parser and tiny preview helper first:

1. User pastes a YouTube video URL.
2. App extracts the video ID locally.
3. Server fetches oEmbed metadata.
4. Agent can use title/author/thumbnail as inspiration for original ideas.

This avoids OAuth, channel scraping, dashboards, and terms-sensitive media
extraction.

## Out of scope for v1

- OAuth/account connection.
- Analytics dashboards.
- Comment ingestion.
- Downloading/extracting YouTube audio/video.
- Recreating thumbnails exactly.
- Using copyrighted media as source material.

## Open questions

- Whether a later Data API key is worth quota/setup for statistics.
- Whether channel-recent video lists are useful enough without OAuth.
- Whether all YouTube features should stay behind explicit user-pasted URLs.

## Links reviewed

- https://developers.google.com/youtube/v3/docs
- https://developers.google.com/youtube/analytics
- https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- https://www.youtube.com/oembed
