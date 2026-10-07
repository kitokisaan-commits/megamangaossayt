# Part 1 continuity

Continue this repository for Parts 2 and 3. Do not scaffold or replace it.

- Checkout: `/workspace/sites/inkora`
- Work Site identity: `appgprj_6ac60ae9fad8819184325c17c0addb4f`
- Work origin: `https://inkora-reader.freefire459w.chatgpt.site`
- Production framework: Next.js App Router, React, TypeScript and Tailwind.
- Production data/auth/storage: Supabase adapters in `server/`; service key stays server-only.
- Work publication: **public-reader development export**, generated from the same components and the three seeded series. This is a private review surface, not the Supabase production deployment. Admin operations run in the normal Next.js server and are tested there. The exported reader has no CMS or fake login controls.

## Preserve and open

Use the existing Site identity in `.openai/hosting.json` to open the source. Its repository stores the complete Next.js source, migrations, original development artwork and tests. The generated public export lives in ignored `out/`; regenerate using `pnpm preview:export`. `.data/` is a private local SQLite/filesystem development adapter, never part of source publication. After a fresh checkout run `pnpm seed` to rebuild safe fixtures, then re-export when updating the Work review surface.

Do not replace the production scripts with a static-only architecture: `pnpm build` and `pnpm start` are actual Next.js production commands. `preview:export` uses an ignored build staging directory, not another repository.

## Supabase connection

Apply the numbered PostgreSQL files in order: `001.supabase.sql`, `002.supabase.sql`, `003.supabase.sql`. On an existing deployment apply only unapplied files. Local SQLite migrations are tracked by the bootstrap command.

Set `DATA_ADAPTER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` and `APP_URL` on the Next.js server. Disable public signup in Supabase Auth. Run the bootstrap from a trusted terminal; it creates username `dieheartman` once with the requested initial password and forces a change before privileged operations. Existing credentials are never reset by seed/bootstrap.

No live Supabase credentials were supplied in Part 1. PostgreSQL policy tests execute the migrations in PGlite with Supabase-compatible Auth and Storage schema fixtures; live Auth/Storage integration is still a deployment acceptance check.

## Reader

Chapter routes use stable IDs. Numeric chapter numbers drive public ordering, including decimals. History and preferences are device-local. Published pages have known dimensions, responsive lossless renditions and CDN-ready URLs. Images are mounted only within the current rolling window; two following pages are preloaded. Original width uses original delivery bytes. The 100-page browser fixture is temporary and is cleaned up after testing.

## Next work

Continue with the user's Part 2 specification on this same source and Site. Connect real Supabase staging credentials before certifying live Supabase Auth, Storage or deployment readiness. Preserve Part 1 public-reader tests as regression coverage.

## Part 1 acceptance

45 backend/PostgreSQL tests and 14 desktop/mobile Next.js browser tests passed. The public-export suite also passed on both viewport profiles. See `TEST-RESULTS.md`. Continue the same repo and Site identity.
