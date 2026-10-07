import { defineConfig, devices } from "@playwright/test";
import chromium from "@sparticuz/chromium";
const bundledBrowser =
  process.platform === "linux"
    ? {
        executablePath:
          process.env.BROWSER_EXECUTABLE_PATH ||
          (await chromium.executablePath()),
        args: chromium.args.filter(
          (arg) =>
            ![
              "--single-process",
              "--disable-web-security",
              "--allow-running-insecure-content",
            ].includes(arg),
        ),
      }
    : undefined;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: bundledBrowser,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command:
          "node node_modules/next/dist/bin/next start --hostname 127.0.0.1",
        url: "http://localhost:3000",
        reuseExistingServer: true,
      },
});
