---
{ "status": "open", "specs": ["HG-SPEC-011"] }
---

Repro: run `just release v1.0.0` on a host where `docker` is Podman shim. Release output prints `Emulate Docker CLI using podman. Create /etc/containers/nodocker to quiet msg.`
Cause: release/container recipes call `docker build`, `docker volume`, `docker run`, `docker inspect`, `docker rm`, and `docker buildx`; README install docs use `docker pull` and `docker run`.
Fix: use `podman` directly in local release/container recipes and docs; decide `publish-container` push path for Podman or fail loud if buildx-only. Cross-ref HG-ISSUE-106, HG-ISSUE-108, HG-ISSUE-110, HG-ISSUE-111.
