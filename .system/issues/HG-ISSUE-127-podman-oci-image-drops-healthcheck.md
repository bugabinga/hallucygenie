---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `just release-check hallucygenie:manual-487df5f` preserved image-embedded health metadata instead of using Podman-native container healthchecks.
Cause: image-embedded health metadata fights Podman-native OCI image flow.
Fix: use OCI `deploy/Containerfile`, default Podman image format, and Podman-native container healthchecks via `--health-cmd`/Quadlet `HealthCmd`. Cross-ref HG-ISSUE-113.
