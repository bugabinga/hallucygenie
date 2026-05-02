# HG-SPEC-005: Local draft + UI state persistence

**Status:** Open

## Tickets

- `HG-TICKET-006-local-draft-ui-state-persistence.md` (superseded)
- `HG-TICKET-024-chat-draft-db-state.md`
- `HG-TICKET-025-create-draft-db-state.md`
- `HG-TICKET-026-recent-error-toast-ttl.md`
- `HG-TICKET-027-streaming-scratch-recovery.md`

## Goal

Treat user input as precious. Preserve drafts and useful UI state across reloads/crashes while keeping canonical conversation/tool state on the server.

## Verdict status

**Revised after devil review.** State ownership, server/client merge, draft IDs, and Create-history dependency are now explicit.

## User principle

> User input is holy. Never forget it if possible.

## Dependencies

- Create draft clearing after tool success depends on `HG-SPEC-006` tool input history IDs.
- Server-side thinking persistence requires DB/history changes.
- Historical media tool-result id bugs are fixed; keep regression coverage around tool success signals.

## State ownership

### Client-owned state (`localStorage`)

State that exists before server acceptance or only affects local UI:

- unsent chat draft
- unsent Create form drafts
- selected Create tab
- active modal/tab UI preferences
- in-progress stream scratch before server confirms/persists it
- recent client-visible error toast with TTL
- profile fields/avatar from `HG-SPEC-003`

Client-owned state must not be required for server correctness.

### Server-owned state (SQLite/history)

State that is part of conversation truth or generated content:

- accepted user messages
- assistant text
- assistant thinking blocks after emitted/accepted
- tool call starts/results
- generated asset metadata and saved files
- tool input history from `HG-SPEC-006`
- usage/quota counters

Server-owned state is restored via `/api/history`, `/assets`, and `/api/create-history`, not permanently duplicated in `localStorage`.

### Shared/bridged state

Some state starts client-owned and becomes server-owned after handoff:

- Chat draft → accepted user message after request completes successfully
- Create draft → tool history item → asset/tool result success
- In-progress thinking → server history after stream chunk/message persisted
- Error from failed stream → client toast + server log

Rule: never delete client draft until server-owned successor exists and operation succeeds.

## Storage key

Namespace by session to avoid cross-session draft leaks:

```text
hallucygenie_ui_state_v1:${sessionId}
```

## Local state shape

```ts
type LocalUiState = {
  version: 1;
  sessionId: string;
  updatedAt: number;
  chatDraft: {
    draftId: string;
    text: string;
    submittedAt?: number;
    requestId?: string;
    status: "editing" | "submitted" | "failed";
  };
  createDraft: {
    draftId: string;
    tab: "image" | "music" | "voice" | "search";
    imagePrompt: string;
    imageRatio: string;
    musicPrompt: string;
    musicLyrics: string;
    musicInstrumental: boolean;
    voiceText: string;
    voiceSpeed: string;
    searchQuery: string;
    submittedHistoryId?: string;
  };
  inProgressThinking: Array<{
    clientMessageId: string;
    content: string;
    open: boolean;
    updatedAt: number;
  }>;
  error: {
    message: string;
    shownAt: number;
    dismissed: boolean;
  } | null;
};
```

## Persisted client state

### 1. Main chat input

Persist:

- `#chat-input` value
- draft id/status

Restore on page load before user starts typing.

Clear only after stream completes with `done` and no error. If stream starts then fails, restore/keep draft as failed/submitted retryable text.

### 2. Create popup inputs

Persist all Create modal fields:

- selected tab
- image prompt
- image aspect ratio
- music prompt
- lyrics
- instrumental flag
- voice text
- speed
- search query
- any future Create params

Clear only the submitted form after matching tool history item is `succeeded`.

### 3. Thinking blocks

Durable completed thinking belongs to server history.

Local state stores only in-progress thinking as crash/reload protection:

- thinking text emitted during active stream
- `<details>` open/closed state
- client message id

### 4. Error messages

Persist latest user-visible error:

