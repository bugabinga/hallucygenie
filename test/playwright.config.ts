import { existsSync } from "node:fs";

const chromiumPath = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
].find((path) => path && existsSync(path));

export default {
    testDir: "../e2e",
    timeout: 30000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        headless: true,
        launchOptions: {
            executablePath: chromiumPath,
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        },
    },
    projects: [
        {
            name: "chromium",
            use: { browserName: "chromium" },
        },
    ],
};
