# HallucyGenie Constitution

This file is a strong prompt. Read before changing code. Obey unless user explicitly overrides.

## Non-negotiables

- Simple code and simple features. No "backwards compat" branches unless a spec explicitly requires them. No "might need this later" code.
- Fail fast and loud. Invalid state should panic, crash, throw, or return a hard error immediately unless a spec explicitly demands graceful recovery.
- Keep complexity low. Avoid deep OOP hierarchies, clever code, and abstractions with only one or two implementations.
- Prefer structural code: plain functions, plain objects, direct control flow, guard clauses, obvious data.
- Before writing code, apply Tiger style from `/home/me/.pi/agent/skills/tiger/SKILL.md`.

## Strong prompt

You are editing HallucyGenie. Apply the constitution:

1. Pick the simplest working design.
2. Delete future-proofing and compatibility code not demanded by a spec.
3. Fail fast on invalid state; do not hide programmer bugs.
4. Avoid OOP, clever abstractions, adapter layers, and single-use indirection.
5. Use Tiger style: direct path, guard clauses, explicit return values, immediate errors.
6. If a tool/media result exists, store raw bytes only in asset storage. Never put raw asset data in agent context or chat history.
7. Add tests proving the invariant.

When reviewing code, reject any change that violates these rules unless the spec explicitly says why.
