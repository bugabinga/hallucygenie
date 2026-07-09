# HG-030: E2E Feature Coverage — Full UI/UX Test Suite

**Created:** 2026-04-19
**Size:** L

## Review Level: 2 (Plan + Code)

**Dependencies:** HG-027 (E2E Test Overhaul), HG-029 (Test Infrastructure)

## Mission

Add comprehensive E2E tests covering all implemented UI/UX features. Tests use the real server with MiniMax mocked and VFS for asset isolation (from HG-027/HG-029).

Also update project documentation to establish a **Test Coverage Policy** for all future tasks.

## Implemented Features to Test

Based on completed tasks HG-002 through HG-024:

| Feature | From | Test Priority |
|---------|------|--------------|
| Chat messaging + streaming | HG-003/006 | Critical |
| Session persistence | HG-004 | Critical |
| Markdown rendering | HG-021 | High |
| Lightbox image viewer | HG-007 | High |
| Error handling + toasts | HG-007 | High |
| Onboarding flow | HG-017 | High |
| Create modal (4 tabs) | HG-018 | High |
| Quota badge | HG-013 | Medium |
| Asset gallery | HG-019 | Medium |
| Mobile/desktop responsiveness | HG-007 | Medium |
| Textarea auto-resize | HG-007 | Low |
| SSE streaming indicators | HG-024 | Medium |

## Test Categories

### 1. Core Chat (8 tests)

```typescript
// Chat input behavior
await runTest("send button disabled with empty input", async () => { /* ... */ });
await runTest("send button enabled when input has text", async () => { /* ... */ });
await runTest("Enter key sends message", async () => { /* ... */ });
await runTest("Shift+Enter inserts newline, Enter sends", async () => { /* ... */ });

// Chat display
await runTest("user messages appear in chat with correct styling", async () => { /* ... */ });
await runTest("AI responses stream in with typing indicator", async () => { /* ... */ });
await runTest("markdown in AI responses renders correctly", async () => { /* ... */ });
await runTest("thinking indicator shows during AI processing", async () => { /* ... */ });
```

### 2. Session & State (4 tests)

```typescript
await runTest("new session ID generated on first visit", async () => { /* ... */ });
await runTest("session persists across page reload", async () => { /* ... */ });
await runTest("session persists in localStorage", async () => { /* ... */ });
await runTest("no session ID collision across tests", async () => { /* ... */ });
```

### 3. Onboarding (4 tests)

```typescript
await runTest("onboarding shows on first visit", async () => { /* ... */ });
await runTest("onboarding has 4 slides with correct content", async () => { /* ... */ });
await runTest("onboarding next button advances slides", async () => { /* ... */ });
await runTest("onboarding done button dismisses and hides", async () => { /* ... */ });
await runTest("onboarding does not show after completion", async () => { /* ... */ });
```

### 4. Create Modal (10 tests)

```typescript
// Modal open/close
await runTest("create button opens modal", async () => { /* ... */ });
await runTest("close button dismisses modal", async () => { /* ... */ });
await runTest("click outside modal dismisses it", async () => { /* ... */ });

// Tab navigation
await runTest("all 4 tabs visible (image, music, voice, search)", async () => { /* ... */ });
await runTest("clicking tab shows corresponding form", async () => { /* ... */ });
await runTest("tab state persists within session", async () => { /* ... */ });

// Image tab
await runTest("image tab has prompt textarea", async () => { /* ... */ });
await runTest("image tab has generate button", async () => { /* ... */ });

// Music tab
await runTest("music tab has prompt textarea", async () => { /* ... */ });
await runTest("music tab has generate button", async () => { /* ... */ });

// Voice tab
await runTest("voice tab has text input", async () => { /* ... */ });
await runTest("voice tab has generate button", async () => { /* ... */ });

// Search tab
await runTest("search tab has query input", async () => { /* ... */ });
await runTest("search tab has search button", async () => { /* ... */ });
```

### 5. Quota Badge (4 tests)

```typescript
await runTest("quota badge visible in header", async () => { /* ... */ });
await runTest("quota badge shows image quota", async () => { /* ... */ });
await runTest("quota badge shows music quota", async () => { /* ... */ });
await runTest("quota badge updates after generation", async () => { /* ... */ });
```

### 6. Asset Gallery (6 tests)

