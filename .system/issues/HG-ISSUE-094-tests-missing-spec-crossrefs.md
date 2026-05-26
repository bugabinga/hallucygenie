---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: fixed. `test/unit/spec-xrefs.test.ts` maps HG-SPEC-001 through HG-SPEC-016 to owning test files.
Cause: test files asserted spec behavior but did not point to source specs. Violated system XRefs: tests point to specs.
Fix: added central test/spec crossref map; no spec outgoing refs added.
