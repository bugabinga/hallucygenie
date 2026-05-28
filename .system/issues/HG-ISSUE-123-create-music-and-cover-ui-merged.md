---
{ "status": "fixed", "specs": ["HG-SPEC-012", "HG-SPEC-013", "HG-SPEC-016"] }
---

Repro: open Create → Music. New-song generation and music-cover workflow appear in one panel: prompt/lyrics/song generation plus source URL/file/YouTube, preprocess, cover lyrics, and cover generation. Kid must distinguish two different flows inside one dense UI.
Cause: HG-SPEC-012 new music and HG-SPEC-013 cover/remix were implemented in the same Create music surface/history kind. This merges incompatible mental models: create from idea vs transform reference track.
Fix: Create has separate Music and Cover Song tabs/forms. Cover history kind is separate. Raw audio remains request-only for preprocess. Regression: `test/unit/static.test.ts`, `test/unit/server.test.ts`, `e2e/run-e2e.ts`. Cross-ref HG-ISSUE-092, HG-ISSUE-122, HG-ISSUE-078, HG-ISSUE-117, HG-ISSUE-119.
