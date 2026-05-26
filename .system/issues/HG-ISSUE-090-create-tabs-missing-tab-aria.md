---
{ "status": "fixed", "specs": ["HG-SPEC-015"] }
---

Repro: fixed. `public/index.html` create tab buttons have `role="tab"`, `aria-selected`, `aria-controls`, ids, and panel linkage; `setCreateTab()` updates selected state, tabindex, class, and hidden panels.
Cause: visual tab UI was not wired as ARIA tabs. Related fixed issues: HG-ISSUE-046, HG-ISSUE-077.
Fix: implemented ARIA tabs and ArrowLeft/ArrowRight/Home/End keyboard switching with tests.
