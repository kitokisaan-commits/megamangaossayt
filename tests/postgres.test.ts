import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const editor = "10000000-0000-0000-0000-000000000001";
const admin = "10000000-0000-0000-0000-000000000002";
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT);`);
  await db.exec(await readFile("migrations/001.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/002.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/003.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/004.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/005.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/006.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/007.supabase.sql", "utf8"));
  await db.exec(await readFile("migrations/008.supabase.sql", "utf8"));
  await db.exec(`INSERT INTO auth.users VALUES ('${editor}'),('${admin}');
 INSERT INTO admin_users(id,username,display_name,role,auth_id,must_change,created_at) VALUES ('editor','editor','Editor','EDITOR','${editor}',0,now()::text),('admin','admin','Admin','ADMIN','${admin}',0,now()::text);
 INSERT INTO titles(id,slug,title,visibility,created_at,updated_at) VALUES ('public','public','Published','Published',now()::text,now()::text),('private','private','Draft','Draft',now()::text,now()::text),('hidden','hidden','Hidden','Hidden',now()::text,now()::text);
 INSERT INTO title_editors VALUES ('assignment','private','editor');
 INSERT INTO chapters(id,title_id,number,status,sort_order,publish_at,created_at,updated_at) VALUES
 ('due','public',1,'Published',1,null,now()::text,now()::text),
 ('decimal','public',1.5,'Published',1.5,null,now()::text,now()::text),
 ('future','public',10.1,'Published',10.1,(now()+interval '1 day')::text,now()::text,now()::text),
 ('draft-chapter','public',2,'Draft',2,null,now()::text,now()::text),
 ('private-chapter','private',1,'Published',1,null,now()::text,now()::text);
 INSERT INTO assets(id,title_id,chapter_id,original_key,delivery_key,mime,width,height,bytes,source_bytes,filename,created_at) VALUES ('public-image','public','due','original','delivery','image/webp',1000,1400,20,20,'1.webp',now()::text),('private-image','private','private-chapter','private-original','private-delivery','image/webp',1000,1400,20,20,'1.webp',now()::text);
 INSERT INTO chapter_pages(id,chapter_id,asset_id,position) VALUES ('public-page','due','public-image',0),('private-page','private-chapter','private-image',0);`);
});
after(async () => {
  await db.close();
});
async function asRole<T>(
  role: string,
  identity: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(
    `SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${identity}',false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE;");
  }
}
test("PostgreSQL anonymous RLS exposes published titles and due chapters only", async () => {
  await asRole("anon", "", async () => {
    assert.deepEqual(
      (await db.query("SELECT id FROM titles ORDER BY id")).rows,
      [{ id: "public" }],
    );
    assert.deepEqual(
      (await db.query("SELECT number::text FROM chapters ORDER BY number"))
        .rows,
      [{ number: "1.0000" }, { number: "1.5000" }],
    );
    assert.deepEqual((await db.query("SELECT id FROM chapter_pages")).rows, [
      { id: "public-page" },
    ]);
    assert.deepEqual((await db.query("SELECT id FROM assets")).rows, [
      { id: "public-image" },
    ]);
  });
});
test("PostgreSQL anonymous/authenticated writes and secrets are denied", async () => {
  for (const role of ["anon", "authenticated"])
    await asRole(role, role === "authenticated" ? admin : "", async () => {
      await assert.rejects(
        db.query("SELECT * FROM admin_users"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM sessions"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM audit_logs"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("UPDATE titles SET title='tampered' WHERE id='public'"),
        /permission denied/,
      );
    });
});
test("PostgreSQL assigned editor reads its draft, not other hidden titles", async () => {
  await asRole("authenticated", editor, async () => {
    assert.deepEqual(
      (await db.query("SELECT id FROM titles ORDER BY id")).rows,
      [{ id: "private" }, { id: "public" }],
    );
    assert.equal(
      (await db.query("SELECT id FROM chapter_pages WHERE id='private-page'"))
        .rows.length,
      1,
    );
  });
});
test("PostgreSQL admin reads private records but must-change accounts lose private access", async () => {
  await asRole("authenticated", admin, async () => {
    assert.equal((await db.query("SELECT id FROM titles")).rows.length, 3);
  });
  await db.exec("UPDATE admin_users SET must_change=1 WHERE id='editor'");
  await asRole("authenticated", editor, async () => {
    assert.deepEqual((await db.query("SELECT id FROM titles")).rows, [
      { id: "public" },
    ]);
  });
});
test("PostgreSQL page-count trigger and relational constraints enforce chapter ownership", async () => {
  assert.equal(
    (
      await db.query<{ page_count: number }>(
        "SELECT page_count FROM chapters WHERE id='due'",
      )
    ).rows[0].page_count,
    1,
  );
  await assert.rejects(
    db.exec(
      "INSERT INTO chapter_pages(id,chapter_id,asset_id,position) VALUES ('wrong','due','private-image',1)",
    ),
    /must belong/,
  );
  await assert.rejects(
    db.exec("UPDATE titles SET type='Invalid' WHERE id='public'"),
    /violates check/,
  );
  await db.exec("DELETE FROM chapter_pages WHERE id='public-page'");
  assert.equal(
    (
      await db.query<{ page_count: number }>(
        "SELECT page_count FROM chapters WHERE id='due'",
      )
    ).rows[0].page_count,
    0,
  );
});

test("PostgreSQL CMS RPCs deny anonymous and authenticated roles", async () => {
  for (const role of ["anon", "authenticated"])
    await asRole(role, role === "authenticated" ? admin : "", async () => {
      await assert.rejects(
        db.query("SELECT inkora_reorder_pages('due',ARRAY['public-page'])"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "SELECT inkora_bulk_chapters('public',ARRAY['due'],'publish','admin',now()::text)",
        ),
        /permission denied/,
      );
    });
});
test("PostgreSQL bulk operations validate all chapters before changing any", async () => {
  await db.exec(
    "INSERT INTO chapter_pages(id,chapter_id,asset_id,position) VALUES ('restored-page','due','public-image',0)",
  );
  await db.exec("UPDATE chapters SET status='Draft' WHERE id='due'");
  await assert.rejects(
    db.query(
      "SELECT inkora_bulk_chapters('public',ARRAY['due','draft-chapter'],'publish','admin',now()::text)",
    ),
    /Bo‘sh bob/,
  );
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM chapters WHERE id='due'",
      )
    ).rows[0].status,
    "Draft",
  );
  await db.query(
    "SELECT inkora_bulk_chapters('public',ARRAY['due'],'publish','admin',now()::text)",
  );
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM chapters WHERE id='due'",
      )
    ).rows[0].status,
    "Published",
  );
  await assert.rejects(
    db.query("SELECT inkora_reorder_pages('due',ARRAY['private-page'])"),
    /Sahifalar ro‘yxati/,
  );
});

