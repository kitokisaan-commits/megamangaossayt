import { cache } from "react";
import { list, listIn, one, chapterSummaries, type Row } from "./db";
export function isPublicTitle(t: Row | null) {
  return !!t && !t.deleted_at && t.visibility === "Published";
}
export function isPublicChapter(c: Row | null) {
  return (
    !!c &&
    !c.deleted_at &&
    c.status === "Published" &&
    (!c.publish_at || Date.parse(c.publish_at) <= Date.now())
  );
}
export const assetUrl = (id: string | null | undefined, kind = "delivery") =>
  id ? `/api/assets/${id}?kind=${kind}` : "/demo/empty-cover.png";
const chapterColumns =
  "id,title_id,number,name,volume,status,publish_at,published_at,sort_order,updated_at,created_at,deleted_at,page_count";
function group(rows: Row[], key: string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const values = map.get(row[key]) || [];
    values.push(row);
    map.set(row[key], values);
  }
  return map;
}
export async function decorateTitles(
  titles: Row[],
  summary = false,
): Promise<Row[]> {
  const ids = titles.map((t) => t.id);
  const [alts, links, genres, chapters] = await Promise.all([
    listIn("title_alt_names", "title_id", ids),
    listIn("title_genres", "title_id", ids),
    list("genres"),
    summary
      ? chapterSummaries(ids)
      : listIn("chapters", "title_id", ids, chapterColumns),
  ]);
  const gm = new Map(genres.map((g) => [g.id, g.name]));
  const am = group(alts, "title_id"),
    lm = group(links, "title_id"),
    cm = group(summary ? [] : chapters.filter(isPublicChapter), "title_id");
  const summaries = new Map(chapters.map((c) => [c.title_id, c]));
  return titles.map((t) => {
    const cs: Row[] = (
      summary ? summaries.get(t.id)?.chapters || [] : cm.get(t.id) || []
    ).sort(
      (a: Row, b: Row) => b.sort_order - a.sort_order || b.number - a.number,
    );
    const last = cs.reduce(
      (stamp, c) =>
        Math.max(
          stamp,
          Date.parse(c.published_at || c.publish_at || c.updated_at) || 0,
        ),
      0,
    );
    return {
      ...t,
      alt_names: (am.get(t.id) || []).map((a) => a.name),
      genres: (lm.get(t.id) || []).map((l) => gm.get(l.genre_id)),
      chapters: summary ? cs.slice(0, 2) : cs,
      chapter_count: summary
        ? summaries.get(t.id)?.chapter_count || 0
        : cs.length,
      latest_chapter_at:
        (summary && summaries.get(t.id)?.latest_chapter_at) ||
        (last ? new Date(last).toISOString() : t.updated_at),
      cover: assetUrl(t.cover_id, "thumb"),
    };
  });
}
export const publicTitles = cache(async (summary = false) => {
  return decorateTitles(
    (
      await list(
        "titles",
        { visibility: "Published", deleted_at: null },
        "updated_at desc",
        5000,
      )
    ).filter(isPublicTitle),
    summary,
  );
});
export const titleRecord = cache(async (slug: string) => {
  const t = await one("titles", { slug });
  return isPublicTitle(t) ? t : null;
});
export async function titleData(slug: string) {
  const t = await titleRecord(slug);
  if (!t) return null;
  return (await decorateTitles([t!]))[0];
}
export const chapterRecord = cache(
  async (id: string): Promise<{ chapter: Row; title: Row } | null> => {
    const c = await one("chapters", { id });
    if (!isPublicChapter(c)) return null;
    const t = await one("titles", { id: c!.title_id });
    return isPublicTitle(t)
      ? { chapter: c!, title: { ...t!, cover: assetUrl(t!.cover_id, "thumb") } }
      : null;
  },
);
export async function chapterData(
  id: string,
): Promise<{ chapter: Row; title: Row; pages: Row[]; chapters: Row[] } | null> {
  const record = await chapterRecord(id);
  if (!record) return null;
  const [pages, allChapters] = await Promise.all([
    pageData(id, true),
    list(
      "chapters",
      { title_id: record.title.id },
      "sort_order",
      -1,
      chapterColumns,
    ),
  ]);
  const chapters = allChapters.filter(isPublicChapter);
  return {
    ...record,
    chapter: { ...record.chapter, page_count: pages.length },
    pages: pages.map(
      ({ id, asset_id, position, width, height, src, srcset }) => ({
        id,
        asset_id,
        position,
        width,
        height,
        src,
        srcset,
      }),
    ),
    chapters,
  };
}
export async function pageData(id: string, publicOnly = false): Promise<Row[]> {
  const [pages, assets] = await Promise.all([
    list("chapter_pages", { chapter_id: id }, "position", 2000),
    list(
      "assets",
      { chapter_id: id },
      undefined,
      2000,
      publicOnly ? "id,width,height" : "*",
    ),
  ]);
  const map = new Map(assets.map((a) => [a.id, a]));
  return pages.map((p) => ({
    ...p,
    ...map.get(p.asset_id),
    id: p.id,
    asset_id: p.asset_id,
    src: assetUrl(p.asset_id),
    srcset: [
      ...new Set(
        [640, 960, 1280, Number(map.get(p.asset_id)?.width || 1280)].map((w) =>
          Math.min(w, Number(map.get(p.asset_id)?.width || w)),
        ),
      ),
    ]
      .map((w) => `${assetUrl(p.asset_id)}&width=${w} ${w}w`)
      .join(", "),
  }));
}
