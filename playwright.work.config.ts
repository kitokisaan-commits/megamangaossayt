import config from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...config,
  testDir: "./tests/work-preview",
  outputDir: "test-results-work-preview",
  use: { ...config.use, baseURL: "http://127.0.0.1:4318" },
  webServer: {
    command: "node scripts/serve-work-preview.mjs",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: false,
  },
});
