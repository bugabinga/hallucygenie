# HG-SPEC-006: Create input history

**Status:** Open

## Goal

Let the child easily reuse previous image/music/voice/search tool inputs.

## Verdict status

**Revised after devil review.** History is server-owned, covers all media/search tool calls, includes origin/status, supports pagination and soft-hide removal, and depends on tool-call bug fixes.

## Problem

Create tools currently forget previous prompts/inputs from the UI perspective. A child may want to retry, tweak, or reuse older ideas without retyping.

## Dependencies

- General tool-result id bug must be fixed first or in same work: `HG-ISSUE-001`, `HG-ISSUE-005`, `HG-ISSUE-006`.
- Create UI should send structured metadata, not only natural-language prompts.
- Draft clearing in `HG-SPEC-005` depends on history ids/status.

## Decisions

1. History includes **all media/search tool calls**, not only Create modal submissions.
2. Items visually distinguish origin:
   - Create modal
   - normal chat prompt
   - agent-initiated tool call
3. Failed attempts stay forever until user removes/hides them.
4. Each item tracks and visualizes status: submitted/succeeded/failed.
5. History items are not edited inline; click/tap loads item into matching form.
6. History items can be removed from history via soft hide.
7. Removing from history does not delete chat messages, assets, or usage records.

## Origin rules

Use deterministic origin classification:

- `create`: submitted from Create modal with structured create metadata
- `chat`: user message explicitly asks for media/search tool outside Create modal
- `agent`: assistant chooses tool without direct Create metadata or explicit user tool command

If origin is ambiguous, prefer `chat` when caused by current user message, otherwise `agent`.

## State ownership

### Server-owned canonical history

All submitted media/search tool calls persist server-side as session history/tool history.

Reason:

- submitted tool input is conversation/session truth
- needs to survive reload within same session
- tied to `session_id`
- can be linked to tool result/asset success/failure
- includes chat/agent tool calls that never touched Create UI
- avoids localStorage becoming canonical archive

### Client-owned draft cache

`localStorage` may keep unsent or recently submitted draft fallback before server confirms.

Server wins during merge.

## Data model

Preferred table name:

```text
tool_input_history
```

Shape:

```ts
type ToolInputHistoryItem = {
  id: string;
  session_id: string;
  source_message_id?: string;
  tool_call_id?: string;
  kind: "image" | "music" | "voice" | "search";
  origin: "create" | "chat" | "agent";
  tool_name:
    | "generate_image"
    | "generate_music"
    | "text_to_speech"
    | "web_search";
  input: Record<string, unknown>;
  prompt_text: string;
  status: "submitted" | "succeeded" | "failed";
  asset_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  hidden_at?: string;
};
```

Notes:

- `input` stores validated structured tool args.
- `prompt_text` stores short human preview.
- `error` is capped short string, no secrets.
- `hidden_at` soft-hides item from UI.

## API

Session-scoped endpoints:

```http
GET /api/create-history?kind=image|music|voice|search&limit=10&offset=0
DELETE /api/create-history/:id
```

Return newest first. Defaults:

```text
limit=10
offset=0
hidden=false
```

Mutation is internal except delete:

- server records Create submission when frontend submits structured Create data
- agent/server records chat/agent tool calls when tools execute
- server updates status after tool result

Public endpoints require `X-Session-Id`.

## UI

Add compact history affordance inside Create modal.

Per tab:

```text
Recent ▾
```

Click shows history for that tab:

- newest first
- one-line preview
- status icon:
  - ✅ succeeded
  - ⚠️ failed
  - … submitted/in progress
- origin chip:
  - ✨ Create
  - 💬 Chat
  - 🧞 Agent
- remove button: small `×`/overflow action
- tap main item → fills current form fields

Keep simple:

- first page max 10 per tab
- no search/filter in first version
- no inline editing
- confirm remove only if item has successful linked asset

## Remove behavior

Removing from history:

- sets `hidden_at`
- hides item from Create history lists
- does not delete chat messages
- does not delete generated asset files by default
- does not affect quota/usage counters
- is session-scoped

`GET /api/create-history` omits hidden items by default.

UI copy for confirmation when asset exists:

```text
Remove this from Recent? Your generated asset and chat stay saved.
```

## Tool capture flow

Capture all supported tool calls:

- direct Create modal submissions
- normal chat prompts that trigger tools
- agent-initiated tool calls during conversation

For each tool call:

1. Determine `origin`.
2. Record history item with `tool_call_id`, `source_message_id`, structured `input`, and `submitted` status.
3. On tool result success, update to `succeeded` and link `asset_id` if available.
4. On tool result error, update to `failed` and store short error.

## Create flow

1. User fills Create form.
2. Frontend creates structured input object and create metadata.
3. Submit records history item as `submitted` with `origin: "create"`.
4. Tool success updates item to `succeeded` and links asset if available.
5. Tool failure updates item to `failed` and stores short error.
6. UI history refreshes after submit/success/failure.

## Merge with drafts

On reload:

1. Load server tool input history.
2. Load local draft state from `HG-SPEC-005`.
3. Fill form from draft, not history.
4. Show history list from server.
5. If local cache has submitted item not on server, show local-only pending until confirmed or expired.
6. If server history has `succeeded` for draft `submittedHistoryId`, clear matching form draft.

## Privacy/session

- History scoped by `session_id`.
- No account/cloud sync.
- Do not expose one session's history to another.
- Stored inputs may contain personal text; never log full text by default.
- Attempts are retained indefinitely unless user hides individual item.

## Tests

### DB/unit

- migration applies
- insert/list/update history by session
- session isolation
- newest first ordering
- limit/offset pagination
- failed/succeeded status updates
- hidden items omitted by default
- delete endpoint soft-hides only current session item
- origin recorded for create/chat/agent tool calls

### Server integration

- `GET /api/create-history` requires session
- returns only current session items
- kind filter works
- pagination works
- failed attempts remain listed
- hidden items disappear after DELETE
- DELETE cannot hide another session's item

### Frontend unit

- history item fills matching form fields
- history list renders status/previews/origin chips
- remove action deletes item from visible list
- local draft does not get overwritten by history
- successful linked history clears matching draft per `HG-SPEC-005`

### E2E

- submit Create image/music/voice input with mocked tool
- trigger chat prompt that uses a tool
- reload
- open Create modal
- Recent list contains prior inputs
- origins/statuses are visually distinct
- click prior input fills form
- remove prior input → disappears after reload

## Acceptance criteria

- [ ] All media/search tool calls persist server-side by session.
- [ ] Create modal shows recent inputs per tab.
- [ ] Clicking a history item fills form fields.
- [ ] History survives reload.
- [ ] Session isolation enforced.
- [ ] Tool success/failure status captured and shown.
- [ ] Origin create/chat/agent is captured and shown.
- [ ] Failed attempts remain visible until user removes them.
- [ ] User can remove individual history items.
- [ ] Remove soft-hides only history row; chat/assets/usage remain.
- [ ] Pagination/limit supported.
- [ ] Local drafts remain separate and are not overwritten.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] `just test-integration` passes.
- [ ] `just test-e2e` passes.

## Non-goals

- No inline editing in history list.
- No bulk deletion/retention controls in first version.
- No account-level sync.
