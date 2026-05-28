---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-016"] }
---

Repro: paste an image from clipboard into chat input. Nothing uploads, no preview appears, no image-aware chat/analyze turn starts.
Cause: chat input only handles text input/keydown. Image upload path exists only in Create → Analyze file/drop flow from HG-ISSUE-077. No chat paste handler maps clipboard image → asset storage → compact chat/tool summary.
Fix: chat paste stores clipboard image as asset, rejects bad files, and starts analyze tool with `/asset/{id}`. No raw `data:` in message/tool body. Regression: `test/unit/app.test.ts`, `test/unit/static.test.ts`, `e2e/run-e2e.ts`. Cross-ref HG-ISSUE-077, HG-ISSUE-053, HG-ISSUE-050.
