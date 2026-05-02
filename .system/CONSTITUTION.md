# HallucyGenie Constitution

Strong prompt. Read before code. Obey unless user overrides.

## Law

- Simple feature. Simple code. No "backwards compat" unless spec says. No
  future-proof.
- Fail fast and loud. Bad state → throw, crash, or hard error. Graceful only
  when spec says.
- Low complexity. Avoid deep OOP hierarchies. No clever abstraction. No one-use
  indirection.
- Plain data. Plain functions. Guard clauses. Direct flow.
- Tiger style: /skill:tiger. Direct path. Explicit return. Immediate error.
- Raw asset bytes stay in asset storage.
- Never put raw asset data in agent context or chat history.
- Tests prove invariants.

## Review

Reject violations unless spec names the reason.
