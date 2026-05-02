# HG-SPEC-011 — Constitution-driven simplification

**Status:** Open
**Created:** 2026-05-01
**Scope:** `src/agent.ts`, `src/server.ts`, `src/tools.ts`, `src/db.ts`, `public/app.ts`, tests, `.system/CONSTITUTION.md`, `AGENTS.md`

## Problem

Recent media-tool bugs came from constitution violations:

- Raw asset data entered agent context/history.
- Error handling bubbled raw MiniMax internals to user.
- Tool path has too many overlapping modes: chat-chosen tools, forced tool choice, direct Create directives, historical tool rows, asset saving, DB rows.
- Some code exists only for old compatibility or possible future use.
- Single-use helper layers make data ownership hard to reason about.

The concrete failure:

```txt
invalid params, context window exceeds limit (2013)
```

Root cause: after successful music/TTS tool calls, `runAgentLoop()` put raw `data:audio/mp3;base64,...` into the next model context. The model cannot use those bytes. They only explode context.

## Constitution applied

### Simplicity

There should be one obvious media data path:

```txt
Tool returns media bytes/URL → asset storage owns raw data → chat history stores compact summary/ref → agent context gets compact summary only → UI renders tool card from saved asset/ref
```

No duplicate raw-media path through `messages.content`.

### No speculative compatibility

Delete compatibility branches not required by an accepted spec. Examples to review:

- Browser-owned session fallback once DB-first state lands.
- Forced `tool_choice` path if direct Create directives make it unnecessary.
- Replayed historical tool protocol behavior if historical tool rows are never sent to MiniMax.
- Any helper abstraction with one caller and no clear invariant.

### Fail fast

Invalid internal state should fail loudly in server logs/tests:

- Attempting to save raw `data:` media into `messages.content` should throw in dev/test.
- Unknown media/tool result shape should throw or hard-error at boundary.
- Invalid explicit Create directive should return 400, not silently fall back to chat.
- Asset save failure should produce a clear tool error event, not pretend success.

Graceful user messaging is allowed only at user boundary. Internal code still fails hard.

### Low complexity

Use plain functions and obvious data:

- No classes.
- No tool-result adapter hierarchy.
- No generic storage abstraction.
- No schema framework.
- No clever parser beyond the exact Create directive grammar.

### Tiger style

Before implementation, read `/home/me/.pi/agent/skills/tiger/SKILL.md`.

Use guard clauses, explicit return values, immediate errors, and direct data flow.

## Strong-prompt mechanism

The constitution lives in `.system/CONSTITUTION.md` and is referenced from `AGENTS.md`.

Agents/humans must read it before planning or reviewing non-trivial changes. No wrapper command. The file itself is the prompt.

Static tests enforce:

- `AGENTS.md` points to `.system/CONSTITUTION.md`.
- Constitution includes fail-fast, no backwards-compat/future-proofing, Tiger style, low-complexity rules.

## Desired architecture

### Raw asset invariant

Raw image/audio/music bytes must only live in:

- `data/assets/...` files
- external provider URL returned directly by MiniMax image API until downloaded/proxied by asset storage
- `assets` table metadata fields, never raw bytes

Raw media must never live in:

- `messages.content`
- agent `localMessages`
- Anthropic `tool_result.content`
- frontend persisted history payload

### Tool result model context

Model receives compact tool summaries only:

```txt
Generated audio with text_to_speech. The UI displays it in a tool card.
```

Include useful metadata, not bytes:

- tool name
- media type
- prompt/text excerpt
- asset id/ref if needed
- failure text if tool failed

### Message persistence

Tool message rows should store compact summaries/refs, not raw media.

If UI needs media, load it from assets, not messages.

### Error policy

Internal errors:

- log exact error with reqId/sessionId/toolName
- fail hard in tests/dev for impossible state
- never silently coerce invalid internal state

User-facing errors:

- tool card error for tool failures
- concise chat text only when human action is useful
- no raw provider JSON unless debug mode/spec demands it

## Work items

1. Add `assertNoRawAssetDataInMessage(content)` in the DB/server boundary.
2. Use compact tool summaries for all persisted `tool` messages.
3. Make `saveMessage()` or server wrapper reject `data:image`, `data:audio`, huge base64 blobs.
4. Move asset metadata/ref creation into one direct function. No dual raw/compact save paths.
5. Remove `forcedToolNameFromPrompt()` if direct Create directives fully replace it.
6. Audit `src/agent.ts` for single-use abstractions and compatibility branches.
7. Audit `src/server.ts` for session/header fallback once HG-SPEC-007 lands.
8. Replace user-visible raw provider errors with concise UI-safe messages while preserving logs.
9. Add static/runtime tests for raw asset invariant.
10. Add integration test: music + TTS tool calls do not send `data:audio` to second model turn and do not persist raw audio in messages.

## Acceptance criteria

- No new `messages.content` row starts with `data:image`, `data:audio`, or `data:video`.
- Existing tests pass.
- New tests fail if raw media enters agent context or DB messages.
- Context-window provider error from media bytes cannot recur.
- Raw provider error JSON is not displayed in normal UI.
- `.system/CONSTITUTION.md` is the strong prompt and `AGENTS.md` points to it.
- `just check` and `just test-unit` pass.

## Non-goals

- Multi-user auth.
- Generic blob store.
- Complex error taxonomy framework.
- Backwards compatibility with poisoned old DB rows beyond one explicit cleanup/migration if needed.

## Tests needed

- Unit: compact tool-result fn never returns raw data URLs for media.
- Unit: DB/server boundary rejects raw asset data in message content.
- Unit: context-window errors are logged and not streamed as raw `[Error: API returned ...]`.
- Integration: media tool turn persists asset + compact tool message only.
- Integration: second model call after media tool lacks `data:audio`/`data:image`.
- Static: constitution prompt exists and is reachable via `just constitution`.
