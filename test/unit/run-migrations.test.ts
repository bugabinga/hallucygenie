/**
 * Tests for runMigrations — filename validation.
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

    it("skips files not matching ^\\d+- pattern", () => {
        // Write a malformed migration file
        writeFileSync(join(testDir, "abc-def.sql"), "SELECT 1;");
        writeFileSync(join(testDir, "001-init.sql"), "CREATE TABLE test (id INTEGER);");

        const db = new Database(`:memory:`);
        // Should not throw even with malformed filename
        expect(() => runMigrations(db, testDir)).not.toThrow();

        // The valid migration should still have run
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain("test");

        db.close();
    });

    it("handles filenames with NaN versions gracefully", () => {
        // File matches pattern but parseInt still returns NaN
        writeFileSync(join(testDir, "000-no-version.sql"), "SELECT 1;");

        const db = new Database(`:memory:`);
        // Should not throw
        expect(() => runMigrations(db, testDir)).not.toThrow();
        db.close();
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
});
