---
{ "status": "open", "specs": ["HG-SPEC-016", "HG-SPEC-004", "HG-SPEC-015"] }
---

Repro: open Create → Image and inspect the bottom controls around Surprise code, “Let Genie improve my idea before drawing”, helper text, and Generate image. Screenshot `/tmp/pi-clipboard-731e94d1-172e-4c3a-8244-09c3a36ad32b.png` shows related checkbox label/helper text separated too much, while helper text is closer to the Generate button than to its parent control.
Cause: Create form spacing uses uniform vertical margins instead of proximity rules. Related label/help/control elements are not grouped; unrelated action area lacks stronger separation.
Fix: add spacing scale by relationship: tight label+helper groups, medium within same control group, generous margins between independent groups/actions. Apply across Create forms/tool widgets with static/visual regression. Cross-ref HG-ISSUE-117, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-121.
