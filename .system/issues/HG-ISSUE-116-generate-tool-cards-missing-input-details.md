---
{ "status": "open", "specs": ["HG-SPEC-008", "HG-SPEC-006", "HG-SPEC-011"] }
---

Repro: generate an asset through chat/Create and inspect the resulting generate-style tool widget. Card shows result preview/action, but no collapsed details element exposing the input params used to create the asset.
Cause: structured tool input is stored for history/assets, but result widgets render only compact media result UI and omit a reusable param summary.
Fix: add closed-by-default `<details>` to all generate-style tool cards with sanitized input params from stored structured input/asset `params_json`; never include raw asset bytes, data URLs, keys, or provider internals. Cover image, music, voice, lyrics, music-cover, analyze where applicable. Cross-ref HG-ISSUE-066, HG-ISSUE-079, HG-ISSUE-080, HG-ISSUE-115.
