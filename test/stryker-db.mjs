export default {
    concurrency: 2,
    coverageAnalysis: "perTest",
    mutate: ["src/db.ts"],
    thresholds: { high: 80, low: 60, break: 70 },
    testRunner: "command",
    commandRunner: {
        command: "bun test test/unit/db.test.ts"
    },
    reporters: ["clear-text", "progress", "html"],
    htmlReporter: { fileName: "reports/mutation/db.html" },
    timeoutMS: 120000
};
