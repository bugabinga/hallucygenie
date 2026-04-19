# HallucyGenie build system — `just --list` to see all recipes

# ── Install ─────────────────────────────────────────
install:
    npm install

# ── Dev ─────────────────────────────────────────────
dev:
    node --experimental-strip-types --no-warnings server.ts

# ── Format ──────────────────────────────────────────
fmt:
    npx dprint fmt 2>/dev/null || echo "dprint not installed — skipped"

# ── Type check ──────────────────────────────────────
lint:
    npx tsc --noEmit

# ── Unit tests (backend + frontend, <30s wall clock, parallel) ──
test-unit: fmt lint
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts &
    node --experimental-strip-types --no-warnings --test --test-name-pattern "." public/app.test.ts &
    wait

# ── Integration tests (real server + in-memory DB, mock fetch) ──
test-integration: fmt lint
    node --experimental-strip-types --no-warnings --test integration.test.ts

# ── Mutation tests ──────────────────────────────────
test-mutation: fmt lint
    npx stryker run stryker.config.mjs
    npx stryker run stryker-tools.mjs
    npx stryker run stryker-db.mjs

# ── All CI tests (fmt + lint + unit + integration) ──
test-all: fmt lint
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts &
    node --experimental-strip-types --no-warnings --test --test-name-pattern "." public/app.test.ts &
    wait
    node --experimental-strip-types --no-warnings --test integration.test.ts

# ── Coverage ────────────────────────────────────────
test-coverage:
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# ── Legacy aliases ──────────────────────────────────
test-frontend:
    node --experimental-strip-types --no-warnings --test --test-name-pattern "." public/app.test.ts

test-e2e:
    npx esbuild public/app.ts --outfile=public/app.js --format=esm --target=esnext
    PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/static-server.ts public & sleep 1
    BASE_URL=http://localhost:3001 PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/run-e2e.ts; \
    kill %1 2>/dev/null; true

# ── Pi updates ─────────────────────────────────────
pi-update:
    npm update -g @mariozechner/pi-coding-agent
    pi update

# ── Desloppy ───────────────────────────────────────
desloppy:
    pi --no-extensions --tools read,bash,edit,write,grep,find,ls -p "find ugliest slop in code. fix it good. no mercy."

# ── Tiger ──────────────────────────────────────────
tiger:
    pi --skill /data/data/com.termux/files/home/.pi/skills/tiger -p "scan code. enforce tiger style. no mercy."

# ── Brainstorm ─────────────────────────────────────
brainstorm:
    pi --no-extensions --tools read,bash,edit,write,grep,find,ls -p "generate five ideas for this project. easy to crazy. append to ideas.md in repo root."

# ── Utility ────────────────────────────────────────
clean:
    rm -rf node_modules/.cache reports

list:
    just --list
