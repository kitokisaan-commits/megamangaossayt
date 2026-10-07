// Ephemeral real-server test database. Never resets development or production data.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const directory = await mkdtemp(path.join(tmpdir(), "inkora-admin-browser-"));
process.env.DATA_DIR = directory;
process.env.DATA_ADAPTER = "local";
process.env.APP_URL = "http://localhost:3001";
const { migrateLocal, insert } = await import("../server/db");
const { createAdmin } = await import("../server/auth");
await migrateLocal();
await insert("site_settings", {
  id: "main",
  name: "INKORA",
  description: "CMS acceptance tests",
  max_upload_mb: 100,
  max_pages: 500,
});
await createAdmin(
  "dieheartman",
  "Acceptance owner",
  "dieheartman",
  "SUPERADMIN",
);
await createAdmin("owner_mobile", "Mobile owner", "dieheartman", "SUPERADMIN");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});
