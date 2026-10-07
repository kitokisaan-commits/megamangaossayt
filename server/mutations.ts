import { production, supabase, sqlite, uid, type Row } from "./db";
import { fail } from "./auth";
const fields = [
  "title",
  "slug",
  "description",
  "type",
  "status",
  "year",
  "author",
  "artist",
  "tags",
  "age_label",
  "direction",
  "origin",
  "language",
  "publication_status",
  "featured",
  "visibility",
  "seo_title",
  "seo_description",
] as const;
export async function saveTitle(
  target: string,
  metadata: Row,
  altNames: string[],
  genreNames: string[],
  actor: string,
  createNew: boolean,
  stamp: string,
) {
  const alts = [...new Set(altNames)],
    genres = [...new Set(genreNames)];
  const data = Object.fromEntries(fields.map((k) => [k, metadata[k] ?? null]));
  if (production) {
    const { error } = await supabase().rpc("inkora_save_title", {
      target,
      metadata: data,
      alt_names: alts,
      genre_names: genres,
      actor_id: actor,
      create_new: createNew,
      stamp,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (createNew)
      db.prepare(
        "INSERT INTO titles(id,slug,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      ).run(target, metadata.slug, metadata.title, actor, stamp, stamp);
    db.prepare(
      `UPDATE titles SET ${fields.map((f) => `${f}=?`).join(",")},updated_at=? WHERE id=?`,
    ).run(...fields.map((f) => data[f]), stamp, target);
    db.prepare("DELETE FROM title_alt_names WHERE title_id=?").run(target);
    db.prepare("DELETE FROM title_genres WHERE title_id=?").run(target);
    for (const name of alts)
      db.prepare(
        "INSERT INTO title_alt_names(id,title_id,name) VALUES (?,?,?)",
      ).run(uid(), target, name);
    for (const name of genres) {
      db.prepare(
        "INSERT INTO genres(id,name) VALUES (?,?) ON CONFLICT(name) DO NOTHING",
      ).run(uid(), name);
      const genre = db
        .prepare("SELECT id FROM genres WHERE name=?")
        .get(name) as Row;
      db.prepare(
        "INSERT INTO title_genres(id,title_id,genre_id) VALUES (?,?,?)",
      ).run(uid(), target, genre.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function assignEditors(target: string, ids: string[]) {
  if (production) {
    const { error } = await supabase().rpc("inkora_assign_editors", {
      target,
      editor_ids: ids,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const id of ids)
      if (
        !db
          .prepare(
            "SELECT id FROM admin_users WHERE id=? AND role='EDITOR' AND active=1",
          )
          .get(id)
      )
        fail(400, "Faol editor topilmadi.");
    db.prepare("DELETE FROM title_editors WHERE title_id=?").run(target);
    for (const id of ids)
      db.prepare(
        "INSERT INTO title_editors(id,title_id,user_id) VALUES (?,?,?)",
      ).run(uid(), target, id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function replacePage(
  chapter: string,
  target: string,
  replacement: string,
  expectedAsset: string,
) {
  if (production) {
    const { error } = await supabase().rpc("inkora_replace_page", {
      chapter,
      target,
      replacement,
      expected_asset: expectedAsset,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const p = db
      .prepare("SELECT asset_id FROM chapter_pages WHERE id=? AND chapter_id=?")
      .get(target, chapter) as Row | undefined;
    const r = db
      .prepare("SELECT asset_id FROM chapter_pages WHERE id=? AND chapter_id=?")
      .get(replacement, chapter) as Row | undefined;
    if (!p || !r || target === replacement || p.asset_id !== expectedAsset)
      fail(409, "Sahifalar ro‘yxati o‘zgargan. Yangilang.");
    db.prepare("UPDATE chapter_pages SET asset_id=?,rotation=0 WHERE id=?").run(
      r.asset_id,
      target,
    );
    db.prepare("DELETE FROM chapter_pages WHERE id=?").run(replacement);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function removePage(
  chapter: string,
  target: string,
  expectedAsset: string,
) {
  if (production) {
    const { error } = await supabase().rpc("inkora_remove_page", {
      chapter,
      target,
      expected_asset: expectedAsset,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const p = db
      .prepare("SELECT asset_id FROM chapter_pages WHERE id=? AND chapter_id=?")
      .get(target, chapter) as Row | undefined;
    if (!p || p.asset_id !== expectedAsset)
      fail(409, "Sahifalar ro‘yxati o‘zgargan. Yangilang.");
    const c = db
      .prepare("SELECT status,page_count FROM chapters WHERE id=?")
      .get(chapter) as Row;
    if (c.status === "Published" && c.page_count <= 1)
      fail(400, "Oxirgi sahifani o‘chirishdan oldin bobni draft qiling.");
    db.prepare("DELETE FROM chapter_pages WHERE id=?").run(target);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
