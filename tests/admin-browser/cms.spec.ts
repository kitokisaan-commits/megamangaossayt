import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { zip, pdf } from "../fixtures";
async function login(page: Page, username: string, password: string) {
  await page.goto("/admin");
  await page.getByLabel("Login", { exact: true }).fill(username);
  await page.getByLabel("Parol", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
}
async function menu(page: Page, name: string) {
  const toggle = page.getByRole("button", { name: "Admin menyusi" });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .locator(".admin-sidebar")
    .getByRole("link", { name, exact: true })
    .click();
}
async function save(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/admin/") &&
      ["PUT", "POST"].includes(r.request().method()),
  );
  await page
    .getByRole("button", { name: "Saqlash", exact: true })
    .first()
    .click();
  const saved = await response;
  expect(saved.ok(), await saved.text()).toBe(true);
}

test("real CMS: bootstrap, uploads, page management, publishing, archive recovery and persistence", async ({
  page,
  browser,
}, info) => {
  const mobile = info.project.name === "mobile",
    username = mobile ? "owner_mobile" : "dieheartman",
    title = `Acceptance ${info.project.name}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, username, "dieheartman");
  await expect(
    page.getByRole("heading", { name: "Yangi parol o‘rnating." }),
  ).toBeVisible();
  await page
    .getByLabel("Yangi parol", { exact: true })
    .fill("Owner-browser-2026!");
  await page.getByLabel("Parolni takrorlang").fill("Owner-browser-2026!");
  await page.getByRole("button", { name: "Saqlash va qayta kirish" }).click();
  await expect(page.getByLabel("Login", { exact: true })).toBeVisible();
  await login(page, username, "Owner-browser-2026!");
  await expect(
    page.getByRole("heading", { name: "Tahririyat stoli" }),
  ).toBeVisible();
  await menu(page, "Asarlar");
  await page.getByRole("link", { name: "Yangi asar", exact: true }).click();
  await page.getByLabel("Asar nomi *", { exact: true }).fill(title);
  // Unsaved links can be declined without losing the form. No admin data in localStorage.
  page.once("dialog", (d) => d.dismiss());
  await menu(page, "Asarlar");
  await expect(page.getByLabel("Asar nomi *")).toHaveValue(title);
  const close = page.getByRole("button", {
    name: "Menyuni yopish",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  await page.getByLabel("Boshqa nomlar").fill("Alternative title");
  await page
    .getByLabel("Qisqacha mazmun")
    .fill("A safe original development story.");
  await page.getByLabel("Muallif", { exact: true }).fill("Editorial studio");
  await page.getByLabel("Janrlar").fill("Adventure,Fantasy");
  await page.getByLabel("SEO sarlavha").fill(title + " | INKORA");
  await save(page);
  await expect(page).toHaveURL(/\/admin\/titles\/[a-f0-9-]+$/);
  const titleUrl = page.url();
  const titleId = titleUrl.split("/").at(-1)!;
  const image = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#dacbaf" },
  })
    .png()
    .toBuffer();
  const coverPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Muqova", exact: true }),
  });
  await coverPanel
    .locator('input[type="file"]')
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });
  await expect(coverPanel.locator(".success-inline")).toBeVisible();
  await expect(page.locator(".admin-cover-preview")).toBeVisible();
  const bannerPanel = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Banner (ixtiyoriy)",
      exact: true,
    }),
  });
  await bannerPanel.locator('input[type="file"]').setInputFiles({
    name: "banner.webp",
    mimeType: "image/webp",
    buffer: await sharp(image).webp().toBuffer(),
  });
  await expect(bannerPanel.locator(".success-inline")).toBeVisible();
  await page.getByLabel("Bob raqami", { exact: true }).fill("1.5");
  await page.getByLabel("Bob nomi", { exact: true }).fill("First chapter");
  await page.getByRole("button", { name: "Bob qo‘shish" }).click();
  await expect(page).toHaveURL(/\/admin\/chapters\//);
  const chapterUrl = page.url();
  const chapterId = chapterUrl.split("/").at(-1)!;
  const fileInput = page.locator('.upload-panel input[type="file"]').first();
  await fileInput.setInputFiles([
    { name: "10.png", mimeType: "image/png", buffer: image },
    { name: "2.png", mimeType: "image/png", buffer: image },
    { name: "1.png", mimeType: "image/png", buffer: image },
  ]);
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await expect(
    page.locator(".upload-panel .success-inline").first(),
  ).toBeVisible();
  await expect(page.locator(".page-tile p")).toHaveText([
    "1.png",
    "2.png",
    "10.png",
  ]);
  await page
    .getByRole("button", { name: "1-sahifani orqaga", exact: true })
    .click();
  await expect(page.locator(".page-tile p")).toHaveText([
    "2.png",
    "1.png",
    "10.png",
  ]);
  await page
    .getByRole("button", { name: "1-sahifani aylantirish", exact: true })
    .click();
  await expect(page.locator(".page-tile").first()).toContainText("900×600");
  await page
    .getByRole("button", { name: "1-sahifani almashtirish", exact: true })
    .click();
  await page.locator('.upload-panel input[type="file"]').nth(1).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await expect(page.locator(".page-tile p").first()).toHaveText(
    "replacement.png",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "3-sahifani o‘chirish", exact: true })
    .click();
  await expect(page.locator(".page-tile")).toHaveCount(2);
  await fileInput.setInputFiles({
    name: "chapter.zip",
    mimeType: "application/zip",
    buffer: zip(
      ["10.png", "2.png", "1.png", "__MACOSX/.junk.png"].map((name) => ({
        name,
        data: image,
      })),
    ),
  });
  await expect(page.locator(".page-tile")).toHaveCount(5);
  await expect(page.locator(".page-tile p")).toHaveText([
    "replacement.png",
    "1.png",
    "1.png",
    "2.png",
    "10.png",
  ]);
  await fileInput.setInputFiles({
    name: "chapter.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await expect(page.locator(".page-tile")).toHaveCount(7);
  await expect(page.locator(".page-tile p").nth(5)).toHaveText("PDF 1");
  await fileInput.setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(
    page.locator(".upload-panel .error-inline").first(),
  ).toContainText(/Rasm/);
  await expect(page.locator(".page-tile")).toHaveCount(7);
  await page.reload();
  await expect(page.locator(".page-tile")).toHaveCount(7);
  const preview = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  const privatePage = await preview.newPage();
  await privatePage.goto(`/title/acceptance-${info.project.name}?preview=1`);
  await expect(
    privatePage.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(privatePage.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await privatePage.goto(`/read/${chapterId}?preview=1`);
  await expect(privatePage.locator(".reader")).toBeVisible();
  await preview.close();
  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  expect((await publicPage.goto(`/read/${chapterId}`))?.status()).toBe(404);
  await page
    .getByRole("combobox", { name: "Holat", exact: true })
    .selectOption("Published");
  await save(page);
  await page.goto(titleUrl);
  await page.getByLabel("Ko‘rinishi").selectOption("Published");
  await save(page);
  expect(
    (await publicPage.goto(`/title/acceptance-${info.project.name}`))?.status(),
  ).toBe(200);
  await expect(
    publicPage.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect((await publicPage.goto(`/read/${chapterId}`))?.status()).toBe(200);
  await expect(publicPage.locator(".reader")).toBeVisible();
  await page.goto(titleUrl + "/chapters");
  await page.getByLabel("Bob raqami", { exact: true }).fill("10.1");
  await page.getByRole("button", { name: "Bob qo‘shish" }).click();
  await expect(page).toHaveURL(/\/admin\/chapters\//);
  await page.goto(titleUrl + "/chapters");
  await expect(page.locator("tbody tr").first()).toContainText("1.5-bob");
  await expect(page.locator("tbody tr").nth(1)).toContainText("10.1-bob");
  await page.getByText("Boblarni guruhlab boshqarish", { exact: true }).click();
  await page.getByRole("checkbox", { name: "1.5-bobni tanlash" }).check();
  await page.getByRole("button", { name: "Draft qilish (1)" }).click();
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await publicPage.goto(`/read/${chapterId}`))?.status()).toBe(404);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Bobni arxivlash" }).first().click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Arxiv", exact: true }).click();
  await page.getByRole("button", { name: "Tiklash", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Global admin search").fill(title);
  await expect(page.locator(".admin-search-results")).toContainText(title);
  await page.getByLabel("Global admin search").fill("");
  await page.goto("/admin/titles");
  const row = page.locator("tbody tr").filter({ hasText: title });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: title + " asarini arxivlash" }).click();
  await expect(row).toHaveCount(0);
  expect(
    (await publicPage.goto(`/title/acceptance-${info.project.name}`))?.status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Arxiv", exact: true }).click();
  await page.getByRole("button", { name: "Tiklash", exact: true }).click();
  await expect(row).toHaveCount(1);
  await page.goto(chapterUrl);
  await expect(page.locator(".page-tile")).toHaveCount(7);
  await page.screenshot({
    path: `artifacts/${info.project.name}-admin-chapter.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("inkora.draft")),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await anonymous.close();
  // Verify persisted server rows, not DOM-only updates.
  const data = await (
    await page.request.get(`/api/admin/titles/${titleId}`)
  ).json();
  expect(data.cover_id).toBeTruthy();
  expect(data.description).toBe("A safe original development story.");
});

