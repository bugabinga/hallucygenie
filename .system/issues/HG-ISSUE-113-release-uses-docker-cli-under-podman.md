---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: run `just release v1.0.0` on a host where `docker` is Podman shim. Release output prints `Emulate Docker CLI using podman. Create /etc/containers/nodocker to quiet msg.`
Cause: release/container recipes call `docker build`, `docker volume`, `docker run`, `docker inspect`, `docker rm`, and `docker buildx`; README install docs use `docker pull` and `docker run`.
Fix: local container, release, smoke, inspect, manual release, publish, and README release image commands now use `podman` directly. `publish-container` uses explicit `podman build` plus `podman push`. Static and release-check regressions forbid local Docker CLI commands. Cross-ref HG-ISSUE-106, HG-ISSUE-108, HG-ISSUE-110, HG-ISSUE-111.