test("PostgreSQL metadata and relations save together and roll back on conflict", async () => {
  const metadata = {
    title: "Atomic title",
    slug: "public",
    description: "Before",
    type: "Manhwa",
    status: "Ongoing",
    year: 2026,
    author: "Author",
    artist: "Artist",
    tags: "",
    age_label: "All ages",
    direction: "vertical",
    origin: "",
    language: "English",
    publication_status: "Serializing",
    featured: 0,
    visibility: "Published",
    seo_title: "",
    seo_description: "",
  };
  await db.query(
    "SELECT inkora_save_title($1,$2::jsonb,$3::text[],$4::text[],$5,false,$6)",
    [
      "public",
      JSON.stringify(metadata),
      ["Original alt"],
      ["Action"],
      "admin",
      new Date().toISOString(),
    ],
  );
  await assert.rejects(
    db.query(
      "SELECT inkora_save_title($1,$2::jsonb,$3::text[],$4::text[],$5,false,$6)",
      [
        "public",
        JSON.stringify({ ...metadata, slug: "private", description: "After" }),
        ["Lost alt"],
        ["Fantasy"],
        "admin",
        new Date().toISOString(),
      ],
    ),
    /duplicate key/,
  );
  assert.equal(
    (
      await db.query<{ description: string }>(
        "SELECT description FROM titles WHERE id='public'",
      )
    ).rows[0].description,
    "Before",
  );
  assert.deepEqual(
    (await db.query("SELECT name FROM title_alt_names WHERE title_id='public'"))
      .rows,
    [{ name: "Original alt" }],
  );
  await asRole("authenticated", admin, async () => {
    await assert.rejects(
      db.query(
        "SELECT inkora_save_title('public','{}'::jsonb,ARRAY[]::text[],ARRAY[]::text[],'admin',false,now()::text)",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("SELECT inkora_assign_editors('public',ARRAY['editor'])"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "SELECT inkora_replace_page('due','restored-page','private-page','public-image')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "SELECT inkora_remove_page('due','restored-page','public-image')",
      ),
      /permission denied/,
    );
  });
});
test("PostgreSQL protects the last published page inside the deletion transaction", async () => {
  await assert.rejects(
    db.query("SELECT inkora_remove_page('due','restored-page','public-image')"),
    /Oxirgi sahifani/,
  );
  assert.equal(
    (await db.query("SELECT id FROM chapter_pages WHERE id='restored-page'"))
      .rows.length,
    1,
  );
});

test("PostgreSQL counters deduplicate refreshes, reject private chapters and use atomic increments", async () => {
  const call = (
    chapter: string | null,
    event: string,
    chapterEvent: string | null,
  ) =>
    db.query("SELECT inkora_record_view('public',$1,$2,$3,$4)", [
      chapter,
      event,
      chapterEvent,
      new Date().toISOString().slice(0, 10),
    ]);
  await call("due", "viewer-day", "viewer-chapter");
  await call("due", "viewer-day", "viewer-chapter");
  assert.equal(
    (
      await db.query<{ views: number }>(
        "SELECT views FROM titles WHERE id='public'",
      )
    ).rows[0].views,
    1,
  );
  assert.equal(
    (
      await db.query<{ views: number }>(
        "SELECT views FROM chapters WHERE id='due'",
      )
    ).rows[0].views,
    1,
  );
  await call("future", "future-view", "future-chapter");
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*) FROM view_events WHERE id='future-view'",
      )
    ).rows[0].count,
    0,
  );
  for (const role of ["anon", "authenticated"])
    await asRole(role, admin, async () => {
      await assert.rejects(
        db.query("SELECT * FROM view_events"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "SELECT inkora_record_view('public',null,'x',null,'2026-10-07')",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT inkora_rate_limit('x',1,5)"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM rate_limits"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "SELECT * FROM inkora_chapter_summaries(ARRAY['private'],now()::text)",
        ),
        /permission denied/,
      );
    });
});
test("PostgreSQL summaries exclude future/draft chapters and publication dates survive ordinary edits", async () => {
  await db.query("UPDATE chapters SET published_at=$1 WHERE id='due'", [
    new Date(Date.now() - 3600000).toISOString(),
  ]);
  await db.query("UPDATE chapters SET published_at=$1 WHERE id='decimal'", [
    new Date(Date.now() - 7200000).toISOString(),
  ]);
  const rows = (
    await db.query<{ chapter_count: number; chapters: any[] }>(
      "SELECT * FROM inkora_chapter_summaries(ARRAY['public'],now()::text)",
    )
  ).rows;
  assert.equal(rows[0].chapter_count, 2);
  assert.deepEqual(
    rows[0].chapters.map((c) => Number(c.number)),
    [1, 1.5],
  );
  const before = (
    await db.query<{ published_at: string }>(
      "SELECT published_at FROM chapters WHERE id='due'",
    )
  ).rows[0].published_at;
  await db.exec(
    "UPDATE chapters SET name='Updated text',updated_at=(now()+interval '1 hour')::text WHERE id='due'",
  );
  assert.equal(
    (
      await db.query<{ published_at: string }>(
        "SELECT published_at FROM chapters WHERE id='due'",
      )
    ).rows[0].published_at,
    before,
  );
});
test("PostgreSQL sensitive-operation limits are atomic and renew per window", async () => {
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT inkora_rate_limit('test-limit',100,3) AS ok",
        )
      ).rows[0].ok,
      true,
    );
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "SELECT inkora_rate_limit('test-limit',100,3) AS ok",
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "SELECT inkora_rate_limit('test-limit',101,3) AS ok",
      )
    ).rows[0].ok,
    true,
  );
});
