# HG-SPEC-010: YouTube API integration research

## Problem

Kid is gaming YouTuber. YouTube integration could help with creator inspiration, titles, thumbnails, asset planning. But app is not a video editor. Scope must stay small.

## Design decisions

- Research only. No implementation until research reviewed.
- Evaluate: YouTube Data API v3, oEmbed, public page metadata.
- Likely v1: `youtube_video_info` (paste URL → title/thumbnail/channel) and `youtube_channel_recent` (recent titles).
- API key only. No OAuth in v1. No comments, upload, analytics.
- Results capped at 5. Safe-search. No infinite scroll.
