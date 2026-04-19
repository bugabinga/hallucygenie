# HallucyGenie build system
# Use `just --list` to see all available recipes

# Install dependencies
install:
    npm install

# Start dev server
dev:
    node --experimental-strip-types --no-warnings server.ts

# Run all unit tests
test:
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts public/app.test.ts

# Run tests with coverage
test-coverage:
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# Run mutation tests on agent.ts (full ~10min)
test-mutation:
    npx stryker run stryker.config.mjs

# Run mutation tests on tools.ts (~5min, concurrency=3)
test-mutation-tools:
    npx stryker run stryker-tools.mjs

# Run mutation tests on db.ts
test-mutation-db:
    npx stryker run stryker-db.mjs

# Run snapshot tests specifically
test-snapshot:
    node --experimental-strip-types --no-warnings --test --test-name-pattern "snapshot" server.test.ts agent.test.ts tools.test.ts db.test.ts

# Update snapshots
test-update-snapshots:
    node --experimental-strip-types --no-warnings --test-update-snapshots --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# Run frontend unit tests
test-frontend:
    node --experimental-strip-types --no-warnings --test public/app.test.ts

# Run frontend tests with coverage
test-frontend-coverage:
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test public/app.test.ts

# Run E2E tests with Playwright
test-e2e:
    npx esbuild public/app.ts --outfile=public/app.js --format=esm --target=esnext && \
    PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/static-server.ts public & sleep 1 && \
    BASE_URL=http://localhost:3001 PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/run-e2e.ts; \
    kill %1 2>/dev/null; true

# Run all tests
test-all: test test-frontend test-e2e

# Clean build artifacts
clean:
    rm -rf node_modules/.cache reports

# Show all recipes
list:
    just --list
