---
{ "status": "open", "specs": ["HG-SPEC-015", "HG-SPEC-016", "HG-SPEC-014", "HG-SPEC-001"] }
---

Repro: open HallucyGenie at desktop/tablet size and read chat, Create controls, tool cards, headers, inputs, and dialogs. Default text and padding are too small/dense for children despite available space.
Cause: UI density is tuned like a compact developer app: small base font, tight controls/cards, narrow touch/read targets, and conservative spacing. Kid-readable sizing is not an explicit design contract.
Fix: add child-readable typography/spacing scale: larger base text, generous line-height, larger controls, bigger cards/tool widgets, wider readable layout where useful, and responsive exceptions for small screens. Add CSS/static/visual checks for min font sizes, control hit areas, and padding. Cross-ref HG-ISSUE-064, HG-ISSUE-071, HG-ISSUE-078, HG-ISSUE-115, HG-ISSUE-116.
