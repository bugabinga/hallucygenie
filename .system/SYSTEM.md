# System

Five layers.
No overlap.
No drift.

```
MISSION    → why this exists
RULES      → how to build
SPECS      → what to build
RESEARCH   → fetched knowledge cache
ISSUES     → bug memory
```

## Ownership

- MISSION, RULES, specs:
  human-only.
  Agent cannot write.
- Issues, research:
  agent can create/update.

## XRefs

One direction only.
Issues point to specs.
Tests point to specs.
Specs are leaf nodes.
No status, no metadata, no outgoing refs.

## Issue format

```markdown
---
{ "status": "open", "specs": ["HG-SPEC-NNN"] }
---

Repro, cause, fix. Terse.
```

Required fields:
`status` (open|fixed), `specs` (array of spec IDs).

## Naming

- Specs:
  `{PREFIX}-SPEC-NNN-slug.md`
- Issues:
  `{PREFIX}-ISSUE-NNN-slug.md` PREFIX is project-specific.

## Style

Ultra-terse.
No filler.
No hedging.
Every sentence carries information.
