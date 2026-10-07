import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
export default defineConfig({
  ...config,
  testDir: "./tests/admin-browser",
  outputDir: "test-results-admin",
  workers: 1,
  timeout: 120000,
  use: {
    ...config.use,
    baseURL: "http://localhost:3001",
    actionTimeout: 10000,
  },
  webServer: {
    command: "node --import tsx scripts/start-admin-tests.ts",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
