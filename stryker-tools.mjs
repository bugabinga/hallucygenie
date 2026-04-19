export default {
  concurrency: 3,
  coverageAnalysis: "perTest",
  mutate: ["tools.ts"],
  thresholds: { high: 80, low: 60, break: 70 },
  testRunner: "command",
  commandRunner: {
    command: "node --experimental-strip-types --no-warnings --test tools.test.ts",
  },
  reporters: ["clear-text", "progress"],
  timeoutMS: 120000,
};
