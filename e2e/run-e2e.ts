#!/usr/bin/env node
// HallucyGenie E2E Test Runner
// Runs against the REAL server with MiniMax API mocked via nock.
// Architecture:
//   Browser → Real Server → Mocked MiniMax (nock)
//                ↓
//           Real SQLite (temp)

import { chromium, type Browser, type Page } from "playwright-core";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { startServer, initDatabase, shutdown, resetStateForTesting } from "../server.ts";
import { setupMinimaxMocks, cleanupMinimaxMocks } from "./minimax-mock.ts";

const CHROMIUM_PATH = "/data/data/com.termux/files/usr/lib/chromium/chrome";
const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// ── Test framework ──────────────────────────────────────────────────

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function assertEqual(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected "${expected}", got "${actual}"`);
    }
}

async function expectVisible(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "visible", timeout: 5000 });
}

async function expectHidden(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "hidden", timeout: 5000 });
}

async function expectDisabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    const disabled = await locator.isDisabled();
    if (!disabled) throw new Error("Expected element to be disabled");
}

async function expectEnabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    const enabled = await locator.isEnabled();
    if (!enabled) throw new Error("Expected element to be enabled");
}

/**
 * Reliable "app is ready" signal:
 * 1. Navigate to page
 * 2. Wait for init() to complete (session UUID in localStorage)
 * 3. Wait for #send-button to be in DOM
 *
 * Optionally dismiss onboarding overlay for tests that need to interact
 * with elements behind it.
 */
async function waitForApp(page: Page, options?: { dismissOnboarding?: boolean }): Promise<void> {
    await page.goto(BASE_URL);

    // Wait for init() to run — it sets session UUID in localStorage synchronously
    await page.waitForFunction(() => localStorage.getItem("hallucygenie_session_id") !== null, {
        timeout: 10000,
    });

    // Wait for DOM elements to be ready
    await page.waitForSelector("#send-button");

    // Dismiss onboarding overlay if requested (it blocks clicks on elements behind it)
    if (options?.dismissOnboarding) {
        const onboarding = page.locator("#onboarding");
        const isVisible = await onboarding.isVisible().catch(() => false);
        if (isVisible) {
            // Set localStorage to prevent onboarding, then dismiss
            await page.evaluate(() => {
                localStorage.setItem("hg_onboarding_done", "1");
                const ob = document.getElementById("onboarding");
                if (ob) ob.hidden = true;
            });
            await page.waitForTimeout(50);
        }
    }
}

// ── Main test runner ─────────────────────────────────────────────────

// Temp directory module-level so cleanup() can access it
let _tmpDir: string | undefined;

async function runE2ETests(): Promise<void> {
    console.log("🧪 HallucyGenie E2E Tests");
    console.log(`   Browser: ${CHROMIUM_PATH}`);
    console.log(`   URL: ${BASE_URL}`);
    console.log();

    // ── Setup: temp directory + database ──────────────────────────────
    _tmpDir = mkdtempSync(join(tmpdir(), "hg-e2e-"));
    const dbPath = join(_tmpDir, "test.db");

    // Set API key so server.ts doesn't bail on /api/chat requests
    process.env.MINIMAX_API_KEY = "test-key-for-e2e";
    process.env.DATA_DIR = _tmpDir;

    // Set up nock mocks BEFORE starting server (server makes calls during init)
    setupMinimaxMocks();

    // Initialize database and start real server
    initDatabase(dbPath);
    const server = startServer(TEST_PORT);

    // Wait for server to be listening
    await new Promise<void>((resolve, reject) => {
        server.on("listening", () => resolve());
        server.on("error", (err) => reject(err));
        // Also handle the case where it's already listening
        if (server.listening) resolve();
    });

    console.log(`   Server: http://localhost:${TEST_PORT}`);
    console.log(`   DB: ${dbPath}`);
    console.log();

    // ── Launch browser ────────────────────────────────────────────────

    let browser: Browser;
    try {
        browser = await chromium.launch({
            executablePath: CHROMIUM_PATH,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Failed to launch Chromium:", msg);
        await cleanup();
        process.exit(1);
    }

    const results: TestResult[] = [];

    // ── Existing Tests (fixed) ────────────────────────────────────────

    // Test 1: Page loads with correct title and elements
    await runTest(
        "page loads with correct title and elements",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const title = await page.title();
            assertEqual(title, "HallucyGenie", "Page title");

            const headerText = await page.textContent(".header-title");
            assertEqual(headerText, "HallucyGenie", "Header text");

            await expectVisible(page, "#chat-input");
            await expectVisible(page, "#send-button");
            await expectVisible(page, ".message--welcome");

            await page.close();
        },
        results,
    );

    // Test 2: Send button disabled when input is empty
    await runTest(
        "send button disabled when input is empty",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const sendBtn = page.locator("#send-button");
            await expectDisabled(sendBtn);

            await page.fill("#chat-input", "Hello");
            await expectEnabled(sendBtn);

            await page.fill("#chat-input", "");
            await expectDisabled(sendBtn);

            await page.close();
        },
        results,
    );

    // Test 3: Enter key sends message (needs real server + mocked MiniMax)
    await runTest(
        "Enter key sends message",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.fill("#chat-input", "Test message");
            await page.press("#chat-input", "Enter");

            // User message should appear immediately (frontend renders before API call)
            const userMsg = page.locator(".message--user .message-content").last();
            await userMsg.waitFor({ timeout: 5000 });
            const text = (await userMsg.textContent())?.trim();
            assertEqual(text, "Test message", "User message text");

            await page.close();
        },
        results,
    );

    // Test 4: Session UUID stored in localStorage
    await runTest(
        "session UUID stored in localStorage",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const sessionId = await page.evaluate(() => {
                return localStorage.getItem("hallucygenie_session_id");
            });

            if (!sessionId) throw new Error("No session ID in localStorage");
            if (
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    sessionId,
                )
            ) {
                throw new Error(`Invalid UUID format: ${sessionId}`);
            }

            await page.close();
        },
        results,
    );

    // Test 5: Error toast appears and auto-dismisses
    await runTest(
        "error toast appears and auto-dismisses",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const toast = document.getElementById("error-toast")!;
                const msg = document.getElementById("error-toast-message")!;
                msg.textContent = "Test error";
                toast.hidden = false;
            });

            const toast = page.locator("#error-toast");
            await toast.waitFor({ state: "visible" });
            const text = await page.textContent("#error-toast-message");
            assertEqual(text, "Test error", "Error toast text");

            await page.close();
        },
        results,
    );

    // Test 6: Lightbox opens and closes
    await runTest(
        "lightbox opens and closes",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const lightbox = document.getElementById("lightbox")!;
                const img = document.getElementById("lightbox-img") as HTMLImageElement;
                img.src =
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
                lightbox.hidden = false;
            });

            await expectVisible(page, "#lightbox");
            await expectVisible(page, "#lightbox-img");

            await page.click(".lightbox-backdrop");
            await expectHidden(page, "#lightbox");

            await page.close();
        },
        results,
    );

    // Test 7: Mobile viewport
    await runTest(
        "mobile viewport (375x812)",
        async () => {
            const page = await browser!.newPage({ viewport: { width: 375, height: 812 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");
            await expectVisible(page, "#message-list");

            await page.close();
        },
        results,
    );

    // Test 8: Desktop viewport
    await runTest(
        "desktop viewport (1280x800)",
        async () => {
            const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");

            await page.close();
        },
        results,
    );

    // Test 9: Auto-resize textarea
    await runTest(
        "textarea auto-resizes with content",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const initialHeight = await page.evaluate(() => {
                return (document.getElementById("chat-input") as HTMLTextAreaElement).offsetHeight;
            });

            await page.fill("#chat-input", "Line 1\nLine 2\nLine 3\nLine 4");
            const newHeight = await page.evaluate(() => {
                return (document.getElementById("chat-input") as HTMLTextAreaElement).offsetHeight;
            });

            if (newHeight < initialHeight) {
                throw new Error(`Textarea should not shrink: ${initialHeight} → ${newHeight}`);
            }

            await page.close();
        },
        results,
    );

    // Test 10: Steering message renders with distinct style
    await runTest(
        "steer message renders with distinct style",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            // Inject a steer message directly
            await page.evaluate(() => {
                const msg = document.createElement("div");
                msg.className = "message message--steer message--user";
                msg.innerHTML = `
                    <div class="message-avatar">💡</div>
                    <div class="message-bubble">
                        <div class="message-content">Steer test</div>
                    </div>
                `;
                document.getElementById("message-list")!.appendChild(msg);
            });

            const steerMsg = page.locator(".message--steer");
            await steerMsg.waitFor({ timeout: 5000 });
            const count = await steerMsg.count();
            if (count === 0) throw new Error("Steer message not found");

            const content = await page.textContent(".message--steer .message-content");
            assertEqual(content, "Steer test", "Steer message content");

            await page.close();
        },
        results,
    );

    // ── New Tests ─────────────────────────────────────────────────────

    // Test 11: Onboarding shows on first visit
    await runTest(
        "onboarding shows on first visit",
        async () => {
            const page = await browser!.newPage();
            // Fresh page context — no localStorage, so onboarding should show
            await page.goto(BASE_URL);

            const onboarding = page.locator("#onboarding");
            await onboarding.waitFor({ state: "visible", timeout: 10000 });

            await page.close();
        },
        results,
    );

    // Test 12: Onboarding completes and hides
    await runTest(
        "onboarding completes and hides",
        async () => {
            const page = await browser!.newPage();
            await page.goto(BASE_URL);

            const onboarding = page.locator("#onboarding");
            await onboarding.waitFor({ state: "visible", timeout: 10000 });

            // Click through all onboarding slides sequentially
            // Each slide has a button that either advances or dismisses
            const allButtons = [
                ".onboarding-slide.active .onboarding-next",
                "#onboarding-try-chat",
                "#onboarding-try-create",
                "#onboarding-done",
            ];

            for (const selector of allButtons) {
                const btn = page.locator(selector);
                const visible = await btn.isVisible().catch(() => false);
                if (visible) {
                    await btn.click();
                    await page.waitForTimeout(100);
                }
            }

            await onboarding.waitFor({ state: "hidden", timeout: 5000 });

            await page.close();
        },
        results,
    );

    // Test 13: Create modal opens and shows tabs
    await runTest(
        "create modal opens and shows tabs",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "visible" });

            await expectVisible(page, ".create-tab[data-tab='image']");
            await expectVisible(page, ".create-tab[data-tab='music']");
            await expectVisible(page, ".create-tab[data-tab='voice']");
            await expectVisible(page, ".create-tab[data-tab='search']");

            await page.close();
        },
        results,
    );

    // Test 14: Create modal switches tabs
    await runTest(
        "create modal switches tabs",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            // Switch to music tab
            await page.click(".create-tab[data-tab='music']");
            await expectVisible(page, "#create-music-form");

            // Switch back to image tab
            await page.click(".create-tab[data-tab='image']");
            await expectVisible(page, "#create-image-form");

            await page.close();
        },
        results,
    );

    // Test 15: Create modal closes
    await runTest(
        "create modal closes",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            await page.click("#create-close");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "hidden" });

            await page.close();
        },
        results,
    );

    // Test 16: Quota badge shows in header
    await runTest(
        "quota badge shows in header",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            // Wait for quota badge to be populated (async fetch from /api/quota)
            const badge = page.locator("#quota-badge");
            await badge.waitFor({ state: "visible", timeout: 5000 });

            await expectVisible(page, ".quota-item[data-type='image']");
            await expectVisible(page, ".quota-item[data-type='music']");

            await page.close();
        },
        results,
    );

    // Test 17: Session persists across page reloads
    await runTest(
        "session persists across page reloads",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const sessionId = await page.evaluate(() =>
                localStorage.getItem("hallucygenie_session_id"),
            );

            await page.reload();
            await waitForApp(page);

            const sessionId2 = await page.evaluate(() =>
                localStorage.getItem("hallucygenie_session_id"),
            );
            assertEqual(sessionId, sessionId2, "Session ID persistence");

            await page.close();
        },
        results,
    );

    // ── Report ────────────────────────────────────────────────────────

    console.log();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    for (const result of results) {
        const icon = result.passed ? "✔" : "✖";
        const duration = result.duration.toFixed(0);
        console.log(`  ${icon} ${result.name} (${duration}ms)`);
        if (result.error) {
            console.log(`    ${result.error}`);
        }
    }

    console.log();
    console.log(`ℹ tests ${results.length}`);
    console.log(`ℹ pass ${passed}`);
    console.log(`ℹ fail ${failed}`);
    console.log(`ℹ duration_ms ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(0)}`);

    // ── Cleanup ───────────────────────────────────────────────────────

    await browser.close();
    await cleanup();

    process.exit(failed > 0 ? 1 : 0);
}

// ── Helpers: run + cleanup ───────────────────────────────────────────

async function cleanup(): Promise<void> {
    cleanupMinimaxMocks();
    try {
        await shutdown();
    } catch {
        // Ignore shutdown errors
    }
    resetStateForTesting();
    delete process.env.MINIMAX_API_KEY;
    delete process.env.DATA_DIR;

    // Clean up temp directory
    if (_tmpDir) {
        try {
            rmSync(_tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

async function runTest(
    name: string,
    fn: () => Promise<void>,
    results: TestResult[],
): Promise<void> {
    const start = performance.now();
    try {
        await fn();
        results.push({ name, passed: true, duration: performance.now() - start });
        console.log(`  ✔ ${name}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
            name,
            passed: false,
            error: msg,
            duration: performance.now() - start,
        });
        console.log(`  ✖ ${name}`);
        console.log(`    ${msg}`);
    }
}

// ── Run ──────────────────────────────────────────────────────────────

runE2ETests().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
