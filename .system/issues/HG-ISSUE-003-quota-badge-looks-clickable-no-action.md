# HG-ISSUE-003: Quota badge looks clickable but click does nothing

**Status:** fixed  
**Severity:** low  
**Area:** Header / quota badge UX  
**Devil verdict:** misleading affordance; make non-interactive unless quota details are implemented now

## Report

Header shows:

```text
🎨 100
🎵 100
```

Hovering shows hand cursor, but clicking does nothing.

## Actual

Quota badge is a `<button>` with clickable cursor/title:

```html
<button
  id="quota-badge"
  class="quota-badge"
  title="View usage limits"
  aria-label="Usage limits"
></button>
```

CSS sets:

```css
.quota-badge {
  cursor: pointer;
}
```

No click handler appears to be attached in `public/app.ts`.

## Expected

Either:

1. Add real quota details popover/modal, or
2. Make it non-interactive.

## Devil review

Do not leave dead buttons. This trains users that UI is broken.

Given current app complexity, best fix is v1 non-interactive status. A quota modal is a feature, not a bug fix.

Recommended semantics:

- use `div` or `span`, not `button`
- `role="status"` or descriptive `aria-label`
- `cursor: default`
- no hover hand
- title explains current numbers, not “View usage limits”

Suggested text:

```text
Images and music remaining today
```

If later adding details popover, create separate spec/ticket.

## Tests required

- Static: `#quota-badge` is not a button unless click handler exists.
- Static: no `cursor: pointer` for quota badge when non-interactive.
- Frontend: quota values still update.
- E2E: hover/click does not imply missing interaction; no modal expected.

## Logs

Checked `logs/dev.log` on 2026-05-01.

Recent quota endpoint requests succeed:

```json
{"level":"debug","msg":"request received","time":"2026-04-30T23:54:40.611Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-04-30T23:54:41.366Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota","status":200}
```

No backend issue indicated. Missing/ambiguous frontend interaction.

## Fix

Implemented 2026-05-01:

- `#quota-badge` changed from dead `<button>` to non-interactive `<span role="status">`.
- Removed pointer cursor and hover affordance.
- Updated title/ARIA to describe actual status.
- Static regression test prevents dead-button reintroduction.