test("superadmin manages accounts, settings and audit; editor has scoped access", async ({
  page,
  browser,
}, info) => {
  const username =
      info.project.name === "mobile" ? "owner_mobile" : "dieheartman",
    staff = `staff_${info.project.name}`;
  await login(page, username, "Owner-browser-2026!");
  await expect(
    page.getByRole("heading", { name: "Tahririyat stoli" }),
  ).toBeVisible();
  await menu(page, "Administratorlar");
  await page.getByRole("button", { name: "Admin yaratish" }).click();
  await page.getByLabel("Login", { exact: true }).fill(staff);
  await page.getByLabel("Ko‘rinadigan ism").fill("Test staff");
  await page.getByLabel("Boshlang‘ich parol").fill("Staff-browser-2026!");
  await page
    .getByRole("combobox", { name: "Rol", exact: true })
    .selectOption("EDITOR");
  await save(page);
  const account = page.locator("tbody tr").filter({ hasText: "@" + staff });
  await expect(account).toContainText("EDITOR");
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await login(staffPage, staff, "Staff-browser-2026!");
  await staffPage
    .getByLabel("Yangi parol", { exact: true })
    .fill("Staff-changed-2026!");
  await staffPage.getByLabel("Parolni takrorlang").fill("Staff-changed-2026!");
  await staffPage
    .getByRole("button", { name: "Saqlash va qayta kirish" })
    .click();
  await expect(staffPage.getByLabel("Login", { exact: true })).toBeVisible();
  await login(staffPage, staff, "Staff-changed-2026!");
  await expect(
    staffPage.getByRole("heading", { name: "Tahririyat stoli" }),
  ).toBeVisible();
  expect((await staffPage.request.get("/api/admin/admins")).status()).toBe(403);
  expect((await staffPage.request.get("/api/admin/settings")).status()).toBe(
    403,
  );
  await account
    .getByRole("button", { name: "Tahrirlash", exact: true })
    .click();
  await page.getByLabel("Faol hisob").uncheck();
  await save(page);
  expect((await staffPage.request.get("/api/admin/titles")).status()).toBe(401);
  await account
    .getByRole("button", { name: "Tahrirlash", exact: true })
    .click();
  await page.getByLabel("Faol hisob").check();
  await page
    .getByRole("combobox", { name: "Rol", exact: true })
    .selectOption("ADMIN");
  await page.getByLabel("Yangi parol (ixtiyoriy)").fill("Reset-browser-2026!");
  await save(page);
  await expect(account).toContainText("ADMIN");
  await login(staffPage, staff, "Reset-browser-2026!");
  await expect(
    staffPage.getByRole("heading", { name: "Yangi parol o‘rnating." }),
  ).toBeVisible();
  await staffContext.close();
  page.once("dialog", (d) => d.accept());
  await account
    .getByRole("button", { name: "Administratorni o‘chirish" })
    .click();
  await expect(account).toHaveCount(0);
  await menu(page, "Sozlamalar");
  await page.getByLabel("Bitta import limiti (MB)").fill("90");
  await page.getByRole("button", { name: "Sozlamalarni saqlash" }).click();
  await expect(page.getByRole("status")).toContainText("Sozlamalar saqlandi");
  await page.reload();
  await expect(page.getByLabel("Bitta import limiti (MB)")).toHaveValue("90");
  await menu(page, "Audit jurnali");
  await expect(page.locator("tbody")).toContainText("admin.password_reset");
  await expect(page.locator("tbody")).toContainText("admin.role_changed");
  await expect(page.locator("tbody")).toContainText("settings.changed");
  await page.screenshot({
    path: `artifacts/${info.project.name}-admin-audit.png`,
    fullPage: true,
  });
});
