---
{ "status": "open", "specs": ["HG-SPEC-016", "HG-SPEC-008", "HG-SPEC-006", "HG-SPEC-011"] }
---

Repro: open Create → Image, set “How many pictures?” to 2 or 4, generate. MiniMax `n` is available in Create input, but chat/tool output and asset flow show one image.
Cause: image tool sends `payload.n`, then discards every returned URL except the first: `return { type: "image", content: urls[0] }`. Downstream tool result/asset model stores one image URL per result, so multi-image responses collapse to one visible asset.
Fix: make image generation return/store/render all generated image URLs as separate assets or a single multi-image result group. Count image quota by requested `n`, preserve params/history, and add tests for 2/4 image Create output. Cross-ref HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-119.
