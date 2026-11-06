import { defineConfig } from "@playwright/test";

// End-to-end tests run against a running server (npm run build && npm start, or npm run dev).
// They reset and use the DEMO DATA in the configured database.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", screenshot: "only-on-failure", viewport: { width: 1440, height: 900 } },
});
