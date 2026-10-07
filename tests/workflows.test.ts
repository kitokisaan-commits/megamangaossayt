import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { zip, pdf } from "./fixtures";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "inkora-test-"));
process.env.DATA_ADAPTER = "local";
const { migrateLocal, insert, one, list, uid, now, compareUpdate } =
  await import("../server/db");
const { createAdmin } = await import("../server/auth");
const { handle } = await import("../server/api");
const { publicTitles, chapterData } = await import("../server/content");
const { naturalSort, safeArchiveName } = await import("../server/uploads");
let cookie = "",
  titleId = "",
  chapterId = "",
  editorCookie = "",
  editorId = "";
async function request(
  route: string,
  method = "GET",
  data?: unknown,
  auth = cookie,
  origin = "http://localhost:3000",
) {
  const req = new Request("http://localhost:3000/api/" + route, {
    method,
    headers: {
      Origin: origin,
      ...(auth ? { Cookie: auth } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const r = await handle(req, route.split("?")[0].split("/"));
  let body: any;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body, headers: r.headers };
}
async function upload(bytes: Buffer, name: string, chapter = chapterId) {
  const created = await request("admin/uploads", "POST", {
    title_id: titleId,
    chapter_id: chapter,
    name,
    total_bytes: bytes.length,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  let n = 0;
  for (let offset = 0; offset < bytes.length; offset += 2 * 1048576) {
    const r = await handle(
      new Request(
        `http://localhost:3000/api/admin/uploads/${id}/chunk?index=${n++}`,
        {
          method: "POST",
          headers: { Origin: "http://localhost:3000", Cookie: cookie },
          body: new Uint8Array(bytes.subarray(offset, offset + 2 * 1048576)),
        },
      ),
      ["admin", "uploads", id, "chunk"],
    );
    assert.equal(r.status, 200);
  }
  const prepared = await request(`admin/uploads/${id}/prepare`, "POST", {});
  return { id, prepared };
}
async function finish(id: string) {
  let r;
  do {
    r = await request(`admin/uploads/${id}/process`, "POST", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
  } while (r.body.status !== "ready");
  return r.body;
}
before(async () => {
  await migrateLocal();
  await insert("site_settings", {
    id: "main",
    name: "INKORA",
    description: "Test",
    max_upload_mb: 100,
    max_pages: 500,
  });
  await createAdmin("dieheartman", "Owner", "dieheartman", "SUPERADMIN");
});
test("anonymous administration is denied", async () =>
  assert.equal(
    (await request("admin/titles", "GET", undefined, "")).status,
    401,
  ));
test("cross-origin mutation is denied", async () =>
  assert.equal(
    (
      await request(
        "auth/login",
        "POST",
        { username: "dieheartman", password: "dieheartman" },
        "",
        "https://evil.invalid",
      )
    ).status,
    403,
  ));
test("wrong password rejected", async () =>
  assert.equal(
    (
      await request("auth/login", "POST", {
        username: "dieheartman",
        password: "wrong",
      })
    ).status,
    401,
  ));
test("bootstrap signs in with HttpOnly cookie and no password hash", async () => {
  const r = await request("auth/login", "POST", {
    username: "dieheartman",
    password: "dieheartman",
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie")!.split(";")[0];
  assert.match(r.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal(r.body.must_change, 1);
  assert.equal(r.body.password_hash, undefined);
});
test("first login cannot access admin operations", async () =>
  assert.equal((await request("admin/titles")).status, 428));
test("password rotation invalidates old session and credential", async () => {
  assert.equal(
    (
      await request("auth/password", "POST", {
        password: "Safe-password-2026!",
      })
    ).status,
    200,
  );
  assert.equal((await request("admin/titles")).status, 401);
  assert.equal(
    (
      await request("auth/login", "POST", {
        username: "dieheartman",
        password: "dieheartman",
      })
    ).status,
    401,
  );
  const r = await request("auth/login", "POST", {
    username: "dieheartman",
    password: "Safe-password-2026!",
  });
  cookie = r.headers.get("set-cookie")!.split(";")[0];
  assert.equal(r.body.must_change, 0);
});
test("create draft series", async () => {
  const r = await request("admin/titles", "POST", {
    title: "Test title",
    slug: "test-title",
    type: "Manhwa",
    status: "Ongoing",
    alt_names: ["Other name"],
    genres: ["Action"],
  });
  assert.equal(r.status, 201);
  titleId = r.body.id;
});
test("draft series is not public", async () =>
  assert.equal((await publicTitles()).length, 0));
test("duplicate slug gives a useful conflict", async () => {
  const r = await request("admin/titles", "POST", {
    title: "Duplicate",
    slug: "test-title",
    type: "Manga",
    status: "Ongoing",
  });
  assert.equal(r.status, 409);
});
test("create decimal chapters and numeric sort", async () => {
  for (const number of [10, 1.5, 2, 1]) {
    const r = await request(`admin/titles/${titleId}/chapters`, "POST", {
      number,
      name: "Test",
    });
    assert.equal(r.status, 201);
    if (number === 1) chapterId = r.body.id;
  }
  const r = await request(`admin/titles/${titleId}/chapters`);
  assert.deepEqual(
    r.body.map((c: any) => c.number),
    [1, 1.5, 2, 10],
  );
});
test("empty chapter cannot publish", async () =>
  assert.equal(
    (
      await request("admin/chapters/" + chapterId, "PUT", {
        number: 1,
        status: "Published",
      })
    ).status,
    400,
  ));
test("natural ZIP filename order and traversal rejection", () => {
  assert.deepEqual(naturalSort(["10.jpg", "2.jpg", "1.jpg"]), [
    "1.jpg",
    "2.jpg",
    "10.jpg",
  ]);
  assert.equal(safeArchiveName("../../evil.jpg"), false);
  assert.equal(safeArchiveName("safe/1.jpg"), true);
  assert.equal(safeArchiveName("C:\\evil.jpg"), false);
});
const image = await sharp({
  create: { width: 400, height: 600, channels: 3, background: "#abcded" },
})
  .png()
  .toBuffer();
test("valid image import preserves dimensions and source", async () => {
  const { id, prepared } = await upload(image, "1.png");
  assert.equal(prepared.status, 200);
  await finish(id);
  const c = await request("admin/chapters/" + chapterId);
  assert.equal(c.body.pages.length, 1);
  assert.equal(c.body.pages[0].width, 400);
  assert.equal(c.body.pages[0].height, 600);
  assert.equal(c.body.pages[0].source_bytes, image.length);
});
test("draft images cannot be accessed anonymously", async () => {
  const pages = await list("chapter_pages", { chapter_id: chapterId });
  const r = await handle(
    new Request("http://localhost:3000/api/assets/" + pages[0].asset_id),
    ["assets", pages[0].asset_id],
  );
  assert.equal(r.status, 404);
});
test("ZIP imports naturally sorted pages, ignoring system files", async () => {
  const z = zip(
    ["10.jpg", "2.jpg", "1.jpg", "__MACOSX/.meta.png"].map((name) => ({
      name,
      data: image,
    })),
  );
  const { id, prepared } = await upload(z, "chapter.zip");
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  await finish(id);
  const c = await request("admin/chapters/" + chapterId);
  assert.deepEqual(
    c.body.pages.slice(1).map((p: any) => p.filename),
    ["1.jpg", "2.jpg", "10.jpg"],
  );
});
test("path traversal ZIP is refused", async () => {
  const { prepared } = await upload(
    zip([{ name: "../evil.png", data: image }]),
    "bad.zip",
  );
  assert.equal(prepared.status, 400);
});
test("junk-only ZIP is refused", async () => {
  const { prepared } = await upload(
    zip([{ name: "readme.txt", data: Buffer.from("none") }]),
    "empty.zip",
  );
  assert.equal(prepared.status, 400);
});
test("fake image extension is rejected by actual decoding", async () => {
  const { id } = await upload(Buffer.from("not an image"), "fake.jpg");
  assert.equal(
    (await request(`admin/uploads/${id}/process`, "POST", {})).status,
    415,
  );
});
test("PDF renders each page, keeping portrait/landscape aspect ratio", async () => {
  const { id, prepared } = await upload(pdf(), "chapter.pdf");
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  assert.equal(prepared.body.total, 2);
  await finish(id);
  const c = await request("admin/chapters/" + chapterId);
  const ps = c.body.pages.slice(-2);
  assert.equal(ps.length, 2);
  assert.ok(ps[0].height > ps[0].width);
  assert.ok(ps[1].width > ps[1].height);
});
test("corrupt PDF rejected", async () => {
  const { prepared } = await upload(Buffer.from("%PDF-corrupt"), "bad.pdf");
  assert.equal(prepared.status, 400);
});
test("reordering pages persists", async () => {
  const c = await request("admin/chapters/" + chapterId),
    ids = c.body.pages.map((p: any) => p.id).reverse();
  assert.equal(
    (await request(`admin/chapters/${chapterId}/pages`, "PUT", { ids })).status,
    200,
  );
  const after = await request("admin/chapters/" + chapterId);
  assert.deepEqual(
    after.body.pages.map((p: any) => p.id),
    ids,
  );
});
test("invalid reorder cannot inject another page", async () =>
  assert.equal(
    (
      await request(`admin/chapters/${chapterId}/pages`, "PUT", {
        ids: [uid()],
      })
    ).status,
    400,
  ));
test("rotation changes dimensions", async () => {
  const c = await request("admin/chapters/" + chapterId),
    p = c.body.pages[0];
  assert.equal(
    (await request(`admin/chapters/${chapterId}/pages/${p.id}`, "POST", {}))
      .status,
    200,
  );
  const after = await request("admin/chapters/" + chapterId);
  assert.equal(after.body.pages[0].width, p.height);
});
test("publishing exposes chapter only after title is also published", async () => {
  assert.equal(
    (
      await request("admin/chapters/" + chapterId, "PUT", {
        number: 1,
        status: "Published",
      })
    ).status,
    200,
  );
  assert.equal(await chapterData(chapterId), null);
  const t = (await request("admin/titles/" + titleId)).body;
  assert.equal(
    (
      await request("admin/titles/" + titleId, "PUT", {
        ...t,
        visibility: "Published",
      })
    ).status,
    200,
  );
  assert.ok(await chapterData(chapterId));
  assert.equal((await publicTitles()).length, 1);
});
test("search finds alternative names", async () => {
  const r = await handle(
    new Request("http://localhost:3000/api/public/search?q=Other"),
    ["public", "search"],
  );
  const data: any = await r.json();
  assert.equal(data.length, 1);
});
test("scheduled chapter stays invisible until due", async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  await request("admin/chapters/" + chapterId, "PUT", {
    number: 1,
    status: "Published",
    publish_at: future,
  });
  assert.equal(await chapterData(chapterId), null);
  await request("admin/chapters/" + chapterId, "PUT", {
    number: 1,
    status: "Published",
    publish_at: null,
  });
});
test("page deletion removes source assets and metadata", async () => {
  const c = await request("admin/chapters/" + chapterId),
    p = c.body.pages[0];
  assert.equal(
    (await request(`admin/chapters/${chapterId}/pages/${p.id}`, "DELETE"))
      .status,
    200,
  );
  assert.equal(await one("assets", { id: p.asset_id }), null);
});
test("superadmin can create editor", async () => {
  const r = await request("admin/admins", "POST", {
    username: "editor_test",
    display_name: "Editor",
    password: "Editor-safe-2026!",
    role: "EDITOR",
  });
  assert.equal(r.status, 201);
  editorId = r.body.id;
  const l = await request(
    "auth/login",
    "POST",
    { username: "editor_test", password: "Editor-safe-2026!" },
    "",
  );
  editorCookie = l.headers.get("set-cookie")!.split(";")[0];
  await request(
    "auth/password",
    "POST",
    { password: "Editor-new-2026!" },
    editorCookie,
  );
  const ll = await request(
    "auth/login",
    "POST",
    { username: "editor_test", password: "Editor-new-2026!" },
    "",
  );
  editorCookie = ll.headers.get("set-cookie")!.split(";")[0];
});
test("editor cannot manage admins or unassigned content", async () => {
  assert.equal(
    (await request("admin/admins", "GET", undefined, editorCookie)).status,
    403,
  );
  assert.equal(
    (await request("admin/titles/" + titleId, "GET", undefined, editorCookie))
      .status,
    403,
  );
});
test("editor assignment grants only permitted content", async () => {
  await request(`admin/titles/${titleId}/editors`, "PUT", { ids: [editorId] });
  assert.equal(
    (await request("admin/titles/" + titleId, "GET", undefined, editorCookie))
      .status,
    200,
  );
  assert.equal(
    (
      await request(
        "admin/titles/" + titleId,
        "DELETE",
        undefined,
        editorCookie,
      )
    ).status,
    403,
  );
});
test("disabling account invalidates active session", async () => {
  await request("admin/admins/" + editorId, "PUT", {
    role: "EDITOR",
    display_name: "Editor",
    active: 0,
  });
  assert.equal(
    (await request("admin/titles", "GET", undefined, editorCookie)).status,
    401,
  );
});
test("superadmin cannot accidentally delete self", async () => {
  const me = (await request("auth/me")).body;
  assert.equal((await request("admin/admins/" + me.id, "DELETE")).status, 400);
});
test("upload leases are atomic", async () => {
  const j = await insert("upload_jobs", {
    id: uid(),
    title_id: titleId,
    chapter_id: chapterId,
    user_id: editorId,
    name: "lease",
    total_bytes: 1,
    created_at: now(),
  });
  assert.equal(
    await compareUpdate(
      "upload_jobs",
      j.id,
      { lease_token: "" },
      { lease_token: "first" },
    ),
    true,
  );
  assert.equal(
    await compareUpdate(
      "upload_jobs",
      j.id,
      { lease_token: "" },
      { lease_token: "second" },
    ),
    false,
  );
});
test("page replacement preserves position and cleans previous asset", async () => {
  const before = (await request("admin/chapters/" + chapterId)).body;
  const target = before.pages[0];
  const { id } = await upload(image, "replacement.png");
  await finish(id);
  const r = await request(
    `admin/chapters/${chapterId}/pages/${target.id}`,
    "PUT",
    { replacement_job_id: id },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await request("admin/chapters/" + chapterId)).body;
  assert.equal(after.pages.length, before.pages.length);
  assert.equal(after.pages[0].id, target.id);
  assert.notEqual(after.pages[0].asset_id, target.asset_id);
  assert.equal(await one("assets", { id: target.asset_id }), null);
});
test("malformed JSON gives a clear client error", async () => {
  const r = await handle(
    new Request("http://localhost:3000/api/admin/titles", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", Cookie: cookie },
      body: "{broken",
    }),
    ["admin", "titles"],
  );
  assert.equal(r.status, 400);
});
test("chunk size is enforced even without Content-Length", async () => {
  const j = await request("admin/uploads", "POST", {
    title_id: titleId,
    chapter_id: chapterId,
    name: "large.jpg",
    total_bytes: 3 * 1048576,
  });
  const r = await handle(
    new Request(
      `http://localhost:3000/api/admin/uploads/${j.body.id}/chunk?index=0`,
      {
        method: "POST",
        headers: { Origin: "http://localhost:3000", Cookie: cookie },
        body: new Uint8Array(2097153),
      },
    ),
    ["admin", "uploads", j.body.id, "chunk"],
  );
  assert.equal(r.status, 413);
});
test("archiving a title hides all its chapters but retains recoverable references", async () => {
  assert.equal(
    (await request("admin/titles/" + titleId, "DELETE")).status,
    200,
  );
  assert.equal((await publicTitles()).length, 0);
  assert.equal(await chapterData(chapterId), null);
  assert.ok((await list("assets", { title_id: titleId })).length > 0);
});
test("audit records actual privileged actions", async () => {
  const r = await request("admin/audit");
  assert.equal(r.status, 200);
  for (const action of [
    "admin.login",
    "title.created",
    "chapter.created",
    "chapter.published",
    "admin.created",
    "title.archived",
  ])
    assert.ok(
      r.body.some((l: any) => l.action === action),
      action,
    );
});

test("local rows serialize safely to React Server Components", async () => {
  const rows = await list("chapters", {}, undefined, 10);
  assert.ok(rows.length);
  for (const row of rows)
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
  const decorated = await publicTitles();
  for (const title of decorated)
    for (const chapter of title.chapters)
      assert.equal(Object.getPrototypeOf(chapter), Object.prototype);
});

test("responsive page delivery is prepared, retains original, and reports dimensions", async () => {
  const { prepareImage } = await import("../server/uploads");
  const { pageData } = await import("../server/content");
  const id = uid(),
    chapter = uid();
  await insert("titles", {
    id,
    slug: "responsive-test",
    title: "Responsive test",
    visibility: "Published",
    created_at: now(),
    updated_at: now(),
  });
  await insert("chapters", {
    id: chapter,
    title_id: id,
    number: 10.1,
    sort_order: 10.1,
    status: "Published",
    created_at: now(),
    updated_at: now(),
  });
  const source = await sharp({
    create: { width: 1600, height: 2200, channels: 3, background: "#e9f1f7" },
  })
    .png()
    .toBuffer();
  const asset = await prepareImage(source, "page.png", id, chapter);
  await insert("chapter_pages", {
    id: uid(),
    chapter_id: chapter,
    asset_id: asset.id,
    position: 0,
    rotation: 0,
  });
  assert.equal((await one("assets", { id: asset.id }))?.responsive_ready, 1);
  const response = await handle(
    new Request(`http://localhost:3000/api/assets/${asset.id}?width=640`),
    ["assets", asset.id],
  );
  assert.equal(response.status, 200);
  const metadata = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 880);
  const pages = await pageData(chapter);
  assert.match(pages[0].srcset, /640w/);
  assert.match(pages[0].srcset, new RegExp(String(asset.width) + "w"));
  assert.equal(pages[0].width, 1600);
  const { storage } = await import("../server/storage");
  assert.deepEqual(await storage.get(asset.original_key), source);
});

test("archived titles restore safely as Draft with data retained", async () => {
  const archived = await request("admin/archive");
  assert.ok(archived.body.some((t: any) => t.id === titleId));
  assert.equal(
    (await request(`admin/restore/${titleId}`, "POST", { kind: "title" }))
      .status,
    200,
  );
  assert.equal((await one("titles", { id: titleId }))?.visibility, "Draft");
  assert.ok((await request("admin/chapters/" + chapterId)).body.pages.length);
});
test("editor cannot alter scheduling, visibility, featured placement or bulk publish", async () => {
  await request("admin/admins/" + editorId, "PUT", {
    role: "EDITOR",
    display_name: "Editor",
    active: 1,
  });
  const signed = await request(
    "auth/login",
    "POST",
    { username: "editor_test", password: "Editor-new-2026!" },
    "",
  );
  editorCookie = signed.headers.get("set-cookie")!.split(";")[0];
  const t = (await request("admin/titles/" + titleId)).body;
  const c = (await request("admin/chapters/" + chapterId)).body;
  assert.equal(
    (
      await request(
        "admin/titles/" + titleId,
        "PUT",
        { ...t, featured: 1 },
        editorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/titles/" + titleId,
        "PUT",
        { ...t, visibility: "Published" },
        editorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/chapters/" + chapterId,
        "PUT",
        { ...c, publish_at: new Date(Date.now() + 86400000).toISOString() },
        editorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `admin/titles/${titleId}/chapters/bulk`,
        "POST",
        { ids: [chapterId], action: "publish" },
        editorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/titles/" + titleId,
        "PUT",
        { ...t, description: "Edited by assigned editor" },
        editorCookie,
      )
    ).status,
    200,
  );
});
test("global CMS search is scoped to permitted titles and chapters", async () => {
  const admin = await request("admin/search?q=Test");
  assert.ok(admin.body.some((r: any) => r.id === titleId));
  const editor = await request(
    "admin/search?q=Responsive",
    "GET",
    undefined,
    editorCookie,
  );
  assert.deepEqual(editor.body, []);
});
test("chapter numbers reject precision that PostgreSQL would round", async () => {
  assert.equal(
    (
      await request(`admin/titles/${titleId}/chapters`, "POST", {
        number: 10.00001,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`admin/titles/${titleId}/chapters`, "POST", {
        number: 10.1001,
      })
    ).status,
    201,
  );
});
test("bulk publish rejects an empty chapter without partial publication", async () => {
  const cs = (await request(`admin/titles/${titleId}/chapters`)).body;
  const empty = cs.find((c: any) => c.number === 2);
  await request("admin/chapters/" + chapterId, "PUT", {
    number: 1,
    status: "Draft",
  });
  assert.equal(
    (
      await request(`admin/titles/${titleId}/chapters/bulk`, "POST", {
        ids: [chapterId, empty.id],
        action: "publish",
      })
    ).status,
    400,
  );
  assert.equal((await one("chapters", { id: chapterId }))?.status, "Draft");
});
test("bulk publication, draft and archive commit and restore safely", async () => {
  for (const action of ["publish", "draft", "archive"]) {
    assert.equal(
      (
        await request(`admin/titles/${titleId}/chapters/bulk`, "POST", {
          ids: [chapterId],
          action,
        })
      ).status,
      200,
    );
    const c = await one("chapters", { id: chapterId });
    assert.equal(c?.status, action === "publish" ? "Published" : "Draft");
  }
  assert.ok(
    (await request(`admin/archive?title_id=${titleId}`)).body.some(
      (c: any) => c.id === chapterId,
    ),
  );
  assert.equal(
    (await request(`admin/restore/${chapterId}`, "POST", { kind: "chapter" }))
      .status,
    200,
  );
  assert.equal((await one("chapters", { id: chapterId }))?.deleted_at, null);
});
test("manual chapter order drives public navigation with numeric defaults", async () => {
  const t = (await request("admin/titles/" + titleId)).body;
  await request("admin/titles/" + titleId, "PUT", {
    ...t,
    visibility: "Published",
  });
  await request("admin/chapters/" + chapterId, "PUT", {
    number: 1,
    status: "Published",
    sort_order: 42,
  });
  assert.equal((await chapterData(chapterId))?.chapters.at(-1)?.id, chapterId);
  await request("admin/chapters/" + chapterId, "PUT", {
    number: 1,
    status: "Draft",
    sort_order: 1,
  });
});
test("cover variants use separate sizes and replaced cover objects are removed", async () => {
  const cover = await sharp({
    create: { width: 1800, height: 2400, channels: 3, background: "#ccbbaa" },
  })
    .png()
    .toBuffer();
  const first = await upload(cover, "cover.png", null as unknown as string);
  await finish(first.id);
  const t = await one("titles", { id: titleId });
  const old = await one("assets", { id: t?.cover_id });
  const { storage } = await import("../server/storage");
  assert.equal(
    (await sharp(await storage.get(old!.thumb_key)).metadata()).width,
    420,
  );
  assert.equal(
    (await sharp(await storage.get(`assets/${old!.id}/medium`)).metadata())
      .width,
    840,
  );
  assert.deepEqual(await storage.get(old!.original_key), cover);
  const next = await upload(image, "cover2.png", null as unknown as string);
  await finish(next.id);
  assert.equal(await one("assets", { id: old!.id }), null);
  await assert.rejects(storage.get(old!.original_key));
});
test("efficient JPG, PNG, WebP and AVIF keep their exact source bytes", async () => {
  const { prepareImage } = await import("../server/uploads");
  const { storage } = await import("../server/storage");
  const variants = [
    await sharp(image).jpeg({ quality: 90 }).toBuffer(),
    image,
    await sharp(image).webp({ lossless: true }).toBuffer(),
    await sharp(image).avif({ quality: 90 }).toBuffer(),
  ];
  for (const bytes of variants) {
    const a = await prepareImage(bytes, "page", titleId, chapterId);
    assert.equal(a.original_key, a.delivery_key);
    assert.deepEqual(await storage.get(a.delivery_key), bytes);
  }
});
test("useful lossless optimization preserves decoded pixels and dimensions", async () => {
  const { prepareImage } = await import("../server/uploads");
  const { storage } = await import("../server/storage");
  const source = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: "#eacbac" },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const a = await prepareImage(source, "large.png", titleId, chapterId);
  assert.notEqual(a.original_key, a.delivery_key);
  assert.deepEqual(
    await sharp(await storage.get(a.delivery_key))
      .raw()
      .toBuffer(),
    await sharp(source).raw().toBuffer(),
  );
});
test("rotation retains original master through four turns", async () => {
  const { storage } = await import("../server/storage");
  const page = (await request("admin/chapters/" + chapterId)).body.pages[0];
  const a = await one("assets", { id: page.asset_id });
  const master = await storage.get(a!.original_key);
  const originalRotation = page.rotation;
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await request(
          `admin/chapters/${chapterId}/pages/${page.id}`,
          "POST",
          {},
        )
      ).status,
      200,
    );
  const after = (await request("admin/chapters/" + chapterId)).body.pages[0];
  const asset = await one("assets", { id: after.asset_id });
  assert.deepEqual(await storage.get(asset!.original_key), master);
  assert.equal(after.rotation, originalRotation);
});
test("upload lease blocks overlapping processing until released", async () => {
  const { id } = await upload(image, "locked.png");
  await compareUpdate(
    "upload_jobs",
    id,
    { lease_token: "" },
    {
      lease_token: "held",
      lease_until: new Date(Date.now() + 300000).toISOString(),
    },
  );
  assert.equal(
    (await request(`admin/uploads/${id}/process`, "POST", {})).status,
    409,
  );
  const { update } = await import("../server/db");
  await update("upload_jobs", id, { lease_token: "", lease_until: "" });
  await finish(id);
});
test("ZIP bomb declarations and oversized imports fail with professional errors", async () => {
  const payload = zip([{ name: "1.png", data: Buffer.from("x") }]);
  const central = payload.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  payload.writeUInt32LE(31 * 1048576, central + 24);
  assert.equal((await upload(payload, "bomb.zip")).prepared.status, 400);
  assert.equal(
    (
      await request("admin/uploads", "POST", {
        title_id: titleId,
        chapter_id: chapterId,
        name: "large.zip",
        total_bytes: 101 * 1048576,
      })
    ).status,
    413,
  );
});
test("page limits are rechecked during processing after settings change", async () => {
  const { id } = await upload(image, "pending.png");
  await request("admin/settings", "PUT", {
    name: "INKORA",
    description: "Test",
    max_upload_mb: 100,
    max_pages: 1,
  });
  assert.equal(
    (await request(`admin/uploads/${id}/process`, "POST", {})).status,
    413,
  );
  await request("admin/settings", "PUT", {
    name: "INKORA",
    description: "Test",
    max_upload_mb: 100,
    max_pages: 500,
  });
  await request("admin/uploads/" + id, "DELETE");
});
test("PDF original master remains available to the server after processing", async () => {
  const { id } = await upload(pdf(), "master.pdf");
  await finish(id);
  const j = await one("upload_jobs", { id });
  const { storage } = await import("../server/storage");
  assert.deepEqual(await storage.get(j!.master_key), pdf());
});
test("archived chapter import cannot continue and mutate hidden content", async () => {
  const { id } = await upload(image, "archived.png");
  await request("admin/chapters/" + chapterId, "DELETE");
  assert.equal(
    (await request(`admin/uploads/${id}/process`, "POST", {})).status,
    404,
  );
  await request(`admin/restore/${chapterId}`, "POST", { kind: "chapter" });
  await request("admin/uploads/" + id, "DELETE");
});
test("admin password reset forces rotation, role changes and deletion invalidate sessions", async () => {
  const created = await request("admin/admins", "POST", {
    username: "admin_test",
    display_name: "Admin test",
    password: "Admin-safe-2026!",
    role: "ADMIN",
  });
  const id = created.body.id;
  let l = await request(
    "auth/login",
    "POST",
    { username: "admin_test", password: "Admin-safe-2026!" },
    "",
  );
  let session = l.headers.get("set-cookie")!.split(";")[0];
  await request(
    "auth/password",
    "POST",
    { password: "Admin-new-2026!" },
    session,
  );
  l = await request(
    "auth/login",
    "POST",
    { username: "admin_test", password: "Admin-new-2026!" },
    "",
  );
  session = l.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await request("admin/admins", "GET", undefined, session)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/titles",
        "POST",
        {
          title: "Admin title",
          slug: "admin-title",
          type: "Manga",
          status: "Ongoing",
        },
        session,
      )
    ).status,
    201,
  );
  await request("admin/admins/" + id, "PUT", {
    role: "EDITOR",
    display_name: "Changed",
    active: 1,
    password: "Admin-reset-2026!",
  });
  assert.equal(
    (await request("admin/titles", "GET", undefined, session)).status,
    401,
  );
  l = await request(
    "auth/login",
    "POST",
    { username: "admin_test", password: "Admin-reset-2026!" },
    "",
  );
  assert.equal(l.body.must_change, 1);
  assert.equal((await request("admin/admins/" + id, "DELETE")).status, 200);
  assert.equal(
    (
      await request(
        "auth/login",
        "POST",
        { username: "admin_test", password: "Admin-reset-2026!" },
        "",
      )
    ).status,
    401,
  );
  const logs = (await request("admin/audit")).body;
  for (const action of [
    "admin.password_reset",
    "admin.role_changed",
    "admin.enabled",
    "admin.disabled",
    "admin.deleted",
    "page.rotated",
    "title.artwork_uploaded",
    "chapter.pages_uploaded",
  ])
    assert.ok(
      logs.some((l: any) => l.action === action),
      action,
    );
});

test("orphan cleanup preserves referenced archive artwork and active import leases", async () => {
  const { prepareImage } = await import("../server/uploads");
  const { update } = await import("../server/db");
  const stale = new Date(Date.now() - 48 * 3600000).toISOString();
  const orphan = await prepareImage(image, "orphan.png", titleId, chapterId);
  await update("assets", orphan.id, { created_at: stale });
  const title = await one("titles", { id: titleId });
  const retained = title!.cover_id;
  await update("assets", retained, { created_at: stale });
  await request("admin/titles/" + titleId, "DELETE");
  const protectedJob = await insert("upload_jobs", {
    id: uid(),
    title_id: titleId,
    chapter_id: chapterId,
    user_id: editorId,
    name: "active",
    total_bytes: 1,
    created_at: stale,
    lease_token: "held",
    lease_until: new Date(Date.now() + 300000).toISOString(),
  });
  assert.equal(
    (await request("admin/maintenance/cleanup", "POST", {}, editorCookie))
      .status,
    403,
  );
  const result = await request("admin/maintenance/cleanup", "POST", {});
  assert.equal(result.status, 200);
  assert.ok(result.body.removed >= 1);
  assert.equal(await one("assets", { id: orphan.id }), null);
  assert.ok(await one("assets", { id: retained }));
  assert.equal(
    (await one("upload_jobs", { id: protectedJob.id }))?.status,
    "uploading",
  );
  await request(`admin/restore/${titleId}`, "POST", { kind: "title" });
});
test("abandoned byte uploads clean staged objects and persist cancellation", async () => {
  const { update } = await import("../server/db");
  const { storage } = await import("../server/storage");
  const job = await request("admin/uploads", "POST", {
    title_id: titleId,
    chapter_id: chapterId,
    name: "abandoned.png",
    total_bytes: 1,
  });
  await storage.put(`uploads/${job.body.id}/chunk-0`, Buffer.from("x"));
  await update("upload_jobs", job.body.id, {
    next_chunk: 1,
    received_bytes: 1,
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
  });
  await request("admin/maintenance/cleanup", "POST", {});
  assert.equal(
    (await one("upload_jobs", { id: job.body.id }))?.status,
    "cancelled",
  );
  await assert.rejects(storage.get(`uploads/${job.body.id}/chunk-0`));
});

test("compound metadata conflict preserves the previous title and relationships", async () => {
  const previous = (await request("admin/titles/" + titleId)).body;
  const conflicting = await request("admin/titles/" + titleId, "PUT", {
    ...previous,
    slug: "responsive-test",
    alt_names: ["Lost"],
    genres: ["Lost"],
  });
  assert.equal(conflicting.status, 409);
  const after = (await request("admin/titles/" + titleId)).body;
  assert.equal(after.slug, previous.slug);
  assert.deepEqual(after.alt_names, previous.alt_names);
  assert.deepEqual(after.genres, previous.genres);
});

test("ZIP metadata entry limits apply even to ignored junk files", async () => {
  const entries = Array.from({ length: 10001 }, (_, i) => ({
    name: `__MACOSX/${i}.txt`,
    data: Buffer.alloc(0),
  }));
  const { prepared } = await upload(zip(entries), "metadata-bomb.zip");
  assert.equal(prepared.status, 400);
  assert.match(prepared.body.error, /ZIP/);
});

test("view tracking uses expiring HttpOnly cookie, deduplicates reloads and keeps private chapters out", async () => {
  const { update } = await import("../server/db");
  await update("titles", titleId, {
    visibility: "Published",
    deleted_at: null,
  });
  await update("chapters", chapterId, {
    status: "Published",
    publish_at: null,
    deleted_at: null,
  });
  const beforeTitle = (await one("titles", { id: titleId }))!.views;
  const beforeChapter = (await one("chapters", { id: chapterId }))!.views;
  const first = await request(
    "public/view",
    "POST",
    { title_id: titleId, chapter_id: chapterId },
    "",
  );
  assert.equal(first.status, 200);
  const viewerCookie = first.headers.get("set-cookie")!;
  assert.match(viewerCookie, /HttpOnly; SameSite=Lax; Max-Age=86400/);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      request(
        "public/view",
        "POST",
        { title_id: titleId, chapter_id: chapterId },
        viewerCookie,
      ),
    ),
  );
  assert.equal((await one("titles", { id: titleId }))!.views, beforeTitle + 1);
  assert.equal(
    (await one("chapters", { id: chapterId }))!.views,
    beforeChapter + 1,
  );
  await update("chapters", chapterId, { status: "Draft" });
  assert.equal(
    (
      await request(
        "public/view",
        "POST",
        { title_id: titleId, chapter_id: chapterId },
        viewerCookie,
      )
    ).status,
    404,
  );
  await update("chapters", chapterId, { status: "Published" });
  assert.equal(
    (
      await request(
        "public/view",
        "POST",
        { title_id: titleId },
        viewerCookie,
        "https://other.test",
      )
    ).status,
    403,
  );
});
test("catalogue summaries keep real chapter counts with bounded chapter payloads", async () => {
  const complete = await publicTitles();
  const summaries = await publicTitles(true);
  for (const t of summaries) {
    assert.equal(
      t.chapter_count,
      complete.find((x) => x.id === t.id)!.chapters.length,
    );
    assert.ok(t.chapters.length <= 2);
    assert.ok(
      t.chapters.every((c: any) => !c.deleted_at && c.status === "Published"),
    );
  }
});
test("credential mutation limits are atomic and reset after their window", async () => {
  const { rateLimit } = await import("../server/rate-limit");
  const time = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      rateLimit("isolated-test", "credentials", 5, time),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.ok(
    results
      .filter((r) => r.status === "rejected")
      .every((r) => (r as PromiseRejectedResult).reason.status === 429),
  );
  await rateLimit("isolated-test", "credentials", 5, time + 900000);
});
test("public image cache revalidation never bypasses a publication check", async () => {
  const { update } = await import("../server/db");
  const page = (await list("chapter_pages", { chapter_id: chapterId }))[0];
  const url = "http://localhost:3000/api/assets/" + page.asset_id;
  const first = await handle(new Request(url), ["assets", page.asset_id]);
  assert.equal(first.status, 200);
  const etag = first.headers.get("etag")!;
  const cached = await handle(
    new Request(url, { headers: { "if-none-match": etag } }),
    ["assets", page.asset_id],
  );
  assert.equal(cached.status, 304);
  await update("titles", titleId, { visibility: "Hidden" });
  const denied = await handle(
    new Request(url, { headers: { "if-none-match": etag } }),
    ["assets", page.asset_id],
  );
  assert.equal(denied.status, 404);
  await update("titles", titleId, { visibility: "Published" });
});

