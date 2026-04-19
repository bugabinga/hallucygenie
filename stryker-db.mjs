export default {
    concurrency: 2,
    coverageAnalysis: "perTest",
    mutate: ["db.ts"],
    thresholds: { high: 80, low: 60, break: 70 },
    testRunner: "command",
    commandRunner: {
        command: "node --experimental-strip-types --no-warnings --test db.test.ts",
    },
    reporters: ["clear-text", "progress"],
    timeoutMS: 120000,
};
