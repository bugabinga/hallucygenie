---
{ "status": "open", "specs": ["HG-SPEC-013", "HG-SPEC-004", "HG-SPEC-015"] }
---

Repro: open Create → Music, choose an audio file, leave Source on Audio URL or YouTube link, click Prepare cover lyrics. UI shows `Paste an audio or YouTube URL first 🎵` in blurred background behind Create modal; no `/api/music-cover/preprocess` POST reaches server.
Cause: Prepare handler trusts Source dropdown over selected file. File input can contain a file while `source_kind !== upload`, so validation wrongly demands URL. Error toast/global status layer is below modal/backdrop z-order.
Fix: make source selection child-proof: choosing a file selects upload or prepare prefers selected file. Hide irrelevant URL/file control per source. Render errors inside Create modal or above modal layer with explicit z-index/focus/ARIA. Add UI regression for local upload preprocess. Cross-ref HG-ISSUE-092, HG-ISSUE-118, HG-ISSUE-078, HG-ISSUE-117.
