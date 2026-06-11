---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-004", "HG-SPEC-014", "HG-SPEC-015"] }
---

Repro: open app dialogs on desktop-height viewport. Profile screenshot `/tmp/pi-clipboard-4b7f0642-1532-472c-ab83-7e5dbad9473d.png` shows internal dialog scrollbar and Reset clipped below the fold. Same sizing defect applies to all dialogs.
Cause: dialog shells use a shared viewport budget that permits desktop internal scrolling for default content. Dialog sizing relies on scroll regions instead of fitting default dialog content.
Fix: dialog max-height now uses `calc(100dvh - 24px)` instead of 80/86dvh. Create panels are visible-flow on desktop and only become scroll owners under small-height media. Profile avatar/note spacing reduced so default actions fit. Static tests assert desktop budget and small-height overflow path. Cross-ref HG-ISSUE-060, HG-ISSUE-117, HG-ISSUE-126.
