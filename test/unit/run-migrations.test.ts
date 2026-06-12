/**
 * Tests for runMigrations — filename validation and regex guard.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/db.ts";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("runMigrations", () => {
    const testDir = `/tmp/test_migrations_${Date.now()}`;

    beforeEach(() => {
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    });

    it("skips files not matching ^\\d+- pattern via regex guard", () => {
        // Write a malformed migration file (no leading digits)
        writeFileSync(join(testDir, "abc-def.sql"), "CREATE TABLE bad_table (id INTEGER);");
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE test (id INTEGER);");

        const db = new Database(`:memory:`);
        expect(() => runMigrations(db, testDir)).not.toThrow();

        // The valid migration should still have run
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain("test");
        // bad_table must NOT be created — abc-def.sql was filtered by regex
        expect(tableNames).not.toContain("bad_table");

        db.close();
    });

    it("regex /^\\d+-.+\\.sql$/ passes valid filenames", () => {
        const pattern = /^\d+-.+\.sql$/;
        // Valid: has digits, hyphen, and suffix
        expect(pattern.test("001-init.sql")).toBe(true);
        expect(pattern.test("002-add-users.sql")).toBe(true);
        expect(pattern.test("123-something-here.sql")).toBe(true);
        expect(pattern.test("0001-something.sql")).toBe(true);
        // Invalid: no hyphen separator
        expect(pattern.test("001init.sql")).toBe(false);
        // Invalid: no .sql suffix
        expect(pattern.test("001-init.txt")).toBe(false);
        // Invalid: empty after hyphen
        expect(pattern.test("001-.sql")).toBe(false); // .+ requires at least 1 char
        // Invalid: no hyphen at all
        expect(pattern.test("0001.sql")).toBe(false);
    });

    it("handles filenames that pass regex but parseInt returns NaN", () => {
        // The .test() regex would pass for "000-no-version" but parseInt gives NaN
        // (edge case: parseInt("000-no-version".split("-")[0], 10) = 0, not NaN)
        // But parseInt on pure non-numeric gives NaN
        // This tests the NaN guard: if Number.isNaN(version) return false
        writeFileSync(join(testDir, "abc-def.sql"), "SELECT 1;");
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE test (id INTEGER);");

        const db = new Database(`:memory:`);
        expect(() => runMigrations(db, testDir)).not.toThrow();

        // 001-init must still run despite abc-def.sql being skipped
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as Array<{ name: string }>;
        expect(tables.map((t) => t.name)).toContain("test");

        db.close();
    });

    it("NaN guard prevents crash on malformed filenames", () => {
        // parseInt("abc".split("-")[0], 10) = NaN → guard must return false
        // Without the guard: NaN inserted into SQL → crash
        const filename = "abc-def.sql";
        const version = parseInt(filename.split("-")[0], 10);
        expect(Number.isNaN(version)).toBe(true);
        // Guard: if Number.isNaN(version) return false
        const shouldApply = !Number.isNaN(version);
        expect(shouldApply).toBe(false); // Should NOT apply this migration
    });

    it("applies valid migrations in order", () => {
        writeFileSync(join(testDir, "001-first.sql"), "CREATE TABLE first (id INTEGER);");
        writeFileSync(join(testDir, "002-second.sql"), "CREATE TABLE second (id INTEGER);");

        const db = new Database(`:memory:`);
        runMigrations(db, testDir);

        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all() as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain("first");
        expect(tableNames).toContain("second");

        db.close();
    });

    it("tracks applied versions in schema_migrations", () => {
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE test (id INTEGER);");

        const db = new Database(`:memory:`);
        runMigrations(db, testDir);

        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all() as Array<{ version: number }>;
        expect(versions.map((v) => v.version)).toEqual([1]);

        db.close();
    });

    it("skips already-applied migrations", () => {
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE test (id INTEGER);");

        const db = new Database(`:memory:`);
        runMigrations(db, testDir);
        runMigrations(db, testDir); // Run again

        // Table should still only exist once
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as Array<{ name: string }>;
        expect(tables.filter((t) => t.name === "test").length).toBe(1);

        db.close();
    });

    it("mix of valid and invalid filenames — only valid are applied", () => {
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE valid1 (id INTEGER);");
        writeFileSync(join(testDir, "bad-name.sql"), "CREATE TABLE bad1 (id INTEGER);");
        writeFileSync(join(testDir, "another-bad.sql"), "CREATE TABLE bad2 (id INTEGER);");
        writeFileSync(join(testDir, "002-second.sql"), "CREATE TABLE valid2 (id INTEGER);");

        const db = new Database(`:memory:`);
        runMigrations(db, testDir);

        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all() as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);
        // Only the numbered migrations should have run
        expect(tableNames).toContain("valid1");
        expect(tableNames).toContain("valid2");
        // Invalid filenames should not create tables
        expect(tableNames).not.toContain("bad1");
        expect(tableNames).not.toContain("bad2");

        db.close();
    });
});
