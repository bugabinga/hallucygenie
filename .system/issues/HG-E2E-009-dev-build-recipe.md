# HG-E2E-009: No `just dev` recipe to auto-rebuild bundle

**Status:** Fixed

**Severity:** Medium (DX)
**Files:** `justfile`, `public/app.js`
**Observed:** `just dev` runs `bun server.ts` which serves the stale `public/app.js` bundle. Editing `app.ts` has no effect until you manually run `bunx esbuild`. No build step in the dev workflow.
**Fix:** Add a `just build` recipe and have `just dev` depend on it. Or use esbuild watch mode in dev:

```
[group('dev')]
build:
    bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext

[group('dev')]
dev: build
    bun server.ts
```
