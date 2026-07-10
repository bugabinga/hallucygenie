export default {
    concurrency: 5,
    coverageAnalysis: "perTest",
    mutate: ["src/tools.ts"],
    thresholds: { high: 80, low: 60, break: 70 },
    testRunner: "command",
    commandRunner: {
        command: "node --test test/unit/tools.test.ts"
    },
    reporters: ["clear-text", "progress", "html"],
    htmlReporter: { fileName: "reports/mutation/tools.html" },
    timeoutMS: 120000
};
