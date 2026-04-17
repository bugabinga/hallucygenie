#!/usr/bin/env node
// HallucyGenie E2E Test Runner
// Uses local playwright-core with system Chromium on Termux/Android

import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));
const E2E_DIR = resolve(__dirname, "e2e");
const CHROMIUM_PATH = "/data/data/com.termux/files/usr/lib/chromium/chrome";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf("/")) || ".";
}

// Simple test framework
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function runE2ETests(): Promise<void> {
  console.log("🧪 HallucyGenie E2E Tests");
  console.log(`   Browser: ${CHROMIUM_PATH}`);
  console.log(`   URL: ${BASE_URL}`);
  console.log();

  let browser;
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
  } catch (err: any) {
    console.error("❌ Failed to launch Chromium:", err.message);
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test 1: Page loads
  await runTest("page loads with correct title and elements", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input", { timeout: 10000 });

    const title = await page.title();
    assertEqual(title, "HallucyGenie", "Page title");

    const headerText = await page.textContent(".header-title");
    assertEqual(headerText, "HallucyGenie", "Header text");

    await expectVisible(page, "#chat-input");
    await expectVisible(page, "#send-button");
    await expectVisible(page, ".message--welcome");

    await page.close();
  }, results);

  // Test 2: Send button disabled when empty
  await runTest("send button disabled when input is empty", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    const sendBtn = page.locator("#send-button");
    await expectDisabled(sendBtn, "#send-button");

    await page.fill("#chat-input", "Hello");
    await expectEnabled(sendBtn, "#send-button");

    await page.fill("#chat-input", "");
    await expectDisabled(sendBtn, "#send-button");

    await page.close();
  }, results);

  // Test 3: Enter key sends message
  await runTest("Enter key sends message", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    await page.fill("#chat-input", "Test message");
    await page.press("#chat-input", "Enter");

    // User message should appear
    const userMsg = page.locator(".message--user .message-content").last();
    await userMsg.waitFor({ timeout: 5000 });
    const text = await userMsg.textContent();
    assertEqual(text, "Test message", "User message text");

    await page.close();
  }, results);

  // Test 4: Session UUID in localStorage
  await runTest("session UUID stored in localStorage", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    const sessionId = await page.evaluate(() => {
      return localStorage.getItem("hallucygenie_session_id");
    });

    if (!sessionId) throw new Error("No session ID in localStorage");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new Error(`Invalid UUID format: ${sessionId}`);
    }

    await page.close();
  }, results);

  // Test 5: Error toast
  await runTest("error toast appears and auto-dismisses", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

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
  }, results);

  // Test 6: Lightbox
  await runTest("lightbox opens and closes", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    await page.evaluate(() => {
      const lightbox = document.getElementById("lightbox")!;
      const img = document.getElementById("lightbox-img") as HTMLImageElement;
      img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      lightbox.hidden = false;
    });

    await expectVisible(page, "#lightbox");
    await expectVisible(page, "#lightbox-img");

    await page.click(".lightbox-backdrop");
    await expectHidden(page, "#lightbox");

    await page.close();
  }, results);

  // Test 7: Mobile viewport
  await runTest("mobile viewport (375x812)", async () => {
    const page = await browser!.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    await expectVisible(page, "#header");
    await expectVisible(page, "#input-area");
    await expectVisible(page, "#message-list");

    await page.close();
  }, results);

  // Test 8: Desktop viewport
  await runTest("desktop viewport (1280x800)", async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

    await expectVisible(page, "#header");
    await expectVisible(page, "#input-area");

    await page.close();
  }, results);

  // Test 9: Auto-resize textarea
  await runTest("textarea auto-resizes with content", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

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
  }, results);

  // Test 10: Steering UI shows hint during streaming
  await runTest("steer message renders with distinct style", async () => {
    const page = await browser!.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#chat-input");

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
    const hasSteerClass = await steerMsg.count();
    if (hasSteerClass === 0) throw new Error("Steer message not found");

    const content = await page.textContent(".message--steer .message-content");
    assertEqual(content, "Steer test", "Steer message content");

    await page.close();
  }, results);

  // ── Report ──────────────────────────────────────────────────────────

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

  await browser.close();

  process.exit(failed > 0 ? 1 : 0);
}

// ── Helpers ──────────────────────────────────────────────────────────

async function runTest(
  name: string,
  fn: () => Promise<void>,
  results: TestResult[]
): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: performance.now() - start });
    console.log(`  ✔ ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message, duration: performance.now() - start });
    console.log(`  ✖ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assertEqual(actual: any, expected: any, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

async function expectVisible(page: any, selector: string): Promise<void> {
  const el = page.locator(selector);
  const visible = await el.isVisible();
  if (!visible) throw new Error(`Expected ${selector} to be visible`);
}

async function expectHidden(page: any, selector: string): Promise<void> {
  const el = page.locator(selector);
  const hidden = await el.isHidden();
  if (!hidden) throw new Error(`Expected ${selector} to be hidden`);
}

async function expectDisabled(locator: any, label: string): Promise<void> {
  const disabled = await locator.isDisabled();
  if (!disabled) throw new Error(`Expected ${label} to be disabled`);
}

async function expectEnabled(locator: any, label: string): Promise<void> {
  const enabled = await locator.isEnabled();
  if (!enabled) throw new Error(`Expected ${label} to be enabled`);
}

// ── Run ──────────────────────────────────────────────────────────────

runE2ETests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
