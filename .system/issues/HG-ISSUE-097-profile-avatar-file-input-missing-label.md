---
{ "status": "fixed", "specs": ["HG-SPEC-015"] }
---

Firefox manual audit found `#profile-avatar-upload` has `aria-label` but no associated `<label>`.
Spec requires labels for all form controls.
Fix: added `.sr-only` `<label for="profile-avatar-upload">`; added static + integration label audits.
