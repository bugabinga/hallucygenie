# HG-SPEC-011: Constitution-driven simplification

## Problem

Media-tool bugs from rule violations: raw asset data entered agent context, error handling bubbled provider internals, tool path has too many overlapping modes, dead compat code.

## Design decisions

- One obvious media data path: tool → asset storage → compact summary in chat → agent gets summary only → UI renders from asset/ref.
- Raw bytes never in `messages.content` or agent context. Assert at DB/server boundary.
- Delete compat branches not required by accepted specs.
- Fail fast: invalid internal state throws. Graceful only at user boundary.
- Plain functions. No classes. No adapter hierarchies. No schema frameworks.
- Compact tool summaries for all persisted messages and model context.
