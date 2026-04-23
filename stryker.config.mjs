export default {
    concurrency: 1,
    coverageAnalysis: "perTest",
    mutate: ["agent.ts"],
    thresholds: { high: 80, low: 60, break: 70 },
    testRunner: "command",
    commandRunner: {
        command: "node --experimental-strip-types --no-warnings --test agent.test.ts",
    },
    reporters: ["clear-text", "progress"],
    timeoutFactor: 2,
    timeoutMS: 120000,
};
