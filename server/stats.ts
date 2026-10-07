import { createHash, randomUUID } from "node:crypto";
import { production, supabase, sqlite, now } from "./db";
import { isPublicTitle, isPublicChapter } from "./content";
/** No IP, Telegram identity, user agent or reader history is collected. */
export function viewer(req: Request) {
  const existing = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)inkora_viewer=([a-f0-9-]{36})(?:;|$)/i)?.[1];
  const id = existing || randomUUID();
  return {
    id,
    cookie: existing
      ? undefined
      : `inkora_viewer=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}
export async function recordView(
  titleId: string,
  chapterId: string | null,
  viewerId: string,
) {
  const day = now().slice(0, 10);
  const digest = (value: string) =>
    createHash("sha256")
      .update(viewerId + ":" + value + ":" + day)
      .digest("hex");
  const titleEvent = digest("title:" + titleId),
    chapterEvent = chapterId ? digest("chapter:" + chapterId) : null;
  if (production) {
    const { error } = await supabase().rpc("inkora_record_view", {
      target: titleId,
      chapter: chapterId,
      title_event: titleEvent,
      chapter_event: chapterEvent,
      stamp: day,
    });
    if (error) throw error;
    return;
  }
  const db = await sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const t = db.prepare("SELECT * FROM titles WHERE id=?").get(titleId);
    const c = chapterId
      ? db
          .prepare("SELECT * FROM chapters WHERE id=? AND title_id=?")
          .get(chapterId, titleId)
      : null;
    if (
      isPublicTitle(t ?? null) &&
      (!chapterId || isPublicChapter(c ?? null))
    ) {
      const insert = db.prepare(
        "INSERT INTO view_events(id,title_id,chapter_id,day) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
      );
      insert.run(titleEvent, titleId, null, day);
      if (chapterId) insert.run(chapterEvent, titleId, chapterId, day);
    }
    db.prepare("DELETE FROM view_events WHERE day < ?").run(
      new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
