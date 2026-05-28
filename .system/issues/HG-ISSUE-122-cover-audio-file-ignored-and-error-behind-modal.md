---
{ "status": "fixed", "specs": ["HG-SPEC-013", "HG-SPEC-004", "HG-SPEC-015"] }
---

Repro: open Create → Music, choose an audio file, leave Source on Audio URL or YouTube link, click Prepare cover lyrics. UI shows `Paste an audio or YouTube URL first 🎵` in blurred background behind Create modal; no `/api/music-cover/preprocess` POST reaches server.
Cause: Prepare handler trusts Source dropdown over selected file. File input can contain a file while `source_kind !== upload`, so validation wrongly demands URL. Error toast/global status layer is below modal/backdrop z-order.
Fix: choosing audio file selects upload; prepare prefers selected file; URL/file controls hide by source; toast z-index exceeds modal. Regression: `test/unit/app.test.ts`, `test/unit/static.test.ts`, `e2e/run-e2e.ts`. Cross-ref HG-ISSUE-092, HG-ISSUE-118, HG-ISSUE-078, HG-ISSUE-117.
