---
{ "status": "open", "specs": ["HG-SPEC-011", "HG-SPEC-016"] }
---

Repro: paste an image from clipboard into chat input. Nothing uploads, no preview appears, no image-aware chat/analyze turn starts.
Cause: chat input only handles text input/keydown. Image upload path exists only in Create → Analyze file/drop flow from HG-ISSUE-077. No chat paste handler maps clipboard image → asset storage → compact chat/tool summary.
Fix: add chat paste image flow that stores clipboard image as asset, never stores raw bytes in messages/context, then starts an analyze/chat turn with `/asset/{id}`. Add UI status, type/size rejection, and tests for no raw `data:` leakage. Cross-ref HG-ISSUE-077, HG-ISSUE-053, HG-ISSUE-050.
