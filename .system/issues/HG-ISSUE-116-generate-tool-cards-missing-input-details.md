---
{ "status": "fixed", "specs": ["HG-SPEC-008", "HG-SPEC-006", "HG-SPEC-011"] }
---

Repro: generate an asset through chat/Create and inspect the resulting generate-style tool widget. Card shows result preview/action, but no collapsed details element exposing the input params used to create the asset.
Cause: structured tool input is stored for history/assets, but result widgets render only compact media result UI and omit a reusable param summary.
Fix: tool result SSE/history now carries structured input into the card renderer. Cards show closed-by-default sanitized input `<details>` and drop raw `data:` values, keys, tokens, secrets, and provider internals. Covers image, music, voice, lyrics, music-cover, analyze, and search. Added unit, static, integration, and Chrome E2E regressions. Cross-ref HG-ISSUE-066, HG-ISSUE-079, HG-ISSUE-080, HG-ISSUE-115.
