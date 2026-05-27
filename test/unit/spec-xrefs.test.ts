// HallucyGenie — test/spec crossrefs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const SPEC_TEST_COVERAGE: Record<string, string[]> = {
    "HG-SPEC-001": ["test/unit/static.test.ts"],
    "HG-SPEC-002": ["test/unit/app.test.ts", "test/unit/static.test.ts"],
    "HG-SPEC-003": ["test/unit/db.test.ts", "test/unit/server.test.ts", "test/unit/agent.test.ts"],
    "HG-SPEC-004": ["test/unit/static.test.ts"],
    "HG-SPEC-005": ["test/unit/db.test.ts", "test/unit/server.test.ts", "test/unit/app.test.ts"],
    "HG-SPEC-006": ["test/unit/db.test.ts", "test/unit/server.test.ts", "test/unit/app.test.ts"],
    "HG-SPEC-007": ["test/unit/static.test.ts", "test/unit/server.test.ts", "e2e/run-e2e.ts"],
    "HG-SPEC-008": ["test/unit/db.test.ts", "test/unit/app.test.ts", "e2e/run-e2e.ts"],
    "HG-SPEC-009": ["test/unit/db.test.ts", "test/unit/server.test.ts", "test/unit/app.test.ts"],
    "HG-SPEC-010": ["test/unit/tools.test.ts"],
    "HG-SPEC-011": ["test/unit/static.test.ts", "test/unit/server.test.ts"],
    "HG-SPEC-012": ["test/unit/tools.test.ts", "test/unit/static.test.ts"],
    "HG-SPEC-013": ["test/unit/tools.test.ts", "test/unit/static.test.ts"],
    "HG-SPEC-014": ["test/unit/static.test.ts"],
    "HG-SPEC-015": ["test/unit/static.test.ts", "test/unit/app.test.ts", "e2e/run-e2e.ts"],
    "HG-SPEC-016": ["test/unit/static.test.ts", "test/unit/app.test.ts"],
    "HG-SPEC-017": ["test/unit/db.test.ts", "test/unit/static.test.ts"],
};

describe("test crossrefs", () => {
    it("points tests at every spec", () => {
        for (const [spec, tests] of Object.entries(SPEC_TEST_COVERAGE)) {
            assert.match(spec, /^HG-SPEC-\d{3}$/);
            for (const test of tests) assert.equal(existsSync(test), true, `${spec} ${test}`);
        }
    });
});
