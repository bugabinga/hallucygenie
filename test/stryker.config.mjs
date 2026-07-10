export default {
    concurrency: 4,
    coverageAnalysis: "perTest",
    mutate: ["src/agent.ts"],
    thresholds: { high: 80, low: 60, break: 70 },
    testRunner: "command",
    commandRunner: {
        command: "node --test test/unit/agent.test.ts"
    },
    reporters: ["clear-text", "progress", "html"],
    htmlReporter: { fileName: "reports/mutation/agent.html" },
    timeoutFactor: 2,
    timeoutMS: 15000
};
