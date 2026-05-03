---
description: Create a new spec
---

Idea: $ARGUMENTS

Search `.system/specs/` and `.system/issues/` for related work.
Cross-reference by ID.

Draft the spec. Ultra-terse style. No filler. No hedging.
Every sentence must carry information. Cut anything a reader could infer.

Structure:

- Status: Open
- Created: date
- Scope: affected files/paths
- Problem (what's wrong / what's needed)
- Design decisions (fonts, UX, visual judgment — things tests can't verify)
- Behavioral contracts (testable outcomes → reference test file paths)
- Cross-references to related specs and issues

File naming: `HG-SPEC-NNN-slug.md` where NNN is next available number.

Output the draft with footer showing exact save path:
`.system/specs/HG-SPEC-NNN-slug.md`

Do NOT write to `.system/specs/`.
Wait for user review.
If user rejects, incorporate feedback, preserve cross-references, redraft.
