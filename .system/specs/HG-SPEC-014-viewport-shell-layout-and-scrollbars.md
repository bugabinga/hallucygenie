# HG-SPEC-014 — Viewport zoom, full-width shell, and clean input scrolling

**Status:** Open
**Idea:** correct zoom behaviour and header/footer full widths; no useless scrollbars in main input element.

## Goal

Make the app shell behave like a normal mobile-first web app:

- browser zoom and mobile pinch zoom work
- header and footer span the full visual viewport width
- chat content can still stay readable with a max-width inner column
- only the message list scrolls during normal chat use
- the main chat textarea does not show useless scrollbars

## Problem

Current shell mixes viewport control, app width, and scroll ownership too tightly.

Observed/current code paths:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
/>
```

```css
html {
  height: 100%;
}
body {
  height: 100dvh;
  overflow: hidden;
}
#app {
  height: 100dvh;
  max-width: 720px;
  margin: 0 auto;
}
#message-list {
  overflow-y: auto;
  overflow-x: hidden;
}
#chat-input {
  resize: none;
  max-height: 120px;
}
```

Issues:

1. `maximum-scale=1.0, user-scalable=no` disables pinch zoom on mobile. That is bad accessibility and feels broken.
2. `#app { max-width: 720px; margin: 0 auto; }` constrains the whole shell, so header/footer also stop at 720px instead of filling the viewport.
3. The app needs one deliberate vertical scroll owner. Page/body scrollbars and nested accidental scrollbars should not appear during normal use.
4. `#chat-input` can show a scrollbar/gutter even when it is not useful, especially with auto-resize and `max-height`.

## Cross references

### Existing specs

- `HG-SPEC-001-vendored-font-system.md`
  - chat input readability remains required
  - zoom/text scaling must not clip playful fonts
- `HG-SPEC-002-animated-llm-streaming-text.md`
  - explicitly requires no input/header layout shift
  - streaming animation must not change shell dimensions
- `HG-SPEC-003-local-user-profile-and-avatar.md`
  - header may gain profile UI; this spec defines the shell/header width contract it must respect
- `HG-SPEC-004-stable-create-modal-layout.md`
  - modal has its own stable scroll region; this spec covers the main app shell outside modals
- `HG-SPEC-005-local-draft-and-ui-state-persistence.md`
  - main chat input draft restoration must not create layout shift or useless scrollbars
- `HG-SPEC-009-multi-session-support.md`
  - future header session selector must fit inside full-width header with constrained inner content

### Implementation tickets

- `HG-TICKET-055-viewport-zoom-and-shell-width.md`
- `HG-TICKET-056-shell-scroll-ownership.md`
- `HG-TICKET-057-chat-input-overflow-scrollbar.md`
- `HG-TICKET-058-viewport-manual-e2e-matrix.md`

### Existing issues

- `HG-ISSUE-002-steering-ui-layout-shift.md`
  - fixed steering hint layout shift; this spec prevents shell/input shifts from returning
- `HG-ISSUE-013-quota-badge-missing-speech.md`
  - header will get another quota item; full-width header + inner wrapping rules matter
- `HG-ISSUE-015-markdown-output-too-spaced-and-partially-unrendered.md`
  - markdown spacing changes must not create body-level overflow
- `HG-ISSUE-016-streaming-text-animation-not-perceptible.md`
  - chunk animation must not force layout reads or move input/header
- `HG-ISSUE-017-create-form-input-left-border-missing.md`
  - separate Create modal border/scroll polish; same principle: no clipped controls
- `HG-ISSUE-019-agent-rendered-images-too-large-need-markdown-sanitization.md`
  - rendered media must remain contained and not create horizontal scroll

## UX requirements

### 1. Correct zoom behavior

Viewport meta must allow user zoom.

Target:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Avoid:

```html
maximum-scale=1.0 user-scalable=no
```

Requirements:

- Mobile pinch zoom works.
- Desktop browser zoom to 200% remains usable.
- Text does not clip in header, footer, input, or buttons.
- No horizontal scrolling at common zoom levels unless browser zoom is extreme and unavoidable.

### 2. Full-width header/footer shell

Header/footer should visually fill the viewport width.

Recommended structure:

```txt
body
└─ #app                 full viewport width/height shell
   ├─ #header           full width
   │  └─ .shell-inner   max-width content row
   ├─ #message-list     scroll owner
   │  └─ .chat-column   max-width messages
   └─ #input-area       full width
      └─ .shell-inner   max-width form row
```

