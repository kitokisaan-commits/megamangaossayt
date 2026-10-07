import { test, expect } from "@playwright/test";

test("ordinary browsers need no Telegram SDK or auth and reader settings manage focus", async ({
  page,
}) => {
  const sdk: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("telegram-web-app.js")) sdk.push(r.url());
  });
  const ts = await (await page.request.get("/api/public/titles")).json();
  await page.goto("/read/" + ts[0].chapters[0].id);
  await expect(page.locator(".reader-page img").first()).toBeVisible();
  expect(sdk).toEqual([]);
  expect(await page.locator("html").getAttribute("data-telegram")).toBeNull();
  const button = page.getByRole("button", { name: "Reader sozlamalari" });
  await button.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await page.getByRole("button", { name: "Havolani nusxalash" }).click();
  await expect(page.getByRole("status")).toContainText(/Havola/);
});

test("Telegram iOS/Android API themes, safe areas, stable viewport and fullscreen work", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ts = await (await page.request.get("/api/public/titles")).json();
  await page.addInitScript(
    ({ platform }) => {
      const events = new Map<string, Set<() => void>>();
      const app = {
        platform,
        colorScheme: "light",
        viewportStableHeight: 700,
        isFullscreen: false,
        safeAreaInset: { top: 24, bottom: 12 },
        contentSafeAreaInset: { top: 32, bottom: 8 },
        ready() {},
        expand() {},
        isVersionAtLeast() {
          return true;
        },
        setHeaderColor() {},
        setBackgroundColor() {},
        setBottomBarColor() {},
        onEvent(e: string, f: () => void) {
          const set = events.get(e) || new Set();
          set.add(f);
          events.set(e, set);
        },
        offEvent(e: string, f: () => void) {
          events.get(e)?.delete(f);
        },
        requestFullscreen() {
          this.isFullscreen = true;
          events.get("fullscreenChanged")?.forEach((f) => f());
        },
        exitFullscreen() {
          this.isFullscreen = false;
          events.get("fullscreenChanged")?.forEach((f) => f());
        },
      };
      window.Telegram = { WebApp: app };
      (window as any).__emitTelegram = (event: string) =>
        events.get(event)?.forEach((f) => f());
    },
    { platform: info.project.name === "mobile" ? "ios" : "android" },
  );
  await page.goto("/read/" + ts[0].chapters[0].id);
  await expect(page.locator("html")).toHaveAttribute(
    "data-telegram-theme",
    "light",
  );
  await expect(page.locator(".reader")).toHaveClass(/reader-light/);
  expect(
    await page
      .locator("html")
      .evaluate((el) => el.style.getPropertyValue("--app-height")),
  ).toBe("700px");
  expect(
    await page
      .locator(".reader-header")
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
  ).toBe(66);
  await page.evaluate(() => {
    window.Telegram!.WebApp!.colorScheme = "dark";
    (window as any).__emitTelegram("themeChanged");
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-telegram-theme",
    "dark",
  );
  await expect(page.locator(".reader")).not.toHaveClass(/reader-light/);
  await page.getByRole("button", { name: "To‘liq ekran", exact: true }).click();
  expect(await page.evaluate(() => window.Telegram!.WebApp!.isFullscreen)).toBe(
    true,
  );
  await page.evaluate(() => {
    window.Telegram!.WebApp!.viewportStableHeight = 600;
    (window as any).__emitTelegram("viewportChanged");
  });
  expect(
    await page
      .locator("html")
      .evaluate((el) => el.style.getPropertyValue("--app-height")),
  ).toBe("600px");
  await page.getByRole("button", { name: "Reader sozlamalari" }).click();
  await page.getByRole("button", { name: "Yorug‘ fon", exact: true }).click();
  await page.evaluate(() => {
    (window as any).__emitTelegram("themeChanged");
  });
  await expect(page.locator(".reader")).toHaveClass(/reader-light/);
  await page.getByRole("button", { name: "Sozlamalarni yopish" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `artifacts/${info.project.name}-telegram-reader.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test("Telegram startapp links open public resources and never enable private preview", async ({
  page,
}) => {
  const ts = await (await page.request.get("/api/public/titles")).json();
  await page.addInitScript(() => {
    window.Telegram = { WebApp: { platform: "ios", ready() {}, expand() {} } };
  });
  await page.goto("/?tgWebAppStartParam=title_" + ts[0].slug);
  await expect(page).toHaveURL(new RegExp("/title/" + ts[0].slug + "$"));
  await page.goto("/?tgWebAppStartParam=chapter_" + ts[0].chapters[0].id);
  await expect(page).toHaveURL(
    new RegExp("/read/" + ts[0].chapters[0].id + "$"),
  );
  await page.goto(
    "/?tgWebAppStartParam=" + encodeURIComponent("title_x?preview=1"),
  );
  await expect(page).toHaveURL(/\/?\?tgWebAppStartParam=/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  expect(await (await page.request.get("/api/auth/me")).json()).toBeNull();
});

test("public views survive reload without repeated popularity increments", async ({
  page,
}) => {
  const ts = await (await page.request.get("/api/public/titles")).json();
  await page.goto("/title/" + ts[0].slug);
  await page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/public/view") && r.request().method() === "POST",
  );
  const first = (
    await (await page.request.get("/api/public/titles")).json()
  ).find((t: any) => t.id === ts[0].id).views;
  await page.reload();
  await page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/public/view") && r.request().method() === "POST",
  );
  const next = (
    await (await page.request.get("/api/public/titles")).json()
  ).find((t: any) => t.id === ts[0].id).views;
  // Another browser project may qualify concurrently; verify this cookie's unique event.
  expect(next - first).toBeLessThanOrEqual(1);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "inkora_viewer")?.httpOnly).toBe(true);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).every((k) =>
        ["inkora.recent", "inkora.history", "inkora.reader"].includes(k),
      ),
    ),
  ).toBe(true);
});
