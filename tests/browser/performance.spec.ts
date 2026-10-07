import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

test("100 distinct chapter pages request only visible/near images and never load CMS/upload code", async ({
  page,
}, info) => {
  const { insert, remove, uid, now } = await import("../../server/db");
  const { storage } = await import("../../server/storage");
  const title = uid(),
    chapter = uid(),
    key = `tests/${chapter}/master.png`,
    assets: string[] = [],
    ids: string[] = [];
  const bytes = await sharp(
    Buffer.from(
      '<svg width="800" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="1200" fill="white"/><text x="70" y="110" font-size="36" fill="black">Sharp dialogue — performance fixture</text><path d="M50 200H750M50 202H750" stroke="black"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  await storage.put(key, bytes, "image/png");
  await insert("titles", {
    id: title,
    slug: "transfer-" + title,
    title: "Bounded transfer test",
    visibility: "Published",
    created_at: now(),
    updated_at: now(),
  });
  await insert("chapters", {
    id: chapter,
    title_id: title,
    number: 1,
    sort_order: 1,
    status: "Published",
    created_at: now(),
    updated_at: now(),
  });
  const requests = new Set<string>(),
    js: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/api\/assets\/([^?]+)/);
    if (m) requests.add(m[1]);
  });
  page.on("response", async (r) => {
    if (r.url().includes("/_next/") && r.url().split("?")[0].endsWith(".js"))
      js.push(await r.text().catch(() => ""));
  });
  try {
    for (let position = 0; position < 100; position++) {
      const asset = uid(),
        id = uid();
      assets.push(asset);
      ids.push(id);
      await insert("assets", {
        id: asset,
        title_id: title,
        chapter_id: chapter,
        original_key: key,
        delivery_key: key,
        mime: "image/png",
        width: 800,
        height: 1200,
        bytes: bytes.length,
        source_bytes: bytes.length,
        filename: `${position + 1}.png`,
        created_at: now(),
        responsive_ready: 0,
      });
      await insert("chapter_pages", {
        id,
        chapter_id: chapter,
        asset_id: asset,
        position,
        rotation: 0,
      });
    }
    await page.goto("/read/" + chapter);
    await expect(page.locator(".reader-page")).toHaveCount(100);
    await expect
      .poll(() =>
        page
          .locator(".reader-page img")
          .first()
          .evaluate((i: HTMLImageElement) => i.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(400);
    const initialRequests = requests.size;
    expect(requests.size).toBeLessThanOrEqual(7);
    expect([...requests].every((id) => assets.slice(0, 7).includes(id))).toBe(
      true,
    );
    expect(
      await page.locator('link[rel="preload"][as="image"]').count(),
    ).toBeLessThanOrEqual(3);
    expect(await page.locator(".reader-page img").count()).toBeLessThanOrEqual(
      7,
    );
    await page.getByLabel("Sahifa raqami").fill("80");
    await expect(page.getByLabel("Sahifa raqami")).toHaveValue("80");
    await expect
      .poll(() =>
        page
          .locator("#page-79 img")
          .evaluate((i: HTMLImageElement) => i.naturalWidth),
      )
      .toBeGreaterThan(0);
    const afterJump = requests.size;
    expect(requests.size).toBeLessThan(20);
    await page.getByLabel("Sahifa raqami").fill("1");
    await expect(page.getByLabel("Sahifa raqami")).toHaveValue("1");
    await expect
      .poll(() => page.locator(".reader-page img").count())
      .toBeLessThanOrEqual(7);
    await page.waitForTimeout(200);
    expect(requests.size).toBeLessThan(20);
    expect(assets.slice(7, 76).some((id) => requests.has(id))).toBe(false);
    await page.getByRole("button", { name: "Reader sozlamalari" }).click();
    await page.getByLabel("O‘qish usuli").selectOption("paged");
    await page.getByRole("button", { name: "Sozlamalarni yopish" }).click();
    await expect(page.locator(".reader-page img")).toHaveCount(1);
    expect(js.join("\n")).not.toMatch(
      /Yuklanmoqda.*Processing|Administratorlar|inkora_session=|SUPABASE_SERVICE_ROLE_KEY|pdfjs-dist|yauzl|chapter\.bulk_/,
    );
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      `artifacts/${info.project.name}-reader-performance.json`,
      JSON.stringify(
        {
          chapter_pages: 100,
          initial_distinct_image_requests: initialRequests,
          after_distant_jump_distinct_image_requests: afterJump,
          paged_mounted_images: await page.locator(".reader-page img").count(),
          reader_js_files: js.length,
          reader_js_decoded_bytes: js.reduce(
            (n, s) => n + Buffer.byteLength(s),
            0,
          ),
          reader_js_gzip_estimate_bytes: js.reduce(
            (n, s) => n + gzipSync(s).length,
            0,
          ),
          cms_markers_absent: true,
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: `artifacts/${info.project.name}-long-reader.png`,
    });
  } finally {
    // Close the route before removing fixtures so no authorized late image request races cleanup.
    await page.goto("/404-transfer-finished");
    for (const id of ids) await remove("chapter_pages", id);
    for (const asset of assets) {
      await remove("assets", asset);
      await storage.delete(`assets/${asset}/responsive-640`);
    }
    await remove("chapters", chapter);
    await remove("titles", title);
    await storage.delete(key);
  }
});