```typescript
await runTest("gallery button visible in header", async () => { /* ... */ });
await runTest("gallery opens with grid layout", async () => { /* ... */ });
await runTest("gallery shows filter tabs (all, images, music, voice)", async () => { /* ... */ });
await runTest("filter tabs filter assets correctly", async () => { /* ... */ });
await runTest("gallery shows empty state when no assets", async () => { /* ... */ });
await runTest("clicking asset shows detail view", async () => { /* ... */ });
```

### 7. Lightbox (3 tests)

```typescript
await runTest("lightbox opens when image clicked", async () => { /* ... */ });
await runTest("lightbox shows full-size image", async () => { /* ... */ });
await runTest("lightbox closes on backdrop click", async () => { /* ... */ });
await runTest("lightbox closes on escape key", async () => { /* ... */ });
```

### 8. Error Handling (4 tests)

```typescript
await runTest("error toast appears on API failure", async () => { /* ... */ });
await runTest("error toast auto-dismisses after 5 seconds", async () => { /* ... */ });
await runTest("error toast shows correct message", async () => { /* ... */ });
await runTest("quota exceeded shows specific error", async () => { /* ... */ });
```

### 9. Responsive Design (4 tests)

```typescript
await runTest("mobile viewport (375x812) shows all core elements", async () => { /* ... */ });
await runTest("tablet viewport (768x1024) shows all core elements", async () => { /* ... */ });
await runTest("desktop viewport (1280x800) shows all core elements", async () => { /* ... */ });
await runTest("input area accessible on mobile", async () => { /* ... */ });
```

### 10. UI Polish (4 tests)

```typescript
await runTest("textarea auto-resizes with content", async () => { /* ... */ });
await runTest("send button has loading state during request", async () => { /* ... */ });
await runTest("chat scrolls to bottom on new message", async () => { /* ... */ });
await runTest("scroll-to-bottom button appears when scrolled up", async () => { /* ... */ });
```

## Target

**50+ E2E tests** covering all implemented UI/UX features.

## File Scope

- `e2e/run-e2e.ts` — Add all new tests
- `e2e/test-fs.ts` — Use VFS for any asset-related tests
- `e2e/minimax-mock.ts` — Extend mocks as needed

## Do NOT

- Test internal implementation details
- Test MiniMax API parsing (that's unit test territory)
- Add tests for unimplemented features
- Make tests order-dependent

## Test Coverage Policy for Future Tasks

Add this section to `Tasks/CONTEXT.md` under a new heading:

```markdown
## Test Coverage Policy

Every task must consider and add appropriate tests before completion. This is not optional.

### Test Types to Consider

| Type | When to Use | Files |
|------|-------------|-------|
| **Unit tests** | Pure functions, utility logic, algorithm correctness | `*.test.ts` |
| **Integration tests** | API endpoints, database operations, module interaction | `integration.test.ts` |
| **E2E tests** | UI behavior, user flows, browser interactions | `e2e/run-e2e.ts` |
| **Snapshot tests** | Stable output formats (markdown rendering, etc.) | `*.snapshot.ts` |

### Decision Framework

For each task, ask:

1. **Does this add new functions or modify existing ones?**
   - Yes → Add unit tests in `*.test.ts`

2. **Does this add new API endpoints or change existing ones?**
   - Yes → Add integration tests in `integration.test.ts`

3. **Does this add new UI features or change existing UI behavior?**
   - Yes → Add E2E tests in `e2e/run-e2e.ts`

4. **Does this render stable output that should not change unexpectedly?**
   - Yes → Add snapshot tests

### Minimum Requirements by Task Size

| Task Size | Minimum Test Types |
|-----------|-------------------|
| **S** | Unit tests for any new functions |
| **M** | Unit tests + integration tests for API changes |
| **L** | Unit + integration + E2E for UI changes |

### Template for Task Prompts

All new task PROMPT.md files should include:

```markdown
## Tests to Add

- [ ] Unit tests: <what to test in *.test.ts>
- [ ] Integration tests: <what to test in integration.test.ts>
- [ ] E2E tests: <what to test in e2e/run-e2e.ts>
- [ ] Snapshot tests: <if applicable>
```

## Verification

```bash
just test-e2e
# Target: 50+ tests, 0 failures
```