- message
- timestamp
- dismissed flag

On reload:

- show recent undismissed error
- ignore dismissed or expired errors

TTL: 10 minutes.

## Restore precedence

On page load:

1. Load server-owned state:
   - `/api/history`
   - `/assets`
   - `/api/create-history`
2. Load client-owned state from session-scoped `localStorage`.
3. Merge carefully:
   - never duplicate a draft already accepted in server history
   - never overwrite non-empty DOM input
   - keep failed/unsent drafts
   - keep recent client errors within TTL
   - clear Create form only if matching history/tool success exists

String matching alone is not enough. Use `draftId`, request id, message id, or `createHistoryId` where possible.

## Multi-tab behavior

Multiple tabs can edit same session.

Simple v1 strategy:

- local state has `updatedAt`
- last write wins for empty DOM fields only
- if current tab has dirty non-empty field, do not overwrite from storage event
- listen to `storage` event only to update history/error indicators, not active text fields

## Write strategy

Debounced writes:

```text
150–300ms
```

Flush immediately on:

- submit
- modal close
- tab change
- `visibilitychange`
- `pagehide`

## Versioning and corruption

If parse fails or version/session mismatch:

- ignore invalid state
- do not throw
- optionally back up raw bad value under `hallucygenie_ui_state_bad_<timestamp>`

## Size control

- Cap in-progress thinking per message: 20KB.
- Cap client-side in-progress thinking messages: last 3.
- Server history owns durable thinking retention/trimming.
- Cap error string: 2KB.
- Cap text drafts per field through UI validation where practical.

## Privacy

- Drafts/profile are local to browser+session.
- No cross-session sync.
- No visible “Clear drafts” button for this feature.
- Removing history belongs to `HG-SPEC-006`, not draft persistence.

## UX requirements

- Reload after typing in chat → draft remains.
- Reload after filling Create form → fields remain.
- Reload during stream → draft/in-progress thinking preserved as much as feasible.
- Reload after completed thinking → server history restores thinking block.
- Reload after error → recent error visible unless dismissed/expired.
- User can manually clear fields.
- Persistence must not create layout shift.

## Tests

### Unit/frontend

Add/update `test/app.test.ts`:

- typing chat input saves state under session key
- reload/init restores chat input
- chat draft survives stream error
- chat draft clears only on done/no-error
- create form fields save/restore
- selected create tab saves/restores
- create draft clears only when matching history success exists
- state parse failure does not crash
- non-empty DOM value is not overwritten by restore
- error toast saves/restores within TTL
- expired/dismissed error ignored
- in-progress thinking saves/restores with open state
- caps/truncation apply

### Backend/unit

- server history can store/return thinking blocks
- completed thinking restored via `/api/history`

### Static

- localStorage key centralized
- no scattered ad-hoc state keys except session/profile keys

### E2E

- fill chat input → reload → value remains
- failed chat stream → draft remains
- successful chat stream → draft clears
- fill Create modal → reload → open modal → values remain
- mocked tool success with history id → corresponding Create form clears
- trigger/show error → reload → recent error visible
- server history restores completed thinking blocks with mocked SSE

## Acceptance criteria

- [ ] Main chat draft survives reload.
- [ ] Chat draft clears only after successful stream completion.
- [ ] Create modal drafts survive reload.
- [ ] Selected Create tab survives reload.
- [ ] Create form draft clears only after corresponding asset/tool success.
- [ ] Completed thinking blocks persist in server history.
- [ ] In-progress thinking has local crash protection.
- [ ] Recent error survives reload with TTL.
- [ ] Dismissed/expired error does not reappear.
- [ ] Invalid stored state does not crash app.
- [ ] Storage writes are debounced/flushed on unload.
- [ ] Session-scoped keys prevent cross-session draft leaks.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] `just test-e2e` passes.

## Decisions

1. Successful Create submit clears only that form after asset/tool generation succeeds.
2. Thinking blocks persist in server message history; frontend local state only protects in-progress edge cases.
3. No visible “Clear drafts” button.
