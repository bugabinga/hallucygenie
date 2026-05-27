---
{ "status": "fixed", "specs": ["HG-SPEC-008", "HG-SPEC-015", "HG-SPEC-004"] }
---

Repro: open Create → Assets, click an image asset thumbnail. Image lightbox opens behind the Create dialog instead of above it.
Cause: overlay stacking order is wrong: lightbox z-index/backdrop layer is below Create modal, or lightbox is mounted inside a stacking context created by the dialog/modal content.
Fix: raised lightbox above modal stack with explicit z-index order. Added static, integration, and Chrome E2E regression for opening an asset image while Create → Assets stays open. Cross-ref HG-ISSUE-046, HG-ISSUE-090, HG-ISSUE-100, HG-ISSUE-117.
