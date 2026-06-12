---
{ "status": "fixed", "specs": ["HG-SPEC-016", "HG-SPEC-021"] }
---

Repro: open Create → Voice after HG-ISSUE-138. Screenshot `/tmp/pi-clipboard-30b0e7da-3fb7-4c22-83fd-a28146da8079.png` shows the full interjection palette rendered as stacked buttons. The list is too tall and visually breaks the Voice tab; `chuckle`/`coughs` overlap under the cursor.

Cause: HG-ISSUE-120 expanded Voice interjections to 19 separate buttons. After long narration moved into Voice, the composer area became too dense.

Fix: collapse interjections into one `#voice-interjection` select plus `#voice-insert-interjection` button. Keep pause controls separate. Preserve exact MiniMax parenthesized insertion syntax and full 19-tag palette. Cross-ref HG-ISSUE-120, HG-ISSUE-138.
