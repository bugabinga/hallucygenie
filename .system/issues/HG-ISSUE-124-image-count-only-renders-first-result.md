---
{ "status": "fixed", "specs": ["HG-SPEC-016", "HG-SPEC-008", "HG-SPEC-006", "HG-SPEC-011"] }
---

Repro: open Create → Image, set “How many pictures?” to 2 or 4, generate. MiniMax `n` is available in Create input, but chat/tool output and asset flow show one image.
Cause: image tool sends `payload.n`, then discards every returned URL except the first: `return { type: "image", content: urls[0] }`. Downstream tool result/asset model stores one image URL per result, so multi-image responses collapse to one visible asset.
Fix: image results now preserve multiple URLs, save each remote generated image as its own asset, persist multi-asset tool content, render a grid in chat, and count image quota by requested `n`. Added unit, server, integration, and Chrome E2E regressions for two generated images and asset previews. Cross-ref HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-119.
