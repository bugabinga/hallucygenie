# HG-SPEC-010: YouTube API integration

## Problem

Kid is gaming YouTuber.
YouTube integration could help with creator inspiration, titles, thumbnails,
asset planning.
But app is not a video editor.
Scope must stay small.

## Design decisions

- Use:
  YouTube Data API v3, oEmbed, public page metadata.
- extends existing `web_search`.
- No separate YouTube UI/widget/tool.
- If query or returned result contains a YouTube video URL, server enriches
  result via oEmbed.
- Enrichment fields:
  title, author name, thumbnail URL, source URL.
- Agent may use metadata for inspiration only.
- Raw YouTube media is never fetched by this spec.
- No YouTube API key.
  No OAuth.
  No comments, upload, analytics.
- Results capped at 5.
  YouTube oEmbed enrichment capped at 2 videos per search.
- No channel recent.
  No search scraping.
  No infinite scroll.
