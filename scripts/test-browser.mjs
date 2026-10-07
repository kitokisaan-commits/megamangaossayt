import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const env = { ...process.env };
if (process.platform === "linux" && !env.BROWSER_EXECUTABLE_PATH) {
  const base = path.resolve(".sites-runtime/test-browser");
  let ready = false;
  try {
    ready = statSync(path.join(base, "chromium")).size > 1000000;
  } catch {}
  if (!ready) {
    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-test-browser.mjs"],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
  env.BROWSER_EXECUTABLE_PATH = path.join(base, "chromium");
  env.FONTCONFIG_PATH = path.join(base, "fonts");
  env.LD_LIBRARY_PATH = [base, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
}
const result = spawnSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);
process.exit(result.status || 0);
