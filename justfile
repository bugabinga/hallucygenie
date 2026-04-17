# HallucyGenie build system
# Use `just --list` to see all available recipes

# Install dependencies
install:
    bun install

# Run all tests
test:
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# Run tests with coverage
test-coverage:
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# Run mutation tests
test-mutation:
    echo "Mutation testing requires bun+stryker - skipping on this platform"

# Start dev server
dev:
    bun run server.ts

# Build for production
build:
    bun build server.ts --outdir dist --target bun

# Run linter
lint:
    echo "No linter configured yet"

# Update snapshots
test-update-snapshots:
    node --experimental-strip-types --no-warnings --test-update-snapshots --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# Run frontend unit tests
test-frontend:
    node --experimental-strip-types --no-warnings --import ./tests/loader.mjs --test public/app.test.ts

# Run frontend tests with coverage
test-frontend-coverage:
    node --experimental-strip-types --no-warnings --experimental-test-coverage --import ./tests/loader.mjs --test public/app.test.ts

# Run E2E tests with Playwright
# Starts a static server, runs tests, then stops the server
test-e2e:
    npx esbuild public/app.ts --outfile=public/app.js --format=esm --target=esnext && \
    PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/static-server.ts public & sleep 1 && \
    BASE_URL=http://localhost:3001 PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/run-e2e.ts; \
    kill %1 2>/dev/null; true

# Show all recipes
list:
    just --list
