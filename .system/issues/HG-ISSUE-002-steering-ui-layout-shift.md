# HG-ISSUE-002: Steering UI flashes briefly and shifts input layout

**Status:** fixed  
**Severity:** medium  
**Area:** Frontend UI / streaming / steering  
**Devil verdict:** valid UX issue; likely remove/replace transient hint instead of reserving more layout

## Report

Steering message is annoying:

- It shows up for a very short time while LLM is thinking.
- The steering element pushes the layout of the input box.
- UI layout should be as stable as possible.

## Actual

During streaming/thinking, steering hint appears transiently and changes input area height, causing visible layout shift.

## Expected

- Streaming UI should not cause input layout shift.
- Input box position/size should remain stable.
- Steering affordance should not flash briefly.
- If steering remains, it should use a stable, non-layout-affecting affordance.

## Devil review

Do not fix this by adding more vertical space unless product really needs a persistent steering banner. Reserved empty space wastes precious mobile height and still adds visual noise.

Better options, in order:

1. Remove transient steering hint entirely.
2. Fold steering affordance into existing stable input controls while streaming.
3. Use absolute/fixed overlay above input that does not affect document flow.

Avoid:

- height animations
- inserting/removing blocks above input
- auto-showing hint for <1s
- layout-affecting `margin/padding` transitions

## Recommended fix

Minimal v1:

- remove auto-appearing `.steer-hint` during streaming
- keep steering behavior via normal chat input if supported
- if a hint is needed, show placeholder/tooltip only on focus or stable icon press

If keeping visible hint:

```css
.steer-hint {
  position: absolute;
  left: var(--space-lg);
  right: var(--space-lg);
  bottom: calc(100% + var(--space-sm));
  pointer-events: auto;
}
```

and ensure parent is stable-positioned. No input-area height change.

## Tests required

- Unit/frontend: streaming toggle does not insert layout-flow steering block.
- E2E: input area bounding box stable before/during/after streaming.
- E2E: steering still works if feature remains.
- Static: no height/margin animation for `.steer-hint`.

## Logs

Checked `logs/dev.log` on 2026-05-01.

Recent logs show normal page/chat requests only. No recent `/api/steer` during reported session. Older `/api/steer` entries were validation failures from tests/manual sweeps:

```json
{"level":"debug","msg":"request received","time":"2026-04-30T23:08:40.281Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/steer"}
{"level":"info","msg":"response sent","time":"2026-04-30T23:08:40.281Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/steer","status":400}
```

No backend error indicated; likely pure frontend layout/UX issue.

## Fix

Implemented 2026-05-01:

- Streaming no longer shows the transient steering hint.
- `.steer-hint` is absolute-positioned outside normal input layout flow if manually shown.
- Removed layout-affecting margin/animation from `.steer-hint`.
- Static regression tests assert no flow layout shift primitives.

## Related

- `HG-SPEC-002` streaming animation must not reintroduce input/header layout shift.
