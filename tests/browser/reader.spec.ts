import { test, expect } from "@playwright/test";
test("homepage, catalogue, title, reader and local history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bir sahifa. Butun bir olam." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/catalog?type=Manga");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.locator(".cover-card").click();
  await expect(
    page.getByRole("heading", { name: "Salt & Steel", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "O‘qishni boshlash", exact: true })
    .click();
  await expect(page.locator(".reader-page img").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".reader-page img")
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Reader sozlamalari" }).click();
  await page.getByLabel("O‘qish usuli").selectOption("paged");
  await page.getByRole("button", { name: "Sozlamalarni yopish" }).click();
  await page
    .getByRole("button", { name: "Keyingi sahifa", exact: true })
    .click();
  await expect(page.getByLabel("Sahifa raqami")).toHaveValue("2");
  await page.waitForTimeout(450);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Davom ettiring", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("admin login form and invalid credentials", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("Login", { exact: true }).fill("invalid_" + Date.now());
  await page.getByLabel("Parol", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Login yoki parol" }),
  ).toContainText("Login yoki parol noto‘g‘ri");
});
test("image failure shows working retry control", async ({ page }) => {
  const titles = await (await page.request.get("/api/public/titles")).json();
  const chapter = titles[0].chapters[0];
  let fail = true;
  await page.route("**/api/assets/**", async (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto("/read/" + chapter.id);
  await expect(page.getByText("Sahifa yuklanmadi.").first()).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Qayta yuklash" }).first().click();
  await expect
    .poll(() =>
      page
        .locator(".reader-page img")
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
});

test("shareable catalogue filters, author/alternative search, reset and sorting", async ({
  page,
}) => {
  await page.goto("/catalog?q=INKORA%20Studio");
  await expect(page.locator(".cover-card")).toHaveCount(3);
  await page.getByLabel("Barcha turlar").selectOption("Webtoon");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("Barcha turlar")).toHaveValue("Webtoon");
  await page.getByRole("button", { name: "Tozalash", exact: true }).click();
  await expect(page.getByLabel("Katalogda qidirish")).toHaveValue("");
  await expect(page.locator(".cover-card")).toHaveCount(3);
  await page.getByLabel("Katalogda qidirish").fill("So‘nggi");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Tozalash", exact: true }).click();
  await page.getByLabel("Barcha janrlar").selectOption("Romance");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.getByLabel("Barcha holatlar").selectOption("Completed");
  await page.getByLabel("Barcha yillar").selectOption("2026");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.goto("/catalog?sort=alpha&page=999");
  await expect(page.locator(".cover-card")).toHaveCount(3);
  await expect(page.locator(".cover-card h3").first()).toHaveText(
    "After the Rain",
  );
  await page.goto("/catalog?q=not-a-real-title");
  await expect(
    page.getByRole("heading", { name: "Asar topilmadi" }),
  ).toBeVisible();
});

test("reader chapter navigation, keyboard, preferences and exact resume", async ({
  page,
  isMobile,
}) => {
  const titles = await (await page.request.get("/api/public/titles")).json();
  const title = titles.find((t: any) => t.slug === "the-last-lantern");
  const chapters = [...title.chapters].sort(
    (a: any, b: any) => a.number - b.number,
  );
  expect(chapters.map((c: any) => c.number)).toEqual([1, 1.5, 2]);
  await page.goto("/read/" + chapters[0].id);
  await page.getByRole("button", { name: "Reader sozlamalari" }).click();
  await page.getByLabel("O‘qish usuli").selectOption("paged");
  await page.getByLabel("Sahifa eni").selectOption("original");
  await page.getByRole("button", { name: "Yorug‘ fon" }).click();
  if (!isMobile) {
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "O‘qish sozlamalari" }),
    ).toHaveCount(0);
  } else
    await page.getByRole("button", { name: "Sozlamalarni yopish" }).click();
  await page
    .getByRole("button", { name: "Keyingi sahifa", exact: true })
    .click();
  await expect(page.getByLabel("Sahifa raqami")).toHaveValue("2");
  if (!isMobile) {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Sahifa raqami")).toHaveValue("3");
    await page.keyboard.press("ArrowLeft");
  }
  await expect(page.locator(".reader")).toHaveClass(
    /reader-light.*reader-original/,
  );
  await page.waitForTimeout(450);
  await page.goto("/title/the-last-lantern");
  await expect(
    page.getByRole("link", { name: "Davom ettirish", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Davom ettirish", exact: true }).click();
  await expect(page.getByLabel("Sahifa raqami")).toHaveValue("2");
  await page
    .getByRole("link", { name: "Keyingi bob", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Bobni tanlash")).toHaveValue(chapters[1].id);
  await page.getByLabel("Bobni tanlash").selectOption(chapters[2].id);
  await expect(
    page.getByRole("link", { name: "Keyingi bob", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Oldingi bob", exact: true }).click();
  await expect(page.getByLabel("Bobni tanlash")).toHaveValue(chapters[1].id);
});

test("header search, recent history, responsive layout, routes and SEO", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.getByLabel("Asar qidirish").fill("Salt");
  await expect(page.locator(".search-results a").first()).toContainText(
    "Salt & Steel",
  );
  await page.locator(".search-results a").first().click();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    /\/title\/salt-and-steel$/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Salt & Steel",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("inkora.recent") || "[]").length,
      ),
    )
    .toBeGreaterThan(0);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Yaqinda ko‘rganlar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tarixni tozalash" }).click();
  await expect(
    page.getByRole("heading", { name: "Yaqinda ko‘rganlar" }),
  ).toHaveCount(0);
  for (const route of ["/", "/catalog", "/title/the-last-lantern"]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/${isMobile ? "mobile" : "desktop"}-${route === "/" ? "home" : route === "/catalog" ? "catalog" : "title"}.png`,
      fullPage: true,
    });
  }
  const response = await page.goto("/title/missing-series");
  expect(response?.status()).toBe(404);
});

test("long webtoon mounts only a rolling image window and restores distant progress", async ({
  page,
}) => {
  const { one, list, insert, remove, uid, now } =
    await import("../../server/db");
  const { storage } = await import("../../server/storage");
  const sample = (await list("assets", {}, undefined, -1)).find(
    (a) => a.chapter_id,
  );
  const titleId = uid(),
    chapterId = uid(),
    assetId = uid();
  await insert("titles", {
    id: titleId,
    slug: "performance-" + titleId,
    title: "Long webtoon test",
    type: "Webtoon",
    visibility: "Published",
    created_at: now(),
    updated_at: now(),
  });
  await insert("chapters", {
    id: chapterId,
    title_id: titleId,
    number: 10.1,
    sort_order: 10.1,
    status: "Published",
    created_at: now(),
    updated_at: now(),
  });
  await insert("assets", {
    ...sample!,
    id: assetId,
    title_id: titleId,
    chapter_id: chapterId,
    responsive_ready: 0,
  });
  const ids: string[] = [];
  try {
    for (let position = 0; position < 100; position++) {
      const id = uid();
      ids.push(id);
      await insert("chapter_pages", {
        id,
        chapter_id: chapterId,
        asset_id: assetId,
        position,
        rotation: 0,
      });
    }
    await page.goto("/read/" + chapterId);
    await expect(page.locator(".reader-page")).toHaveCount(100);
    await expect
      .poll(() => page.locator(".reader-page img").count())
      .toBeLessThanOrEqual(6);
    await expect
      .poll(() =>
        page
          .locator(".reader-page img")
          .first()
          .evaluate((i: HTMLImageElement) => i.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByLabel("Sahifa raqami").fill("80");
    await expect(page.getByLabel("Sahifa raqami")).toHaveValue("80");
    await expect
      .poll(() => page.locator(".reader-page img").count())
      .toBeLessThanOrEqual(7);
    await page.waitForTimeout(600);
    await page.goto("/read/" + chapterId + "?resume=1");
    await expect(page.getByLabel("Sahifa raqami")).toHaveValue("80");
    await expect
      .poll(() => page.locator(".reader-page img").count())
      .toBeLessThanOrEqual(7);
    expect((await one("chapters", { id: chapterId }))?.page_count).toBe(100);
  } finally {
    for (const id of ids) await remove("chapter_pages", id);
    await remove("assets", assetId);
    await remove("chapters", chapterId);
    await remove("titles", titleId);
    for (const width of [640, 960, 1280].filter((w) => w < sample!.width))
      await storage.delete(`assets/${assetId}/responsive-${width}`);
  }
});
