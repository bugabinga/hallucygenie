---
{ "status": "open", "specs": ["HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-016"] }
---

Repro: inspect any generated tool output widget in chat/history/Create results. No small edit/tweak button exists to reopen the matching Create tab with the original input parameters filled.
Cause: Create history can fill forms, and assets store params, but rendered tool output widgets do not expose a direct edit affordance wired to structured tool input.
Fix: add compact Edit/Tweak button to generated tool widgets. It opens Create on the matching tab, fills sanitized params from tool history/asset `params_json`, preserves raw-media boundaries, and lets kid submit a modified copy. Cover image, music, voice, lyrics, music-cover, analyze where useful. Cross-ref HG-ISSUE-043, HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-117.
