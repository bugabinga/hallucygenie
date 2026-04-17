# HallucyGenie build system
# Use `just --list` to see all available recipes

# Install dependencies
install:
    bun install

# Run all tests
test:
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts

# Run tests with coverage
test-coverage:
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts

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
    node --experimental-strip-types --no-warnings --test-update-snapshots --test server.test.ts agent.test.ts tools.test.ts

# Show all recipes
list:
    just --list
