# HG-SPEC-005: DB-first draft + UI state persistence

**Status:** Open

## Tickets

- `HG-TICKET-006-local-draft-ui-state-persistence.md` (superseded)
- `HG-TICKET-024-chat-draft-db-state.md`
- `HG-TICKET-025-create-draft-db-state.md`
- `HG-TICKET-026-recent-error-toast-ttl.md`
- `HG-TICKET-027-streaming-scratch-recovery.md`

## Goal

Treat user input as precious. Preserve drafts and useful UI state across reloads/crashes while keeping canonical state in SQLite.

## Verdict status

**Revised for DB-first state.** Durable app state belongs in DB. `localStorage` is allowed only for exceptional client-only hints that are not app truth.

## User principle

> User input is holy. Never forget it if possible.

## Dependencies

- Create draft clearing after tool success depends on `HG-SPEC-006` tool input history IDs.
- Server-side thinking persistence requires DB/history changes.
- Profile fields/avatar are DB-owned by `HG-SPEC-003`.
- Active session/bootstrap state is DB-owned by `HG-SPEC-007`.

## State ownership

### DB-owned state

State that should survive reload, browser localStorage clearing, or normal single-user use:

- chat draft
- Create form drafts
- selected Create tab
- active modal/tab UI preferences that matter after reload
- profile fields/avatar from `HG-SPEC-003`
- accepted user messages
- assistant text
- assistant thinking blocks after emitted/accepted
- tool call starts/results
- generated asset metadata and saved files
- tool input history from `HG-SPEC-006`
- usage/quota counters

Restore DB-owned state via `/api/state`, `/api/history`, `/assets`, and future draft/profile/create-history routes.

### Allowed localStorage exceptions

LocalStorage may be used only for harmless client-only hints:

- `hg_onboarding_done`
- recent client-visible error toast with short TTL (`HG-TICKET-026`)
- temporary in-progress stream scratch only if no DB write point exists yet (`HG-TICKET-027`)

LocalStorage must not store:

- session id
- conversation id
- active user/profile
- assets/history identity
- durable drafts
- Create form history
- generated media bytes or data URLs

## DB draft model

Keep it simple. Either use `app_state` keys or a tiny singleton table.

Suggested `app_state` keys:

```text
chat_draft_json
create_draft_json
active_create_tab
```

Suggested chat draft shape:

```ts
type ChatDraft = {
  version: 1;
  text: string;
  updatedAt: number;
  status: "editing" | "submitted" | "failed";
  requestId?: string;
};
```

Suggested Create draft shape:

```ts
type CreateDraft = {
  version: 1;
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
  updatedAt: number;
};
```

## APIs

Minimum routes:

```text
GET /api/state          → active session metadata + small UI state
GET /api/draft/chat     → chat draft
PUT /api/draft/chat     → save chat draft
DELETE /api/draft/chat  → clear chat draft
GET /api/draft/create   → create draft
PUT /api/draft/create   → save create draft
DELETE /api/draft/create→ clear create draft
```

Use direct DB helpers. No state manager.

## Persisted state

### 1. Main chat input

Persist:

- `#chat-input` value
- status/request id where useful

Restore on page load before user starts typing.

Clear only after stream completes with `done` and no error. If stream starts then fails, keep draft as failed/submitted retryable text.

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
- future Create params

Clear only the submitted form after matching tool history item is `succeeded`.

### 3. Thinking blocks

Durable completed thinking belongs to server history.

Temporary in-progress thinking can use a client scratch only until server persistence exists. If kept locally, it must be capped and short-lived.

### 4. Error messages

Persist latest user-visible error as local client hint:

- message
- timestamp
- dismissed flag if implemented

On reload:

- show recent undismissed error
- ignore dismissed or expired errors

TTL: 10 minutes.

## Restore precedence

On page load:

1. Load DB-owned state: `/api/state`, `/api/history`, `/assets`, draft APIs.
2. Restore allowed client-only hints.
3. Never duplicate a draft already accepted in server history.
4. Never overwrite non-empty DOM input after user has typed.
5. Clear Create form only if matching history/tool success exists.

String matching alone is not enough. Use request id, message id, or `createHistoryId` where possible.

## Multi-tab behavior

Multiple tabs can edit same active session.

Simple v1 strategy:

- DB row has `updatedAt`
- last write wins only if current field is not dirty
- current tab does not overwrite dirty non-empty input with stale loaded data

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

If parse fails or version mismatch:

- DB draft read returns explicit safe empty state or 500 per boundary decision
- UI does not crash on safe empty state
- invalid local hint JSON is ignored and cleared

## Size control

- Cap draft text per field through UI/server validation.
- Cap in-progress thinking per message: 20KB.
- Cap client-side in-progress thinking messages: last 3.
- Server history owns durable thinking retention/trimming.
- Cap error string: 2KB.

## Privacy

- State is local to this single-user app instance and SQLite DB.
- Clearing browser localStorage must not delete DB profile, drafts, history, or assets.
- No cross-device sync.
- No visible “Clear drafts” button for this feature.
- Removing history belongs to session/history specs, not draft persistence.

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

- typing chat input saves draft via API
- reload/init restores chat input from API
- chat draft survives stream error
- chat draft clears only on done/no-error
- create form fields save/restore via API
- selected create tab saves/restores via API
- create draft clears only when matching history success exists
- API failure does not crash
- non-empty DOM value is not overwritten by stale restore
- error toast saves/restores within TTL
- expired/dismissed error ignored
- in-progress thinking scratch caps/truncation apply if local scratch remains
- no durable draft/profile/session localStorage keys exist

### Backend/unit

- chat draft CRUD stores normalized DB state
- create draft CRUD stores normalized DB state
- corrupted/oversized draft state fails loud or returns explicit safe empty per API contract
- server history can store/return thinking blocks
- completed thinking restored via `/api/history`

### Static

- no `hallucygenie_session_id` writes
- no durable draft/profile localStorage keys
- allowed localStorage keys are documented exceptions

### E2E

- type chat draft → reload → draft remains
- fill Create form → reload → form remains
- clear localStorage → DB-backed draft/profile state remains
- send message successfully → chat draft clears after server success
- failed stream keeps retryable draft

## Acceptance criteria

- [ ] Chat draft is DB-backed.
- [ ] Create draft is DB-backed.
- [ ] Durable profile/draft/session state is not in localStorage.
- [ ] Allowed localStorage exceptions are documented and tested.
- [ ] Reload restores DB-backed state.
- [ ] Clearing localStorage does not delete DB-backed state.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] `just test-e2e` passes.
