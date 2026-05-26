---
{ "status": "fixed", "specs": ["HG-SPEC-010"] }
---

Repro: fixed. `web_search` enriches YouTube video URLs from query/results with oEmbed metadata.
Evidence 2026-05-26 spec update: HG-SPEC-010 selects V1 as existing `web_search` enrichment only; no separate YouTube UI/widget/tool; oEmbed fields title, author name, thumbnail URL, source URL; no YouTube API key/OAuth/comments/upload/analytics; results capped at 5 and YouTube enrichment capped at 2 videos.
Cause: implementation was missing.
Fix: `web_search` detects YouTube video URLs in query/results, fetches oEmbed for at most 2, appends metadata, and has unit tests. Raw YouTube media is not fetched by this spec.
