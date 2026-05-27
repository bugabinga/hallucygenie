---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `MANUAL_CHROME_OK=v1.0.0 just release v1.0.0` forces caller to run browser proof out-of-band, then restate proof through env.
Cause: manual release gate encoded trust in env var instead of owning browser proof flow.
Fix: `just release` starts exact release image, opens Chrome, waits for close or Ctrl+C, asks `Manual test OK? [y/N]`, tags only on `y`.
