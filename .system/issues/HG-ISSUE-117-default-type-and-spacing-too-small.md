---
{ "status": "fixed", "specs": ["HG-SPEC-015", "HG-SPEC-016", "HG-SPEC-014", "HG-SPEC-001"] }
---

Repro: open HallucyGenie at desktop/tablet size and read chat, Create controls, tool cards, headers, inputs, and dialogs. Default text and padding are too small/dense for children despite available space.
Cause: UI density is tuned like a compact developer app: small base font, tight controls/cards, narrow touch/read targets, and conservative spacing. Kid-readable sizing is not an explicit design contract.
Fix: raised base text, message text, form labels, inputs, tabs, helper text, and toast layer. Regression: `test/unit/static.test.ts`, `e2e/run-e2e.ts`. Cross-ref HG-ISSUE-064, HG-ISSUE-071, HG-ISSUE-078, HG-ISSUE-115, HG-ISSUE-116.
