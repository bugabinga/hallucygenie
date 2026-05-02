# HG-E2E-011: Justfile commands have multiple issues

**Status:** Fixed

**Severity:** Medium (DX)
**File:** `justfile`

## Issues found

### 1. `clean` is useless

```just
[group('util')]
clean:
    rm -rf node_modules/.cache reports
```

Removes two directories that don't even exist. Missing: `dist/`, `coverage/`, `.stryker-tmp/`, `public/app.js`, `test-data*`.

### 2. `minimax-test` uses `python3` for JSON parsing

```just
| python3 -c "import sys,json; ..."
```

Three separate `python3` invocations. Project rules say no python. Should use `jq` (installed) or `bun -e`.

### 3. `minimax-research` references hardcoded Termux paths

```just
pi --skill /data/data/com.termux/files/home/.pi/agent/skills/minimax ...
```

Won't work on this machine (Linux desktop). Paths should be relative or use `$HOME/.pi/`.

### 4. `test-unit` uses `--test-name-pattern "."` hack

```just
bun test --test-name-pattern "." public/app.test.ts &
```

Bun test accepts file patterns directly. Just use `bun test public/app.test.ts`.

### 5. `test-unit` redundantly runs `fmt lint`

Every test recipe runs `fmt lint` as a dependency. `test-all` calls `check` (which does `fmt lint`) then `test-unit` (which does `fmt lint` again). Triple formatting. Should use a `test-unit-run` internal recipe without the check deps, or remove deps from test recipes and rely on `just check` being run separately.

### 6. Missing recipes

- **`build`** — no recipe to rebuild `public/app.js` from `app.ts`. This is the root cause of HG-E2E-002.
- **`nuke`** / **`distclean`** — no way to do a clean slate (`rm -rf node_modules data logs .stryker-tmp coverage reports public/app.js`)

### 7. `list` recipe is redundant

```just
list:
    just --list
```

`just --list` already works without a recipe. The recipe shadows it confusingly since running `just list` runs the recipe instead of just's built-in listing. Running `just` with no args shows the list anyway.

### 8. Aliases undocumented

`t`, `ti`, `ta`, `e2e`, `verify` aliases exist but aren't mentioned in `just --list` output (just shows them in brackets).

## Proposed fixes

- `clean` → remove stale caches, build artifacts, test data
- `build` → esbuild bundle step
- `dev: build` → auto-build before serving
- `minimax-test` → replace `python3` with `jq`
- `minimax-research` → use `$HOME/.pi/` paths
- Remove `--test-name-pattern "."` hack
- Remove `list` recipe
- Add `nuke` recipe for full clean
