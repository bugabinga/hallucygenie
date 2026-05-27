# Docker build best-practice notes

Fetched 2026-05-27.

Sources:

- Docker Build best practices: https://docs.docker.com/build/building/best-practices/
- Docker cache optimization: https://docs.docker.com/build/cache/optimize/
- Bun Docker guide/search result: https://bun.sh/docs/guides/ecosystem/docker

Applied:

- Multi-stage build: deps, build, runtime.
- Cache-friendly ordering: copy `package.json`/`bun.lock` before app source.
- BuildKit cache mount for Bun install cache.
- Small context through `.dockerignore`.
- No `COPY . .`.
- Final image contains only runtime source, migrations, static files, bundled frontend.
- Non-root runtime via official `bun` user.
- OCI labels for release metadata.
- Runtime healthcheck against `/api/health`.
- Container smoke test in release gate.
