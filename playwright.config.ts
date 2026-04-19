import { defineConfig } from "playwright-core";

export default defineConfig({
    testDir: "./e2e",
    timeout: 30000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        headless: true,
        // Use system Chromium on Termux/Android
        launchOptions: {
            executablePath: "/data/data/com.termux/files/usr/lib/chromium/chrome",
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        },
    },
    env: {
        PLAYWRIGHT_ALLOW_ANDROID: "1",
    },
    projects: [
        {
            name: "chromium",
            use: {
                browserName: "chromium",
            },
        },
    ],
});
