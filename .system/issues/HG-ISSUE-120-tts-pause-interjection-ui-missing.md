---
{ "status": "fixed", "specs": ["HG-SPEC-016", "HG-SPEC-006", "HG-SPEC-008"] }
---

Repro: open Create → Voice. Try to add MiniMax TTS pause markers or interjections without memorizing syntax. UI has no mouse-based pause/interjection builder; kid must type `<#x#>` and tags manually.
Cause: TTS model supports pause markers and interjection tags, but HallucyGenie exposes voice text as plain text plus basic voice/speed/volume/pitch controls. No UI validates marker placement, duration range, model support, or supported interjection vocabulary.
Fix: Voice tab has pause picker/insert button and interjection palette. Pause insertion rejects edge/consecutive markers. Regression: `test/unit/app.test.ts`, `test/unit/static.test.ts`, `e2e/run-e2e.ts`. Cross-ref HG-ISSUE-054, HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-119.