test("saved CMS data and private objects survive a new server process", async () => {
  const { spawnSync } = await import("node:child_process");
  const script = `const {one,list}=await import('./server/db.ts'); const {storage}=await import('./server/storage.ts');
    const title=await one('titles',{id:process.env.PERSIST_TITLE});
    const chapter=await one('chapters',{id:process.env.PERSIST_CHAPTER});
    const page=(await list('chapter_pages',{chapter_id:chapter.id}))[0];
    const asset=await one('assets',{id:page.asset_id});
    const bytes=await storage.get(asset.original_key);
    console.log(JSON.stringify({title:title.id,chapter:chapter.id,number:chapter.number,pageCount:chapter.page_count,bytes:bytes.length}));`;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      env: {
        ...process.env,
        PERSIST_TITLE: titleId,
        PERSIST_CHAPTER: chapterId,
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(result.stdout);
  assert.equal(saved.title, titleId);
  assert.equal(saved.chapter, chapterId);
  assert.equal(
    saved.number,
    (await one("chapters", { id: chapterId }))!.number,
  );
  assert.ok(saved.pageCount > 0);
  assert.ok(saved.bytes > 0);
});

test("account revocation invalidates all sessions beyond the ordinary query cap", async () => {
  const { invalidateSessions } = await import("../server/auth");
  const account = await createAdmin(
    "revocation_cap",
    "Revocation test",
    "SecureInitialPass123!",
    "EDITOR",
  );
  for (let i = 0; i < 1005; i++)
    await insert("sessions", {
      id: uid(),
      user_id: account.id,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  await invalidateSessions(account.id);
  assert.equal(
    (await list("sessions", { user_id: account.id }, undefined, -1)).length,
    0,
  );
});
