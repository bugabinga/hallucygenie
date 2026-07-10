import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createLogger as directCreateLogger, nextReqId } from "../../src/log.ts";

const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalExit = process.exit;

let importNonce = 0;

async function freshLogModule() {
    importNonce++;
    return import(`../../src/log.ts?unit-log-${importNonce}`);
}

afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    process.exit = originalExit;
    rmSync("logs", { recursive: true, force: true });
});

describe("logger", () => {
    it("creates the dev log directory, writes pretty stderr, and flushes on exit", async () => {
        rmSync("logs", { recursive: true, force: true });
        process.env.NODE_ENV = "test";
        process.env.LOG_LEVEL = "debug";
        const stderr: string[] = [];
        process.stderr.write = ((chunk: string | Uint8Array) => {
            stderr.push(String(chunk));
            return true;
        }) as typeof process.stderr.write;

        const exitListenersBefore = process.listeners("exit").length;
        const { createLogger } = await freshLogModule();
        const logger = createLogger({ service: "unit", empty: "", missing: undefined });
        logger.debug("hello", { reqId: "abc" });

        assert.equal(existsSync("logs/dev.log"), true);
        assert.match(stderr.join(""), /DEBUG/);
        assert.match(stderr.join(""), /service/);
        assert.doesNotMatch(stderr.join(""), /empty=/);

        const exitListener = process.listeners("exit")[exitListenersBefore] as () => void;
        exitListener();
        assert.match(readFileSync("logs/dev.log", "utf8"), /"msg":"hello"/);
    });

    it("direct logger writes JSON to stdout in production and request ids advance", () => {
        process.env.NODE_ENV = "production";
        process.env.LOG_LEVEL = "debug";
        const stdout: string[] = [];
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout.push(String(chunk));
            return true;
        }) as typeof process.stdout.write;

        directCreateLogger({ service: "direct" }).error("json", { ok: true });
        assert.match(nextReqId(), /^[0-9a-f]{6}$/);
        const logged = JSON.parse(stdout[0]);
        assert.equal(logged.level, "error");
        assert.equal(logged.msg, "json");
        assert.equal(logged.service, "direct");
        assert.equal(logged.ok, true);
    });

    it("suppresses all output with LOG_LEVEL=silent", async () => {
        process.env.NODE_ENV = "test";
        process.env.LOG_LEVEL = "silent";
        const stderr: string[] = [];
        process.stderr.write = ((chunk: string | Uint8Array) => {
            stderr.push(String(chunk));
            return true;
        }) as typeof process.stderr.write;

        const { createLogger } = await freshLogModule();
        const logger = createLogger({ service: "unit" });
        logger.error("hide me");
        logger.warn("hide me too");

        assert.deepEqual(stderr, []);
    });

    it("writes JSON to stdout in production and honors LOG_LEVEL", async () => {
        process.env.NODE_ENV = "production";
        process.env.LOG_LEVEL = "warn";
        const stdout: string[] = [];
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout.push(String(chunk));
            return true;
        }) as typeof process.stdout.write;

        const { createLogger } = await freshLogModule();
        const logger = createLogger({ service: "unit" });
        logger.info("skip me");
        logger.warn("keep me", { answer: 42 });

        assert.equal(stdout.length, 1);
        const logged = JSON.parse(stdout[0]);
        assert.equal(logged.level, "warn");
        assert.equal(logged.msg, "keep me");
        assert.equal(logged.service, "unit");
        assert.equal(logged.answer, 42);
    });

    it("signal handlers flush and exit cleanly", async () => {
        process.env.NODE_ENV = "test";
        process.env.LOG_LEVEL = "debug";
        process.stderr.write = (() => true) as typeof process.stderr.write;
        const exits: number[] = [];
        process.exit = ((code?: string | number | null) => {
            exits.push(Number(code ?? 0));
            return undefined as never;
        }) as typeof process.exit;

        const sigintBefore = process.listeners("SIGINT").length;
        const sigtermBefore = process.listeners("SIGTERM").length;
        const { createLogger } = await freshLogModule();
        createLogger().error("flush me");

        (process.listeners("SIGINT")[sigintBefore] as () => void)();
        (process.listeners("SIGTERM")[sigtermBefore] as () => void)();

        assert.deepEqual(exits, [0, 0]);
        assert.match(readFileSync("logs/dev.log", "utf8"), /"msg":"flush me"/);
    });
});
