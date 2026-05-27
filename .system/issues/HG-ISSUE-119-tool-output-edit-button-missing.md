---
{ "status": "fixed", "specs": ["HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-016"] }
---

Repro: inspect any generated tool output widget in chat/history/Create results. No small edit/tweak button exists to reopen the matching Create tab with the original input parameters filled.
Cause: Create history can fill forms, and assets store params, but rendered tool output widgets do not expose a direct edit affordance wired to structured tool input.
Fix: generated tool cards now show a compact Tweak button when sanitized input exists. It opens Create, switches to the matching tab, fills the original params, persists the draft, and preserves raw-media boundaries. Covers image, music, voice, lyrics, music-cover, analyze, and search. Added unit, static, integration, and Chrome E2E regressions. Cross-ref HG-ISSUE-043, HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-117.
