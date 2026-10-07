// Portable browser extraction for CI filesystems that disallow tar ownership changes.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const base = path.resolve(
  path.dirname(require.resolve("@sparticuz/chromium")),
  "../bin",
);
const out = path.resolve(".sites-runtime/test-browser");
mkdirSync(out, { recursive: true });
for (const file of ["chromium.br", "fonts.tar.br", "swiftshader.tar.br"]) {
  const bytes = brotliDecompressSync(readFileSync(path.join(base, file)));
  if (file.includes(".tar.")) {
    const result = spawnSync(
      "tar",
      ["--no-same-owner", "--no-same-permissions", "-xf", "-", "-C", out],
      { input: bytes, maxBuffer: 1024 * 1024 },
    );
    if (result.status !== 0) throw new Error(result.stderr.toString());
  } else {
    writeFileSync(path.join(out, "chromium"), bytes);
    chmodSync(path.join(out, "chromium"), 0o755);
  }
}
console.log(path.join(out, "chromium"));
