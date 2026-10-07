import { z } from "zod";
import { cleanupOrphans } from "./maintenance";
import { saveTitle, assignEditors, replacePage, removePage } from "./mutations";
import { rateLimit } from "./rate-limit";
import { viewer, recordView } from "./stats";
import {
  list,
  listIn,
  one,
  insert,
  update,
  remove,
  now,
  uid,
  production,
  supabase,
  compareUpdate,
  reorderPages,
  bulkChapters,
} from "./db";
import {
  csrf,
  login,
  cookie,
  currentUser,
  requireUser,
  requireRole,
  requireTitle,
  requireChapter,
  canEdit,
  editableTitles,
  audit,
  publicUser,
  createAdmin,
  setPassword,
  invalidateSessions,
  HttpError,
  fail,
  tokenHash,
} from "./auth";
import {
  isPublicTitle,
  isPublicChapter,
  publicTitles,
  decorateTitles,
  pageData,
} from "./content";
import { storage } from "./storage";
import {
  stageJob,
  processNext,
  prepareImage,
  ensureResponsive,
  deleteAsset,
  cleanupJob,
} from "./uploads";
const titleSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(180),
  description: z.string().max(10000).default(""),
  type: z.enum(["Manga", "Manhwa", "Manhua", "Webtoon"]),
  status: z.enum(["Ongoing", "Completed", "Hiatus", "Cancelled"]),
  year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  author: z.string().max(160).default(""),
  artist: z.string().max(160).default(""),
  tags: z.string().max(1000).default(""),
  age_label: z.string().max(100).default("All ages"),
  direction: z.enum(["vertical", "rtl", "ltr"]).default("vertical"),
  origin: z.string().max(100).default(""),
  language: z.string().max(100).default("Uzbek"),
  publication_status: z.string().max(100).default("Serializing"),
  featured: z.coerce.number().int().min(0).max(1).default(0),
  visibility: z.enum(["Draft", "Published", "Hidden"]).default("Draft"),
  seo_title: z.string().max(180).default(""),
  seo_description: z.string().max(500).default(""),
  alt_names: z.array(z.string().trim().min(1).max(180)).max(30).default([]),
  genres: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
