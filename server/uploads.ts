import sharp, { type Metadata } from "sharp";
import yauzl from "yauzl";
import { insert, list, one, update, remove, now, uid, type Row } from "./db";
import { storage } from "./storage";
import { fail } from "./auth";
export const naturalSort = (names: string[]) =>
  names.sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );
export function safeArchiveName(name: string) {
  return (
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.split("/").includes("..") &&
    !/^[A-Za-z]:/.test(name) &&
    !name.includes("\0")
  );
}
export function supportedName(name: string) {
  return (
    /\.(jpe?g|png|webp|avif)$/i.test(name) &&
    !name.split("/").some((x) => x.startsWith(".") || x === "__MACOSX")
  );
}
const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heif: "image/avif",
};
export async function ensureResponsive(asset: Row, source?: Buffer) {
  if (!asset.chapter_id || asset.responsive_ready) return;
  const bytes = source || (await storage.get(asset.delivery_key));
  await Promise.all(
    [640, 960, 1280]
      .filter((width) => width < asset.width)
      .map(async (width) => {
        const image = await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .webp({ lossless: true, effort: 2 })
          .toBuffer();
        await storage.put(
          `assets/${asset.id}/responsive-${width}`,
          image,
          "image/webp",
        );
      }),
  );
  await update("assets", asset.id, { responsive_ready: 1 });
}
export async function prepareImage(
  bytes: Buffer,
  name: string,
  titleId: string,
  chapterId: string | null,
  rotation = 0,
  assetId?: string,
) {
  if (assetId) {
    const existing = await one("assets", { id: assetId });
    if (existing) {
      await ensureResponsive(existing);
      return existing;
    }
  }
  if (bytes.length > Number(process.env.MAX_IMAGE_MB || 30) * 1024 * 1024)
    fail(413, "Rasm juda katta.");
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 60000000 }).metadata();
  } catch {
    fail(415, "Rasm buzilgan yoki qo‘llab-quvvatlanmaydi.");
  }
  if (
    !meta!.format ||
    !MIME[meta!.format] ||
    !meta!.width ||
    !meta!.height ||
    (meta!.pages || 1) > 1
  )
    fail(415, "Faqat statik JPG, PNG, WebP va AVIF rasmlar qabul qilinadi.");
  if (meta.format === "heif" && meta.compression !== "av1")
    fail(415, "HEIC formati qo‘llab-quvvatlanmaydi. AVIF yoki JPG ishlating.");
  try {
    await sharp(bytes, { limitInputPixels: 60000000 }).stats();
  } catch {
    fail(415, "Rasm ma’lumotlari to‘liq emas yoki buzilgan.");
  }
  const id = assetId || uid(),
    base = `assets/${id}`,
    original_key = `${base}/original`;
  let delivery_key = `${base}/delivery`;
  let output = bytes,
    mime = MIME[meta!.format!],
    width = meta!.width!,
    height = meta!.height!;
  if (rotation || (meta!.orientation && meta!.orientation !== 1)) {
    const oriented =
      meta.orientation && meta.orientation !== 1
        ? await sharp(bytes).rotate().png().toBuffer()
        : bytes;
    output = await sharp(oriented)
      .rotate(rotation)
      .webp({ lossless: true })
      .toBuffer();
    mime = "image/webp";
    const m = await sharp(output).metadata();
    width = m.width!;
    height = m.height!;
  } else if (bytes.length > 400000 && ["png", "jpeg"].includes(meta!.format!)) {
    const candidate = await sharp(bytes)
      .webp({ lossless: true, effort: 3 })
      .toBuffer();
    if (candidate.length < bytes.length * 0.85) {
      output = candidate;
      mime = "image/webp";
    }
  }
  await storage.put(original_key, bytes, MIME[meta!.format!]);
  if (output === bytes) delivery_key = original_key;
  else await storage.put(delivery_key, output, mime);
  let thumb_key: null | string = null;
  if (!chapterId) {
    thumb_key = `${base}/thumb`;
    await storage.put(
      thumb_key,
      await sharp(bytes)
        .rotate()
        .resize({ width: 420, withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer(),
      "image/webp",
    );
    await storage.put(
      `${base}/medium`,
      await sharp(bytes)
        .rotate()
        .resize({ width: 840, withoutEnlargement: true })
        .webp({ quality: 92 })
        .toBuffer(),
      "image/webp",
    );
  }
  const asset = {
    id,
    title_id: titleId,
    chapter_id: chapterId,
    original_key,
    delivery_key,
    thumb_key,
    mime,
    width,
    height,
    bytes: output.length,
    source_bytes: bytes.length,
    responsive_ready: 0,
    filename: name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 250),
    created_at: now(),
  };
  await insert("assets", asset);
  await ensureResponsive(asset, output);
  return { ...asset, responsive_ready: chapterId ? 1 : 0 };
}
async function archiveEntries(
  buffer: Buffer,
  maxPages: number,
  jobId: string,
): Promise<{ name: string; key: string }[]> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip) return reject(new Error("ZIP fayli buzilgan."));
        let total = 0,
          count = 0,
          entriesSeen = 0;
        const results: { name: string; key: string }[] = [];
        const abort = (e: Error) => {
          zip.close();
          reject(e);
        };
        zip.on("error", abort);
        zip.on("end", () =>
          resolve(
            results.sort((a, b) =>
              a.name.localeCompare(b.name, "en", { numeric: true }),
            ),
          ),
        );
        zip.on("entry", (e: yauzl.Entry) => {
          if (++entriesSeen > 10000 || e.fileName.length > 4096)
            return abort(
              new Error("ZIP metama’lumotlari xavfsizlik chegarasidan oshdi."),
            );
          if (!safeArchiveName(e.fileName))
            return abort(
              new Error("ZIP ichida xavfsiz bo‘lmagan yo‘l mavjud."),
            );
          if (!supportedName(e.fileName)) return zip.readEntry();
          total += e.uncompressedSize;
          count++;
          if (
            count > maxPages ||
            total > Number(process.env.MAX_EXTRACTED_MB || 300) * 1048576 ||
            e.uncompressedSize > 30 * 1048576 ||
            e.uncompressedSize / Math.max(1, e.compressedSize) > 250
          )
            return abort(new Error("ZIP xavfsizlik chegarasidan oshdi."));
          zip.openReadStream(e, (error, stream) => {
            if (error || !stream)
              return abort(new Error("ZIP sahifasi o‘qilmadi."));
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on("data", (c: Buffer) => {
              size += c.length;
              if (size > 30 * 1048576) {
                stream.destroy();
                abort(new Error("Sahifa juda katta."));
              } else chunks.push(c);
            });
            stream.on("error", abort);
            stream.on("end", () => {
              const key = `uploads/${jobId}/entry-${results.length}`;
              void storage
                .put(key, Buffer.concat(chunks))
                .then(() => {
                  results.push({ name: e.fileName, key });
                  zip.readEntry();
                })
                .catch(abort);
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
}
async function pdfDocument(bytes: Buffer) {
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvas.DOMMatrix,
    ImageData: canvas.ImageData,
    Path2D: canvas.Path2D,
  });
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    return await pdf.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    }).promise;
  } catch {
    fail(
      400,
      "PDF ochilmadi. Fayl buzilgan, parol bilan himoyalangan yoki qo‘llab-quvvatlanmaydi.",
    );
  }
}
export async function stageJob(job: Row) {
  const chunks: Buffer[] = [];
  for (let i = 0; i < job.next_chunk; i++)
    chunks.push(await storage.get(`uploads/${job.id}/chunk-${i}`));
  const buffer = Buffer.concat(chunks);
  if (buffer.length !== job.total_bytes) fail(400, "Fayl to‘liq yuklanmagan.");
  const settings = await one("site_settings", { id: "main" });
  const maxPages = settings?.max_pages || 500;
  let entries: { name: string; key: string }[] = [];
  if (
    !job.chapter_id &&
    (buffer.subarray(0, 4).toString("hex") === "504b0304" ||
      buffer.subarray(0, 5).toString() === "%PDF-")
  )
    fail(415, "Muqova yoki banner uchun bitta rasm yuklang.");
  if (buffer.subarray(0, 4).toString("hex") === "504b0304") {
    try {
      entries = await archiveEntries(buffer, maxPages, job.id);
    } catch (e) {
      fail(
        400,
        "ZIP fayli rad etildi: " +
          (e instanceof Error ? e.message : "buzilgan arxiv"),
      );
    }
    if (!entries.length) fail(400, "ZIP ichida rasmlar topilmadi.");
  } else if (buffer.subarray(0, 5).toString() === "%PDF-") {
    const doc = await pdfDocument(buffer);
    if (
      doc.numPages +
        (
          await list(
            "chapter_pages",
            { chapter_id: job.chapter_id },
            undefined,
            2001,
          )
        ).length >
      maxPages
    ) {
      await doc.loadingTask.destroy();
      fail(413, "PDF sahifalari limitdan oshdi.");
    }
    await storage.put(
      `uploads/${job.id}/source.pdf`,
      buffer,
      "application/pdf",
    );
    for (let i = 0; i < doc.numPages; i++)
      await insert("upload_items", {
        id: uid(),
        job_id: job.id,
        position: i,
        name: `PDF ${i + 1}`,
        storage_key: `uploads/${job.id}/source.pdf`,
        status: "pending",
      });
    await update("upload_jobs", job.id, {
      status: "processing",
      total: doc.numPages,
      master_key: `uploads/${job.id}/source.pdf`,
    });
    await doc.loadingTask.destroy();
    return;
  } else {
    const key = `uploads/${job.id}/entry-0`;
    await storage.put(key, buffer);
    entries = [{ name: job.name, key }];
  }
  const existing = job.chapter_id
    ? await list(
        "chapter_pages",
        { chapter_id: job.chapter_id },
        undefined,
        2000,
      )
    : [];
  if (existing.length + entries.length > maxPages)
    fail(413, "Bob sahifalari limitdan oshdi.");
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i].key;
    await insert("upload_items", {
      id: uid(),
      job_id: job.id,
      position: i,
      name: entries[i].name,
      storage_key: key,
      status: "pending",
    });
  }
  await update("upload_jobs", job.id, {
    status: "processing",
    total: entries.length,
  });
}
export async function processNext(job: Row) {
  const item = (
    await list(
      "upload_items",
      { job_id: job.id, status: "pending" },
      "position",
      1,
    )
  )[0];
  if (!item) {
    await cleanupJob(job);
    return { ...job, status: "ready" };
  }
  if (job.chapter_id && !(await one("chapter_pages", { id: item.id }))) {
    const settings = await one("site_settings", { id: "main" });
    if (
      (
        await list(
          "chapter_pages",
          { chapter_id: job.chapter_id },
          undefined,
          2001,
        )
      ).length >= (settings?.max_pages || 500)
    )
      fail(413, "Bob sahifalari limitdan oshdi.");
  }
  let bytes = await storage.get(item.storage_key);
  if (item.storage_key.endsWith(".pdf")) {
    const doc = await pdfDocument(bytes);
    try {
      const page = await doc.getPage(item.position + 1);
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1800 / original.width);
      const viewport = page.getViewport({ scale });
      if (viewport.width * viewport.height > 30000000)
        fail(413, "PDF sahifasi juda katta.");
      const { createCanvas } = await import("@napi-rs/canvas");
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvas: canvas as any,
        canvasContext: canvas.getContext("2d") as any,
        viewport,
      }).promise;
      bytes = canvas.toBuffer("image/png");
    } finally {
      await doc.loadingTask.destroy();
    }
  }
  const asset = await prepareImage(
    bytes,
    item.name,
    job.title_id,
    job.chapter_id,
    0,
    item.id,
  );
  if (job.chapter_id) {
    const pages = await list(
      "chapter_pages",
      { chapter_id: job.chapter_id },
      "position desc",
      1,
    );
    if (!(await one("chapter_pages", { id: item.id })))
      await insert("chapter_pages", {
        id: item.id,
        chapter_id: job.chapter_id,
        asset_id: asset.id,
        position: pages.length ? pages[0].position + 1 : 0,
        rotation: 0,
      });
  } else {
    const field = job.name.startsWith("banner:") ? "banner_id" : "cover_id";
    const title = await one("titles", { id: job.title_id });
    const previous = title?.[field];
    await update("titles", job.title_id, {
      [field]: asset.id,
      updated_at: now(),
    });
    // Do not leave replaced artwork in storage, or delete artwork still used elsewhere.
    if (
      previous &&
      previous !== asset.id &&
      ![title?.[field === "cover_id" ? "banner_id" : "cover_id"]].includes(
        previous,
      )
    )
      await deleteAsset(previous);
  }
  await update("upload_items", item.id, { status: "ready" });
  await update("upload_jobs", job.id, {
    processed: job.processed + 1,
    status: job.processed + 1 === job.total ? "ready" : "processing",
    error: null,
  });
  if (job.processed + 1 === job.total) await cleanupJob(job);
  return await one("upload_jobs", { id: job.id });
}
export async function cleanupJob(job: Row) {
  const keys = new Set(
    (await list("upload_items", { job_id: job.id }, undefined, 2000)).map(
      (i) => i.storage_key,
    ),
  );
  for (let i = 0; i < job.next_chunk; i++)
    keys.add(`uploads/${job.id}/chunk-${i}`);
  if (!job.total) {
    for (let i = 0; i < 2000; i++) keys.add(`uploads/${job.id}/entry-${i}`);
    keys.add(`uploads/${job.id}/source.pdf`);
  }
  // Keep imported PDF masters while any resulting page is retained.
  const items = await list("upload_items", { job_id: job.id }, undefined, 2000);
  for (const item of items) {
    if (await one("chapter_pages", { asset_id: item.id })) continue;
    const title = await one("titles", { id: job.title_id });
    if (title?.cover_id === item.id || title?.banner_id === item.id) continue;
    const asset = await one("assets", { id: item.id });
    if (asset) await deleteAsset(item.id);
    else
      for (const suffix of [
        "original",
        "delivery",
        "thumb",
        "medium",
        "responsive-640",
        "responsive-960",
        "responsive-1280",
      ])
        keys.add(`assets/${item.id}/${suffix}`);
  }

  if (
    job.master_key &&
    (
      await list(
        "chapter_pages",
        { chapter_id: job.chapter_id },
        undefined,
        2000,
      )
    ).some((p) => items.some((i) => i.id === p.id))
  )
    keys.delete(job.master_key);
  await storage.deleteMany([...keys]);
  await update("upload_jobs", job.id, { status: "ready" });
}
export async function deleteAsset(id: string) {
  const a = await one("assets", { id });
  if (!a) return;
  for (const key of new Set(
    [
      a.original_key,
      a.delivery_key,
      a.thumb_key,
      ...(a.thumb_key ? [`assets/${id}/medium`] : []),
      ...[640, 960, 1280]
        .filter((w) => w < a.width)
        .map((w) => `assets/${id}/responsive-${w}`),
    ].filter(Boolean),
  ))
    await storage.delete(key);
  await remove("assets", id);
}
