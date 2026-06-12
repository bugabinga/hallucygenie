---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-142: Release publish uses unsupported Podman build --push

Repro:

- Push tag `v1.0.1`.
- Release workflow passes local artifact proof.
- `publish-container` fails in GitHub Actions with `Error: unknown flag: --push`.

Cause:

- CI Podman version does not support Docker/Buildah-style `podman build --push`.

Fix:

- Build image with `podman build -t "$image" .`.
- Publish with explicit `podman push "$image"`.
- Add static regression forbidding `--push` in `justfile`.
- Release `v1.0.2` supersedes failed `v1.0.1` publication.
