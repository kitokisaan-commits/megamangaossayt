import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
export type Row = Record<string, any>;
export const production = process.env.DATA_ADAPTER === "supabase";
export const dataDir =
  process.env.DATA_DIR || path.join(process.cwd(), ".data");
const tables = [
  "admin_users",
  "sessions",
  "titles",
  "title_alt_names",
  "genres",
  "title_genres",
  "title_editors",
  "chapters",
  "assets",
  "chapter_pages",
  "upload_jobs",
  "upload_items",
  "audit_logs",
  "site_settings",
  "login_attempts",
  "view_events",
  "rate_limits",
];
let local: DatabaseSync | undefined;
export async function sqlite() {
  if (!local) {
    if (process.env.VERCEL)
      throw new Error("Configure Supabase before deploying");
    const { DatabaseSync } = await import("node:sqlite");
    mkdirSync(dataDir, { recursive: true });
    local = new DatabaseSync(path.join(dataDir, "inkora.sqlite"));
    local.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  return local;
}
export function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Supabase is not configured");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
function ident(s: string) {
  if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid identifier");
  return s;
}
function table(s: string) {
  if (!tables.includes(s)) throw new Error("Invalid table");
  return s;
}
export async function list(
  t: string,
  where: Row = {},
  order?: string,
  limit = 1000,
  columns = "*",
): Promise<Row[]> {
  table(t);
  const selection =
    columns === "*" ? "*" : columns.split(",").map(ident).join(",");
  if (production) {
    const results: Row[] = [];
    let offset = 0;
    const size = 500;
    while (limit < 0 || offset < limit) {
      const count = limit < 0 ? size : Math.min(size, limit - offset);
      let q = supabase().from(t).select(selection);
      for (const [k, v] of Object.entries(where))
        q = v === null ? q.is(ident(k), null) : q.eq(ident(k), v);
      if (order) {
        const [k, dir] = order.split(" ");
        q = q.order(ident(k), { ascending: dir !== "desc" });
      }
      q = q.order("id", { ascending: true });
      const { data, error } = await q.range(offset, offset + count - 1);
      if (error) throw error;
      results.push(...(data || []));
      if (!data || data.length < count) break;
      offset += count;
    }
    return results;
  }
  const entries = Object.entries(where),
    clause = entries
      .map(([k, v]) => `${ident(k)} ${v === null ? "IS NULL" : "= ?"}`)
      .join(" AND ");
  const ord = order ? order.split(" ") : null;
  return (
    (await sqlite())
      .prepare(
        `SELECT ${selection} FROM ${t}${clause ? " WHERE " + clause : ""}${ord ? " ORDER BY " + ident(ord[0]) + (ord[1] === "desc" ? " DESC" : " ASC") : ""} LIMIT ?`,
      )
      .all(
        ...entries.filter(([, v]) => v !== null).map(([, v]) => v),
        limit,
      ) as Row[]
  ).map((row) => ({ ...row }));
}
export async function one(t: string, w: Row) {
  return (await list(t, w, undefined, 1))[0] || null;
}
export async function insert(t: string, data: Row) {
  table(t);
  if (production) {
    const { error } = await supabase().from(t).insert(data);
    if (error) throw error;
  } else {
    const keys = Object.keys(data).map(ident);
    (await sqlite())
      .prepare(
        `INSERT INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      )
      .run(...Object.values(data));
  }
  return data;
}
export async function update(t: string, id: string, data: Row) {
  table(t);
  if (production) {
    const { error } = await supabase().from(t).update(data).eq("id", id);
    if (error) throw error;
  } else {
    const keys = Object.keys(data).map(ident);
    (await sqlite())
      .prepare(
        `UPDATE ${t} SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`,
      )
      .run(...Object.values(data), id);
  }
}
export async function remove(t: string, id: string) {
  table(t);
  if (production) {
    const { error } = await supabase().from(t).delete().eq("id", id);
    if (error) throw error;
  } else (await sqlite()).prepare(`DELETE FROM ${t} WHERE id=?`).run(id);
}
export async function deleteSessions(userId: string) {
  if (production) {
    const { error } = await supabase()
      .from("sessions")
      .delete()
      .eq("user_id", userId);
    if (error) throw error;
  } else
    (await sqlite())
      .prepare("DELETE FROM sessions WHERE user_id=?")
      .run(userId);
}
export async function migrateLocal() {
  if (production) throw new Error("Apply the PostgreSQL migration in Supabase");
  const db = await sqlite();
  db.exec(
    readFileSync(path.join(process.cwd(), "migrations/001.sqlite.sql"), "utf8"),
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const name of readdirSync(path.join(process.cwd(), "migrations"))
    .filter((f) => f.endsWith(".sqlite.sql") && f !== "001.sqlite.sql")
    .sort()) {
    if (db.prepare("SELECT name FROM schema_migrations WHERE name=?").get(name))
      continue;
    db.exec("BEGIN");
    try {
      db.exec(
        readFileSync(path.join(process.cwd(), "migrations", name), "utf8"),
      );
      db.prepare(
        "INSERT INTO schema_migrations(name,applied_at) VALUES (?,?)",
      ).run(name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export async function compareUpdate(
  t: string,
  id: string,
  expected: Row,
  patch: Row,
): Promise<boolean> {
  table(t);
  if (production) {
    let q = supabase().from(t).update(patch).eq("id", id);
    for (const [k, v] of Object.entries(expected)) q = q.eq(k, v);
    const { data, error } = await q.select("id");
    if (error) throw error;
    return !!data?.length;
  }
  const pairs = Object.entries(expected);
  const result = (await sqlite())
    .prepare(
      `UPDATE ${t} SET ${Object.keys(patch)
        .map((k) => ident(k) + "=?")
        .join(
          ",",
        )} WHERE id=? AND ${pairs.map(([k]) => ident(k) + "=?").join(" AND ")}`,
    )
    .run(...Object.values(patch), id, ...pairs.map(([, v]) => v));
  return Number(result.changes) > 0;
}

export async function listIn(
  t: string,
  column: string,
  ids: string[],
  columns = "*",
): Promise<Row[]> {
  table(t);
  ident(column);
  const selection =
    columns === "*" ? "*" : columns.split(",").map(ident).join(",");
  if (!ids.length) return [];
  const result: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const group = ids.slice(i, i + 200);
    if (production) {
      for (let start = 0; ; start += 500) {
        const { data, error } = await supabase()
          .from(t)
          .select(selection)
          .in(column, group)
          .order("id")
          .range(start, start + 499);
        if (error) throw error;
        result.push(...(data || []));
        if (!data || data.length < 500) break;
      }
    } else
      result.push(
        ...(
          (await sqlite())
            .prepare(
              `SELECT ${selection} FROM ${t} WHERE ${column} IN (${group.map(() => "?").join(",")})`,
            )
            .all(...group) as Row[]
        ).map((row) => ({ ...row })),
      );
  }
  return result;
}

/** These compound mutations commit together; RPC is callable only by the server service role. */
export async function reorderPages(chapterId: string, ids: string[]) {
  if (production) {
    const { error } = await supabase().rpc("inkora_reorder_pages", {
      target: chapterId,
      page_ids: ids,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db
      .prepare("SELECT id FROM chapter_pages WHERE chapter_id=?")
      .all(chapterId) as Row[];
    if (
      rows.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !rows.some((r) => r.id === id))
    )
      throw new Error("Sahifalar ro‘yxati o‘zgargan. Yangilang.");
    const statement = db.prepare(
      "UPDATE chapter_pages SET position=? WHERE id=? AND chapter_id=?",
    );
    ids.forEach((id, i) => statement.run(i, id, chapterId));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function bulkChapters(
  titleId: string,
  ids: string[],
  action: string,
  actor: string,
) {
  const timestamp = now();
  if (production) {
    const { error } = await supabase().rpc("inkora_bulk_chapters", {
      target: titleId,
      chapter_ids: ids,
      operation: action,
      actor_id: actor,
      timestamp_value: timestamp,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const id of ids) {
      const c = db
        .prepare(
          "SELECT id FROM chapters WHERE id=? AND title_id=? AND deleted_at IS NULL",
        )
        .get(id, titleId);
      if (!c) throw new Error("Boblar ro‘yxati o‘zgargan.");
      if (
        action === "publish" &&
        !db
          .prepare("SELECT id FROM chapter_pages WHERE chapter_id=? LIMIT 1")
          .get(id)
      )
        throw new Error("Bo‘sh bobni nashr qilib bo‘lmaydi.");
    }
    const statement = db.prepare(
      "UPDATE chapters SET status=?, publish_at=NULL, deleted_at=?, updated_by=?, updated_at=? WHERE id=?",
    );
    for (const id of ids)
      statement.run(
        action === "publish" ? "Published" : "Draft",
        action === "archive" ? timestamp : null,
        actor,
        timestamp,
        id,
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export async function chapterSummaries(ids: string[]): Promise<Row[]> {
  const results: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const group = ids.slice(offset, offset + 200);
    if (production) {
      const { data, error } = await supabase().rpc("inkora_chapter_summaries", {
        title_ids: group,
        stamp: now(),
      });
      if (error) throw error;
      results.push(...(data || []));
    } else {
      const rows = (await sqlite())
        .prepare(
          `WITH ranked AS (
        SELECT id,title_id,number,name,sort_order,status,published_at,publish_at,updated_at,page_count,
          COUNT(*) OVER(PARTITION BY title_id) AS chapter_count,
          MAX(coalesce(published_at,publish_at,updated_at)) OVER(PARTITION BY title_id) AS latest_chapter_at,
          ROW_NUMBER() OVER(PARTITION BY title_id ORDER BY coalesce(published_at,publish_at,updated_at) DESC,sort_order DESC,number DESC) AS rank
        FROM chapters WHERE title_id IN (${group.map(() => "?").join(",")}) AND status='Published' AND deleted_at IS NULL
          AND (publish_at IS NULL OR julianday(publish_at) <= julianday(?))
        ) SELECT * FROM ranked WHERE rank <= 2 ORDER BY title_id,rank`,
        )
        .all(...group, now()) as Row[];
      const summaries = new Map<string, Row>();
      for (const {
        chapter_count,
        latest_chapter_at,
        rank: _rank,
        ...c
      } of rows) {
        const summary = summaries.get(c.title_id) || {
          title_id: c.title_id,
          chapter_count,
          latest_chapter_at,
          chapters: [],
        };
        summary.chapters.push(c);
        summaries.set(c.title_id, summary);
        void _rank;
      }
      results.push(...summaries.values());
    }
  }
  return results;
}
