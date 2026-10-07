import { test, expect } from "@playwright/test";
test("exported public app navigates, searches, reads and persists history without API errors", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bir sahifa. Butun bir olam." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".hero-main-cover img")
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByLabel("Asar qidirish").fill("Tuz va");
  await expect(page.locator(".search-results a").first()).toContainText(
    "Salt & Steel",
  );
  await page.locator(".search-results a").first().click();
  await expect(
    page.getByRole("heading", { name: "Salt & Steel", exact: true, level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "O‘qishni boshlash", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".reader-page img")
        .first()
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
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
  await page.goto("/catalog?genre=Romance&year=2026");
  await expect(page.locator(".cover-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Tozalash", exact: true }).click();
  await expect(page.locator(".cover-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  await page.screenshot({
    path: `artifacts/export-${isMobile ? "mobile" : "desktop"}-catalog.png`,
    fullPage: true,
  });
});