Existing DOM has no `.shell-inner`; implementation may use CSS wrappers already present if simpler. The important contract:

- full-width visual backgrounds/borders for `#header` and `#input-area`
- readable max-width for actual content controls/messages
- no `max-width` on the whole `#app` if that prevents full-width shell chrome

### 3. One normal scroll owner

Normal chat layout should use this scroll model:

```txt
html/body/#app: no page scroll during normal app use
#message-list: vertical scroll owner
modals: own internal scroll regions only while open
#chat-input: grows until cap; then internal scroll only if content exceeds cap
```

Requirements:

- No body/page vertical scrollbar during normal chat use.
- No horizontal scrollbar on body, app, header, footer, message list, or input area.
- Long assistant content scrolls in `#message-list`.
- Long code blocks may scroll horizontally inside the code block only; they must not widen the page.
- Modals keep their existing internal scroll behavior from `HG-SPEC-004`.

### 4. Main input has no useless scrollbar

`#chat-input` behavior:

- one-line input: no visible vertical scrollbar
- short multi-line input below max height: no visible vertical scrollbar
- content above max height: textarea may scroll internally
- auto-resize must clamp to configured max height
- scrollbar gutter must not permanently steal width or make send button jump

Implementation direction:

```css
#chat-input {
  overflow-y: hidden;
}

#chat-input.is-overflowing {
  overflow-y: auto;
}
```

or equivalent direct logic. Keep it simple: compute after existing auto-resize; set one class/attribute if `scrollHeight > maxHeight`.

## Non-goals

- No redesign of chat visuals.
- No new header controls.
- No Create modal implementation changes except avoiding conflicts.
- No new scrolling library.
- No custom fake scrollbars.
- No desktop-only layout fork.

## Implementation notes

Keep implementation structural and small:

1. Remove zoom-blocking viewport attributes.
2. Move `max-width` constraint from whole app shell to inner content areas.
3. Preserve `height: 100dvh` / safe-area handling, but test mobile browser chrome behavior.
4. Ensure `min-width: 0` on flex children that can shrink.
5. Ensure `box-sizing: border-box` remains global.
6. Add input overflow class only when content actually exceeds max height.

Possible selector targets from current code:

- `#app`
- `#header`
- `#message-list`
- `#input-area`
- `#chat-form`
- `.input-wrapper`
- `#chat-input`
- `.message`
- `.message-bubble`
- `.tool-card`

Do not guess selector names in tests. Inspect actual DOM first.

## Test plan

### Static/unit

- `public/index.html` viewport meta does not contain `maximum-scale` or `user-scalable=no`.
- CSS does not set `max-width` on `#app`.
- `#header` and `#input-area` have full-width shell behavior.
- content column/message/form max-width exists somewhere inside shell, not on shell itself.
- `#chat-input` has no default visible vertical scrollbar.
- input auto-resize toggles overflow only after max-height is exceeded.

### Frontend unit

- one-line chat input after `autoResizeInput()` has no overflow class.
- short multi-line chat input has no overflow class.
- long chat input gets overflow-enabled class and height clamps.
- send button position does not change when input crosses overflow threshold.

### E2E/manual Chrome

Run at:

- mobile portrait
- mobile landscape
- desktop/narrow
- browser zoom 150%
- browser zoom 200%

Assert/inspect:

- pinch zoom works on mobile.
- header background touches left and right viewport edges.
- footer/input background touches left and right viewport edges.
- messages remain readable and centered/max-width.
- no body horizontal scrollbar.
- no body vertical scrollbar during normal app use.
- only message list scrolls when chat is long.
- main textarea shows scrollbar only with long text beyond max height.

## Acceptance criteria

- [ ] Mobile pinch zoom is allowed.
- [ ] Desktop zoom to 200% is usable.
- [ ] Header spans full viewport width.
- [ ] Footer/input area spans full viewport width.
- [ ] Chat content remains max-width/readable.
- [ ] Normal app shell has no body/page scrollbar.
- [ ] No horizontal scrollbar in normal chat usage.
- [ ] Main chat input has no useless scrollbar for normal text.
- [ ] Long chat input still scrolls internally after max height.
- [ ] Streaming/steering does not shift header/footer/input layout.
- [ ] Create modal scroll behavior from `HG-SPEC-004` still works.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] relevant E2E/manual viewport checks pass.
