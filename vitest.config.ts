import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/globalSetup.ts"],
    env: { DATABASE_URL: "file:./test.db", AI_PROVIDER: "rules", MONITOR_INTERVAL_MINUTES: "0" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