const chapterSchema = z.object({
  number: z.coerce
    .number()
    .min(0)
    .max(1000000)
    .refine(
      (n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.00001,
      "Bob raqami ko‘pi bilan 4 kasr belgisiga ega bo‘lsin.",
    ),
  name: z.string().max(200).default(""),
  volume: z.string().max(50).default(""),
  status: z.enum(["Draft", "Published"]).default("Draft"),
  publish_at: z.string().datetime().nullable().default(null),
  sort_order: z.coerce.number().min(-1000000).max(1000000).optional(),
});
const password = z
  .string()
  .min(12, "Parol kamida 12 belgidan iborat bo‘lsin.")
  .max(128);
async function readLimited(req: Request, max: number): Promise<Buffer> {
  if (Number(req.headers.get("content-length") || 0) > max)
    fail(413, "So‘rov juda katta.");
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      fail(413, "So‘rov juda katta.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function body(req: Request): Promise<any> {
  try {
    return JSON.parse((await readLimited(req, 65536)).toString("utf8"));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, "JSON ma’lumotlari buzilgan.");
  }
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function handle(
  req: Request,
  segments: string[],
): Promise<Response> {
  try {
    csrf(req);
    const path = segments.join("/"),
      url = new URL(req.url),
      method = req.method;
    if (path === "auth/login" && method === "POST") {
      const b = z
        .object({
          username: z.string().min(1).max(80),
          password: z.string().min(1).max(128),
        })
        .parse(await body(req));
      const r = await login(b.username, b.password);
      return json(r.user, 200, {
        "Set-Cookie": cookie(r.token, url.protocol === "https:"),
      });
    }
    if (path === "auth/me")
      return json(
        await currentUser(req).then((u) => (u ? publicUser(u) : null)),
      );
    if (path === "auth/logout" && method === "POST") {
      const token = req.headers
        .get("cookie")
        ?.match(/inkora_session=([^;]+)/)?.[1];
      if (token) await remove("sessions", tokenHash(token));
      return json({ ok: true }, 200, {
        "Set-Cookie": cookie("", url.protocol === "https:"),
      });
    }
    if (path === "auth/password" && method === "POST") {
      const u = await requireUser(req, true);
      const b = z.object({ password }).parse(await body(req));
      if (b.password.toLowerCase() === u.username.toLowerCase())
        fail(400, "Loginni parol sifatida ishlatmang.");
      await rateLimit(u.id, "password-change", 10);
      await setPassword(u, b.password);
      await audit(u, "admin.password_changed", u.username);
      return json({ ok: true }, 200, {
        "Set-Cookie": cookie("", url.protocol === "https:"),
      });
    }
    if (path === "public/titles") return json(await publicTitles());
    if (path === "public/search") {
      const q = (url.searchParams.get("q") || "").toLowerCase().slice(0, 100);
      return json(
        q
          ? (await publicTitles(true))
              .filter((t) =>
                [t.title, t.author, ...t.alt_names].some((s) =>
                  s.toLowerCase().includes(q),
                ),
              )
              .slice(0, 8)
          : [],
      );
    }
    if (path === "public/settings")
      return json(await one("site_settings", { id: "main" }));
    if (segments[0] === "assets" && segments[1] && method === "GET") {
      const a = await one("assets", { id: segments[1] });
      if (!a) fail(404, "Rasm mavjud emas.");
      const t = await one("titles", { id: a.title_id });
      const c = a.chapter_id
        ? await one("chapters", { id: a.chapter_id })
        : null;
      let visible = isPublicTitle(t) && (!a.chapter_id || isPublicChapter(c));
      const kind = url.searchParams.get("kind");
      if (kind === "original") visible = false;
      if (!visible) {
        const u = await currentUser(req);
        if (!u || u.must_change || !(await canEdit(u, a.title_id)))
          fail(404, "Rasm mavjud emas.");
      }
      let key =
        kind === "original"
          ? a.original_key
          : kind === "thumb" && a.thumb_key
            ? a.thumb_key
            : kind === "medium" && a.thumb_key
              ? `assets/${a.id}/medium`
              : a.delivery_key;
      const requestedWidth = Number(url.searchParams.get("width") || 0);
      const responsive =
        a.chapter_id &&
        [640, 960, 1280, a.width].includes(requestedWidth) &&
        requestedWidth > 0 &&
        requestedWidth < a.width;
      if (responsive) {
        key = `assets/${a.id}/responsive-${requestedWidth}`;
        await ensureResponsive(a);
      }
      if (production)
        return new Response(null, {
          status: 307,
          headers: {
            Location: await storage.signed(key),
            "Cache-Control": "private,no-store",
          },
        });
      const etag = `"${a.id}-${kind || "delivery"}-${requestedWidth}"`;
      if (visible && req.headers.get("if-none-match") === etag)
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "public,max-age=60,must-revalidate",
          },
        });
      const bytes = await storage.get(key);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            responsive ||
            ((kind === "thumb" || kind === "medium") && a.thumb_key)
              ? "image/webp"
              : a.mime,
          "Cache-Control": visible
            ? "public,max-age=60,must-revalidate"
            : "private,no-store",
          "X-Content-Type-Options": "nosniff",
          ETag: etag,
        },
      });
    }
    if (path === "public/view" && method === "POST") {
      const b = z
        .object({
          title_id: z.string().uuid(),
          chapter_id: z.string().uuid().optional(),
        })
        .parse(await body(req));
      const t = await one("titles", { id: b.title_id });
      if (!isPublicTitle(t)) fail(404, "Asar topilmadi.");
      if (b.chapter_id) {
        const c = await one("chapters", {
          id: b.chapter_id,
          title_id: b.title_id,
        });
        if (!isPublicChapter(c)) fail(404, "Bob topilmadi.");
      }
      const v = viewer(req);
      await recordView(b.title_id, b.chapter_id || null, v.id);
      return json(
        { ok: true },
        200,
        v.cookie ? { "Set-Cookie": v.cookie } : {},
      );
    }
    const u = await requireUser(req);
    if (path === "admin/dashboard") {
      const [ts, cs, as, logs] = await Promise.all([
        list("titles", { deleted_at: null }),
        list("chapters", { deleted_at: null }),
        list("assets", {}, undefined, -1),
        list("audit_logs", {}, "created_at desc", 10),
      ]);
      const allowed = await editableTitles(u, ts);
      const ids = new Set(allowed.map((t) => t.id));
      return json({
        titles: allowed.length,
        chapters: cs.filter((c) => ids.has(c.title_id)).length,
        published: cs.filter((c) => ids.has(c.title_id) && isPublicChapter(c))
          .length,
        storage: as
          .filter((a) => ids.has(a.title_id))
          .reduce(
            (n, a) =>
              n +
              a.source_bytes +
              (a.original_key === a.delivery_key ? 0 : a.bytes),
            0,
          ),
        recent: allowed.slice(0, 5),
        logs:
          u.role === "SUPERADMIN"
            ? logs
            : logs.filter((l) => l.user_id === u.id),
      });
    }
    if (path === "admin/search" && method === "GET") {
      const q = (url.searchParams.get("q") || "")
        .trim()
        .toLowerCase()
        .slice(0, 100);
      if (!q) return json([]);
      const results = [];
      const titles = await editableTitles(
        u,
        await list("titles", { deleted_at: null }, "updated_at desc", 5000),
      );
      const chapters = await listIn(
        "chapters",
        "title_id",
        titles.map((t) => t.id),
        "id,title_id,number,name,status,deleted_at",
      );
      const byTitle = new Map<string, typeof chapters>();
      for (const c of chapters)
        if (!c.deleted_at) {
          const rows = byTitle.get(c.title_id) || [];
          rows.push(c);
          byTitle.set(c.title_id, rows);
        }
      for (const t of titles) {
        if ((t.title + " " + t.slug + " " + t.author).toLowerCase().includes(q))
          results.push({
            id: t.id,
            label: t.title,
            detail: t.visibility,
            href: "/admin/titles/" + t.id,
          });
        for (const c of (byTitle.get(t.id) || []).sort(
          (a, b) => a.number - b.number,
        ))
          if (
            (c.number + " " + c.name + " " + t.title).toLowerCase().includes(q)
          )
            results.push({
              id: c.id,
              label: t.title + " / " + c.number,
              detail: c.name || c.status,
              href: "/admin/chapters/" + c.id,
            });
        if (results.length >= 20) break;
      }
      return json(results.slice(0, 20));
    }
    if (path === "admin/archive" && method === "GET") {
      requireRole(u, ["SUPERADMIN", "ADMIN"]);
      const titleId = url.searchParams.get("title_id");
      if (titleId) await requireTitle(u, titleId);
      return json(
        (
          await list(
            titleId ? "chapters" : "titles",
            titleId ? { title_id: titleId } : {},
            "updated_at desc",
            -1,
          )
        ).filter((r) => r.deleted_at),
      );
    }
    if (segments[1] === "restore" && segments[2] && method === "POST") {
      requireRole(u, ["SUPERADMIN", "ADMIN"]);
      const b = z
        .object({ kind: z.enum(["title", "chapter"]) })
        .parse(await body(req));
      const table = b.kind === "title" ? "titles" : "chapters";
      const record = await one(table, { id: segments[2] });
      if (!record?.deleted_at) fail(404, "Arxiv yozuvi topilmadi.");
      if (b.kind === "chapter") await requireTitle(u, record.title_id);
      await update(table, record.id, {
        deleted_at: null,
        updated_at: now(),
        ...(b.kind === "title"
          ? { visibility: "Draft" }
          : { status: "Draft", publish_at: null }),
      });
      await audit(
        u,
        b.kind + ".restored",
        record.title || String(record.number),
      );
      return json({ ok: true });
    }
    if (path === "admin/titles" && method === "GET") {
      const ts = await editableTitles(
        u,
        await list("titles", { deleted_at: null }, "updated_at desc", 5000),
      );
      return json(await decorateTitles(ts));
    }
    if (path === "admin/titles" && method === "POST") {
      requireRole(u, ["SUPERADMIN", "ADMIN"]);
      const { alt_names, genres, ...data } = titleSchema.parse(await body(req));
      const t = {
        ...data,
        year: data.year || null,
        id: uid(),
        created_by: u.id,
        created_at: now(),
        updated_at: now(),
      };
      await saveTitle(t.id, t, alt_names, genres, u.id, true, t.updated_at);
      await audit(u, "title.created", t.title);
      return json(t, 201);
    }
    if (segments[1] === "titles" && segments[2]) {
      const t = await requireTitle(u, segments[2]);
      if (
        segments[3] === "chapters" &&
        segments[4] === "bulk" &&
        method === "POST"
      ) {
        requireRole(u, ["SUPERADMIN", "ADMIN"]);
        const b = z
          .object({
            ids: z.array(z.string().uuid()).min(1).max(100),
            action: z.enum(["publish", "draft", "archive"]),
          })
          .parse(await body(req));
        if (new Set(b.ids).size !== b.ids.length)
          fail(400, "Boblar takrorlanmasin.");
        const chapters = await list(
          "chapters",
          { title_id: t.id, deleted_at: null },
          undefined,
          -1,
        );
        if (b.ids.some((id) => !chapters.some((c) => c.id === id)))
          fail(400, "Boblar ro‘yxati o‘zgargan. Yangilang.");
        if (b.action === "publish")
          for (const id of b.ids)
            if (!(await one("chapter_pages", { chapter_id: id })))
              fail(400, "Bo‘sh bobni nashr qilib bo‘lmaydi.");
        await bulkChapters(t.id, b.ids, b.action, u.id);
        await update("titles", t.id, { updated_at: now() });
        await audit(
          u,
          "chapters.bulk_" + b.action,
          t.title + " / " + b.ids.length,
        );
        return json({ ok: true });
      }
      if (segments[3] === "chapters") {
        if (method === "GET")
          return json(
            await list(
              "chapters",
              { title_id: t.id, deleted_at: null },
              "sort_order",
              -1,
            ),
          );
        if (method === "POST") {
          const d = chapterSchema.parse(await body(req));
          if (d.status === "Published") fail(400, "Avval sahifalarni yuklang.");
          const c = await insert("chapters", {
            ...d,
            sort_order: d.sort_order ?? d.number,
            id: uid(),
            title_id: t.id,
            created_by: u.id,
            updated_by: u.id,
            created_at: now(),
            updated_at: now(),
          });
          await audit(u, "chapter.created", `${t.title} / ${c.number}`);
          return json(c, 201);
        }
      }
      if (segments[3] === "editors") {
        requireRole(u, ["SUPERADMIN", "ADMIN"]);
        if (method === "GET")
          return json(await list("title_editors", { title_id: t.id }));
        if (method === "PUT") {
          const ids = z
            .array(z.string().uuid())
            .max(50)
            .parse((await body(req)).ids);
          for (const id of ids) {
            const editor = await one("admin_users", { id });
            if (!editor || editor.role !== "EDITOR" || !editor.active)
              fail(400, "Editor topilmadi.");
          }
          await assignEditors(t.id, [...new Set(ids)]);
          await audit(u, "title.editors_changed", t.title);
          return json({ ok: true });
        }
      }
      if (method === "GET") return json((await decorateTitles([t]))[0]);
      if (method === "PUT") {
        const { alt_names, genres, ...data } = titleSchema.parse(
          await body(req),
        );
        if (
          u.role === "EDITOR" &&
          (data.visibility !== t.visibility || data.featured !== t.featured)
        )
          fail(403, "Nashr qilish uchun admin kerak.");
        await saveTitle(
          t.id,
          { ...data, year: data.year || null },
          alt_names,
          genres,
          u.id,
          false,
          now(),
        );
        await audit(
          u,
          data.visibility !== t.visibility
            ? "title.visibility_changed"
            : "title.changed",
          t.title,
        );
        return json({ id: t.id });
      }
      if (method === "DELETE") {
        requireRole(u, ["SUPERADMIN", "ADMIN"]);
        await update("titles", t.id, {
          deleted_at: now(),
          visibility: "Hidden",
        });
        await audit(u, "title.archived", t.title);
        return json({ ok: true });
      }
    }
    if (segments[1] === "chapters" && segments[2]) {
      const c = await requireChapter(u, segments[2]);
      if (segments[3] === "pages" && !segments[4] && method === "PUT") {
        const ids = z
          .array(z.string().uuid())
          .max(2000)
          .parse((await body(req)).ids);
        const pages = await list(
          "chapter_pages",
          { chapter_id: c.id },
          undefined,
          2000,
        );
        if (
          ids.length !== pages.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !pages.find((p) => p.id === id))
        )
          fail(400, "Sahifalar ro‘yxati o‘zgargan. Yangilang.");
        await reorderPages(c.id, ids);
        await audit(u, "chapter.reordered", String(c.number));
        return json({ ok: true });
      }
      if (segments[3] === "pages" && segments[4]) {
        const p = await one("chapter_pages", {
          id: segments[4],
          chapter_id: c.id,
        });
        if (!p) fail(404, "Sahifa topilmadi.");
        if (method === "PUT") {
          const jobId = z
            .string()
            .uuid()
            .parse((await body(req)).replacement_job_id);
          const j = await one("upload_jobs", {
            id: jobId,
            chapter_id: c.id,
            status: "ready",
          });
          if (!j || j.total !== 1)
            fail(400, "Almashtirish uchun bitta tayyor rasm yuklang.");
          const item = await one("upload_items", { job_id: jobId });
          const replacement = await one("chapter_pages", {
            id: item?.id,
            chapter_id: c.id,
          });
          if (!replacement || replacement.id === p.id)
            fail(400, "Yangi sahifa topilmadi.");
          await replacePage(c.id, p.id, replacement.id, p.asset_id);
          await deleteAsset(p.asset_id);
          await audit(u, "page.replaced", String(c.number));
          return json({ ok: true });
        }
        if (method === "DELETE") {
          if (
            c.status === "Published" &&
            (await list("chapter_pages", { chapter_id: c.id })).length <= 1
          )
            fail(400, "Oxirgi sahifani o‘chirishdan oldin bobni draft qiling.");
          await removePage(c.id, p.id, p.asset_id);
          await deleteAsset(p.asset_id);
          await audit(u, "page.deleted", String(c.number));
          return json({ ok: true });
        }
        if (method === "POST") {
          const a = await one("assets", { id: p.asset_id });
          const rotated = await prepareImage(
            await storage.get(a!.original_key),
            a!.filename,
            c.title_id,
            c.id,
            (p.rotation + 90) % 360,
          );
          if (
            !(await compareUpdate(
              "chapter_pages",
              p.id,
              { asset_id: p.asset_id, rotation: p.rotation },
              { asset_id: rotated.id, rotation: (p.rotation + 90) % 360 },
            ))
          ) {
            await deleteAsset(rotated.id);
            fail(409, "Sahifalar ro‘yxati o‘zgargan. Yangilang.");
          }
          await deleteAsset(p.asset_id);
          await audit(u, "page.rotated", String(c.number));
          return json({ ok: true });
        }
      }
      if (method === "GET")
        return json({
          ...c,
          pages: await pageData(c.id),
          title: await one("titles", { id: c.title_id }),
          jobs: await list(
            "upload_jobs",
            { chapter_id: c.id },
            "created_at desc",
            20,
          ),
        });
      if (method === "PUT") {
        const d = chapterSchema.parse(await body(req));
        if (d.status !== c.status || d.publish_at !== c.publish_at)
          requireRole(u, ["SUPERADMIN", "ADMIN"]);
        if (
          d.status === "Published" &&
          !(await list("chapter_pages", { chapter_id: c.id }, undefined, 1))
            .length
        )
          fail(400, "Bo‘sh bobni nashr qilib bo‘lmaydi.");
        await update("chapters", c.id, {
          ...d,
          sort_order: d.sort_order ?? d.number,
          updated_by: u.id,
          updated_at: now(),
        });
        await update("titles", c.title_id, { updated_at: now() });
        await audit(
          u,
          d.status === "Published" ? "chapter.published" : "chapter.changed",
          String(c.number),
        );
        return json({ ok: true });
      }
      if (method === "DELETE") {
        requireRole(u, ["SUPERADMIN", "ADMIN"]);
        await update("chapters", c.id, { deleted_at: now(), status: "Draft" });
        await audit(u, "chapter.archived", String(c.number));
        return json({ ok: true });
      }
    }
    if (path === "admin/uploads" && method === "POST") {
      const b = z
        .object({
          title_id: z.string().uuid(),
          chapter_id: z.string().uuid().nullable(),
          name: z
            .string()
            .min(1)
            .max(250)
            .refine((n) => !/[\x00-\x1f\x7f]/.test(n), "Fayl nomi noto‘g‘ri."),
          total_bytes: z.number().int().positive(),
        })
        .parse(await body(req));
      await requireTitle(u, b.title_id);
      if (b.chapter_id) {
        const c = await requireChapter(u, b.chapter_id);
        if (c.title_id !== b.title_id) fail(400, "Bob mos kelmaydi.");
      }
      const settings = await one("site_settings", { id: "main" });
      if (b.total_bytes > (settings?.max_upload_mb || 100) * 1048576)
        fail(413, "Fayl yuklash limitidan oshdi.");
      const active = (
        await list("upload_jobs", { user_id: u.id }, "created_at desc", 100)
      ).filter((j) => ["uploading", "processing"].includes(j.status));
      if (active.length >= 10)
        fail(429, "Avval oldingi yuklashlarni tugating yoki bekor qiling.");
      return json(
        await insert("upload_jobs", {
          ...b,
          id: uid(),
          user_id: u.id,
          created_at: now(),
        }),
        201,
      );
    }
    if (segments[1] === "uploads" && segments[2]) {
      const job = await one("upload_jobs", { id: segments[2] });
      if (!job) fail(404, "Yuklash topilmadi.");
      await requireTitle(u, job.title_id);
      if (job.chapter_id) await requireChapter(u, job.chapter_id);
      if (method === "GET") return json(job);
      if (job.lease_until > now())
        fail(
          409,
          "Bu import hozir qayta ishlanmoqda. Bir ozdan so‘ng qayta urinib ko‘ring.",
        );
      const lease = uid();
      if (
        !(await compareUpdate(
          "upload_jobs",
          job.id,
          { lease_token: job.lease_token },
          {
            lease_token: lease,
            lease_until: new Date(Date.now() + 310000).toISOString(),
          },
        ))
      )
        fail(409, "Import boshqa so‘rovda band.");
      try {
        if (method === "DELETE") {
          await cleanupJob(job);
          await update("upload_jobs", job.id, { status: "cancelled" });
          await audit(u, "upload.cancelled", job.name);
          return json({ ok: true });
        }
        if (segments[3] === "chunk" && method === "POST") {
          if (job.status !== "uploading")
            fail(409, "Yuklash bosqichi tugagan.");
          const n = Number(url.searchParams.get("index"));
          if (n !== job.next_chunk) fail(409, "Bo‘lak tartibi mos kelmaydi.");
          if (Number(req.headers.get("content-length") || 0) > 2097152)
            fail(413, "Bo‘lak juda katta.");
          const bytes = await readLimited(req, 2097152);
          if (
            bytes.length > 2097152 ||
            job.received_bytes + bytes.length > job.total_bytes
          )
            fail(413, "Fayl chegarasidan oshdi.");
          await storage.put(`uploads/${job.id}/chunk-${n}`, bytes);
          await update("upload_jobs", job.id, {
            received_bytes: job.received_bytes + bytes.length,
            next_chunk: n + 1,
          });
          return json({ received: job.received_bytes + bytes.length });
        }
        if (segments[3] === "prepare" && method === "POST") {
          if (job.status !== "uploading") return json(job);
          try {
            await stageJob(job);
          } catch (e) {
            await cleanupJob(job);
            await update("upload_jobs", job.id, {
              status: "failed",
              error:
                e instanceof HttpError
                  ? e.message
                  : "Import bajarilmadi. Faylni tekshirib qayta yuklang.",
            });
            throw e;
          }
          return json(await one("upload_jobs", { id: job.id }));
        }
        if (segments[3] === "process" && method === "POST") {
          if (job.status === "ready") return json(job);
          if (!job.total || !["processing", "failed"].includes(job.status))
            fail(409, "Avval faylni yuklang.");
          try {
            const result = await processNext(job);
            if (result?.status === "ready")
              await audit(
                u,
                job.chapter_id
                  ? "chapter.pages_uploaded"
                  : "title.artwork_uploaded",
                job.name,
              );
            return json(result);
          } catch (e) {
            await update("upload_jobs", job.id, {
              status: "failed",
              error:
                e instanceof HttpError
                  ? e.message
                  : "Sahifani qayta ishlash bajarilmadi. Qayta urinib ko‘ring.",
            });
            throw e;
          }
        }
      } finally {
        await compareUpdate(
          "upload_jobs",
          job.id,
          { lease_token: lease },
          { lease_token: "", lease_until: "" },
        );
      }
    }
    if (path === "admin/editor-options" && method === "GET") {
      requireRole(u, ["SUPERADMIN", "ADMIN"]);
      return json(
        (await list("admin_users", { role: "EDITOR", active: 1 })).map(
          publicUser,
        ),
      );
    }
    if (path === "admin/admins") {
      requireRole(u, ["SUPERADMIN"]);
      if (method === "GET")
        return json(
          (await list("admin_users", {}, "created_at desc")).map(publicUser),
        );
      if (method === "POST") {
        const b = z
          .object({
            username: z
              .string()
              .toLowerCase()
              .regex(/^[a-z0-9_]{3,40}$/),
            display_name: z.string().min(1).max(80),
            password,
            role: z.enum(["SUPERADMIN", "ADMIN", "EDITOR"]),
            active: z.coerce.number().int().min(0).max(1).default(1),
          })
          .parse(await body(req));
        await rateLimit(u.id, "accounts", 30);
        const a = await createAdmin(
          b.username,
          b.display_name,
          b.password,
          b.role,
        );
        if (!b.active) {
          await update("admin_users", a.id, { active: 0 });
          a.active = 0;
        }
        await audit(u, "admin.created", a.username);
        return json(publicUser(a), 201);
      }
    }
    if (segments[1] === "admins" && segments[2]) {
      requireRole(u, ["SUPERADMIN"]);
      if (method !== "GET") await rateLimit(u.id, "accounts", 30);
      const a = await one("admin_users", { id: segments[2] });
      if (!a) fail(404, "Admin topilmadi.");
      if (a.id === u.id)
        fail(400, "O‘z hisobingizni bu yerdan o‘zgartira olmaysiz.");
      if (method === "DELETE") {
        await invalidateSessions(a.id);
        await update("admin_users", a.id, { active: 0 });
        if (production && a.auth_id) {
          const { error } = await supabase().auth.admin.deleteUser(a.auth_id);
          if (error) throw error;
        }
        await remove("admin_users", a.id);
        await audit(u, "admin.deleted", a.username);
        return json({ ok: true });
      }
      if (method === "PUT") {
        const b = z
          .object({
            role: z.enum(["SUPERADMIN", "ADMIN", "EDITOR"]),
            active: z.coerce.number().int().min(0).max(1),
            display_name: z.string().min(1).max(80),
            password: password.optional(),
          })
          .parse(await body(req));
        if (b.password) {
          await setPassword(a, b.password);
          await update("admin_users", a.id, { must_change: 1 });
          await audit(u, "admin.password_reset", a.username);
        }
        await update("admin_users", a.id, {
          role: b.role,
          active: b.active,
          display_name: b.display_name,
        });
        await invalidateSessions(a.id);
        if (b.role !== a.role)
          await audit(
            u,
            "admin.role_changed",
            a.username + " / " + a.role + " → " + b.role,
          );
        if (b.active !== a.active)
          await audit(
            u,
            b.active ? "admin.enabled" : "admin.disabled",
            a.username,
          );
        await audit(u, "admin.changed", a.username);
        return json({ ok: true });
      }
    }
    if (path === "admin/audit") {
      requireRole(u, ["SUPERADMIN"]);
      return json(await list("audit_logs", {}, "created_at desc", 300));
    }
    if (path === "admin/maintenance/cleanup" && method === "POST") {
      requireRole(u, ["SUPERADMIN"]);
      const result = await cleanupOrphans();
      await audit(
        u,
        "storage.orphans_cleaned",
        `${result.removed} assets / ${result.cancelled} imports`,
      );
      return json(result);
    }
    if (path === "admin/settings") {
      requireRole(u, ["SUPERADMIN"]);
      if (method === "GET")
        return json(await one("site_settings", { id: "main" }));
      if (method === "PUT") {
        const b = z
          .object({
            name: z.string().min(1).max(60),
            description: z.string().max(300),
            max_upload_mb: z.coerce.number().int().min(1).max(250),
            max_pages: z.coerce.number().int().min(1).max(2000),
          })
          .parse(await body(req));
        await update("site_settings", "main", b);
        await audit(u, "settings.changed", "global");
        return json({ ok: true });
      }
    }
    fail(404, "Sahifa topilmadi.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : String(error);
    console.error("API error", message);
    if (/unique|duplicate/i.test(message))
      return json(
        { error: "Bu nom, slug yoki bob raqami allaqachon mavjud." },
        409,
      );
    if (
      /^(Sahifalar ro‘yxati|Boblar ro‘yxati|Bo‘sh bob|Oxirgi sahifani|Faol editor)/.test(
        message,
      )
    )
      return json({ error: message.slice(0, 200) }, 400);
    return json(
      {
        error:
          "So‘rov bajarilmadi. Ma’lumotlaringizni saqlab, qayta urinib ko‘ring.",
      },
      500,
    );
  }
}
