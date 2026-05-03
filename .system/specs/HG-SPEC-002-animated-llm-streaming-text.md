# HG-SPEC-002: Animated LLM streaming text

## Design decisions

- Dark neon theme: magic text materializing, subtle assistant energy.
- Phase 1: caret/glow on `.is-streaming` during SSE, removed on `done`.
- Phase 2 (optional): chunk-level reveal spans, cleaned up on `done`.
- No per-character DOM. No canvas/WebGL. No animation on restored history.
- `prefers-reduced-motion` disables all animation.
- Final message renders markdown correctly. No visible jump at stream completion.
