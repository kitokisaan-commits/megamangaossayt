/** Build-only public export from the SAME app and seed database. Never exports admin data. */
import { cp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import {
  publicTitles,
  chapterData,
  isPublicTitle,
  isPublicChapter,
} from "../server/content";
import { one, list, dataDir, production, type Row } from "../server/db";
if (production)
  throw new Error(
    "The development preview exporter only accepts the local seed adapter.",
  );
const root = process.cwd();
const staging = path.join(root, ".work-export");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
for (const name of ["app", "components", "lib", "public", "vendor", "hooks"])
  await cp(path.join(root, name), path.join(staging, name), {
    recursive: true,
  });
await rm(path.join(staging, "app/api"), { recursive: true, force: true });
await rm(path.join(staging, "app/admin"), { recursive: true, force: true });
await rm(path.join(staging, "app/chatgpt-auth.ts"), { force: true });
await rm(path.join(staging, "lib/connectors.ts"), { force: true });
await symlink(
  path.join(root, "node_modules"),
  path.join(staging, "node_modules"),
  "dir",
);
for (const name of ["postcss.config.mjs", "tsconfig.json", "next-env.d.ts"])
  await cp(path.join(root, name), path.join(staging, name));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await writeFile(
  path.join(staging, "package.json"),
  JSON.stringify({ ...pkg, scripts: { build: "next build" } }, null, 2),
);
await writeFile(
  path.join(staging, "next.config.ts"),
  'export default {output:"export", trailingSlash:true, images:{unoptimized:true}, experimental:{cpus:2}};\n',
);
await mkdir(path.join(staging, "server"));
const titles = await publicTitles();
const chapterRecords = Object.fromEntries(
  await Promise.all(
    titles.flatMap((t) =>
      t.chapters.map(async (c: Row) => [c.id, await chapterData(c.id)]),
    ),
  ),
);
const assetDir = path.join(staging, "public/preview/assets");
await mkdir(assetDir, { recursive: true });
// Allowlist public assets: excludes originals, drafts, future schedules and all private records.
const urlMap = new Map<string, string>();
for (const a of await list("assets", {}, undefined, -1)) {
  const t = await one("titles", { id: a.title_id });
  const c = a.chapter_id ? await one("chapters", { id: a.chapter_id }) : null;
  if (!isPublicTitle(t) || (a.chapter_id && !isPublicChapter(c))) continue;
  const prefix = `/api/assets/${a.id}`;
  const base = `/preview/assets/${a.id}`;
  const extension =
    a.mime === "image/png"
      ? "png"
      : a.mime === "image/jpeg"
        ? "jpg"
        : a.mime === "image/avif"
          ? "avif"
          : "webp";
  const variants = a.chapter_id
    ? [["delivery", a.delivery_key]]
    : [
        ["delivery", a.delivery_key],
        ["thumb", a.thumb_key || a.delivery_key],
        ["medium", a.thumb_key ? `assets/${a.id}/medium` : a.delivery_key],
      ];
  for (const [kind, key] of variants) {
    const bytes = await readFile(path.join(dataDir, "objects", key));
    const target = `${base}-${kind}.${kind === "delivery" ? extension : "webp"}`;
    await writeFile(path.join(staging, "public", target), bytes);
    urlMap.set(`${prefix}?kind=${kind}`, target);
    if (kind === "delivery" && a.chapter_id) {
      for (const width of [
        ...new Set([640, 960, 1280, a.width].map((w) => Math.min(w, a.width))),
      ]) {
        if (width === a.width) {
          urlMap.set(`${prefix}?kind=delivery&width=${width}`, target);
          continue;
        }
        const rendition =
          width < a.width
            ? await sharp(bytes)
                .resize({ width })
                .webp({ lossless: true, effort: 2 })
                .toBuffer()
            : bytes;
        const url = `${base}-${width}.webp`;
        await writeFile(path.join(staging, "public", url), rendition);
        urlMap.set(`${prefix}?kind=delivery&width=${width}`, url);
      }
    }
  }
}
function remap<T>(value: T): T {
  if (typeof value === "string") {
    let result = value as string;
    for (const [from, to] of [...urlMap].sort(
      (a, b) => b[0].length - a[0].length,
    ))
      result = result.replaceAll(from, to);
    return result as T;
  }
  if (Array.isArray(value)) return value.map(remap) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remap(v)]),
    ) as T;
  return value;
}
const records = remap({
  titles,
  chapters: chapterRecords,
  settings: await one("site_settings", { id: "main" }),
  assetUrls: Object.fromEntries(urlMap),
});
await writeFile(
  path.join(staging, "server/preview-data.json"),
  JSON.stringify(records),
);
await writeFile(
  path.join(staging, "public/preview/settings.json"),
  JSON.stringify(records.settings),
);
await writeFile(
  path.join(staging, "server/db.ts"),
  'import data from "./preview-data.json"; export const one = async (...args:any[]): Promise<any> => data.settings; export const list = async (...args:any[]): Promise<any[]> => [];\n',
);
await writeFile(
  path.join(staging, "server/content.ts"),
  `import data from "./preview-data.json";
export const publicTitles = async (summary=false): Promise<any[]> => data.titles;
export const titleRecord = async (slug: string): Promise<any> => data.titles.find(t=>t.slug===slug)||null;
export const chapterRecord = async (id:string): Promise<any> => {const d=(data.chapters as Record<string,any>)[id]; return d ? {title:d.title, chapter:d.chapter}:null;};
export const titleData = async (slug: string): Promise<any> => data.titles.find(t=>t.slug===slug)||null;
export const chapterData = async (id: string): Promise<any> => (data.chapters as Record<string,any>)[id]||null;
export const pageData = async (id: string) => (await chapterData(id))?.pages||[];
export const decorateTitles = async (t:any[]) => t;
export const assetUrl = (id:string|null|undefined, kind="delivery") => id ? (data.assetUrls as Record<string,string>)["/api/assets/"+id+"?kind="+kind] || "/demo/empty-cover.png" : "/demo/empty-cover.png";
`,
);
for (const file of [
  "app/page.tsx",
  "app/catalog/page.tsx",
  "app/title/[slug]/page.tsx",
  "app/read/[id]/page.tsx",
]) {
  const p = path.join(staging, file);
  let text = await readFile(p, "utf8");
  text = text.replace(
    'export const dynamic = "force-dynamic";',
    'export const dynamic = "force-static";',
  );
  text = text.replace(
    /import \{ currentUser, canEdit \} from "@\/server\/auth";\n/,
    "",
  );
  const privateMetadata = text.indexOf(
    '  if ((await searchParams).preview === "1") {',
  );
  if (privateMetadata !== -1) {
    const end = text.indexOf(
      file.includes("title/")
        ? "  const { slug } = await params,"
        : "  const d = await chapterRecord",
      privateMetadata,
    );
    if (end === -1) throw new Error("Cannot isolate private preview metadata");
    text = text.slice(0, privateMetadata) + text.slice(end);
  }

  text = text.replace(
    'preview = (await searchParams).preview === "1"',
    "preview = false",
  );
  if (file === "app/catalog/page.tsx")
    text = text.replace(
      'export const dynamic = "force-static";',
      'export const dynamic = "auto";',
    );
  const start = text.indexOf("  if (preview) {");
  if (start !== -1) {
    const end = text.indexOf(
      file.includes("title/")
        ? "  if (!t) notFound();"
        : "  if (!data) notFound();",
      start,
    );
    text = text.slice(0, start) + text.slice(end);
  }
  if (file.includes("title/") || file.includes("read/")) {
    text = text.replace(
      /import \{([^}]*)\} from "@\/server\/content";/,
      (_, names: string) =>
        `import { ${names.trim().replace(/,$/, "")}, publicTitles } from "@/server/content";`,
    );
  }
  if (file.includes("title/")) {
    text +=
      "\nexport async function generateStaticParams() { return (await publicTitles()).map(t=>({slug:t.slug})); }\n";
  }
  if (file.includes("read/")) {
    text +=
      "\nexport async function generateStaticParams() { return (await publicTitles()).flatMap(t=>t.chapters.map((c:any)=>({id:c.id}))); }\n";
  }
  text = text.replaceAll(
    "<Header />",
    "<Header initialTitles={await publicTitles()} />",
  );
  text = text.replace(
    'src={"/api/assets/" + hero.cover_id + "?kind=medium"}',
    'src={hero.cover.replace("-thumb.webp", "-medium.webp")}',
  );
  text = text.replace(
    '["/api/assets/" + d.title.cover_id + "?kind=medium"]',
    '[d.title.cover.replace("-thumb.webp", "-medium.webp")]',
  );
  await writeFile(p, text);
}
const layout = path.join(staging, "app/layout.tsx");
let layoutText = await readFile(layout, "utf8");
layoutText = layoutText.replace(
  'metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),',
  'metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"), robots: {index:false, follow:false},',
);
await writeFile(layout, layoutText);
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/next/dist/bin/next"), "build"],
  {
    cwd: staging,
    env: { ...process.env, NEXT_PUBLIC_WORK_PREVIEW: "true" },
    stdio: "inherit",
  },
);
if (result.status !== 0) process.exit(result.status || 1);
await rm(path.join(root, "out"), { recursive: true, force: true });
await cp(path.join(staging, "out"), path.join(root, "out"), {
  recursive: true,
});
console.log(
  `Work export complete: ${titles.length} series, ${Object.keys(chapterRecords).length} chapters; no admin records or server secrets.`,
);
