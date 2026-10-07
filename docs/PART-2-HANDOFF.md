# Part 2 continuity

Continue the **same INKORA repository** at `/workspace/sites/inkora`. Keep Site identity `appgprj_6ac60ae9fad8819184325c17c0addb4f` and the existing public design, schema/data and reader. Do not scaffold a replacement. Source is persisted in the same remote Git repository.

## Implemented and verified

- All requested CMS routes use the original admin catch-all. Dashboard counts actual database records; no sample analytics.
- SUPERADMIN account creation, role/status changes, password reset, enable/disable/delete, login dates and audit. Initial bootstrap remains idempotent and forces password rotation. No frontend default password.
- ADMIN content operations; EDITOR editing/upload for assigned titles only, with publication/schedule/featured and administrative changes denied server-side. RLS prevents direct browser privileged writes/RPC calls.
- Complete title/chapter metadata, decimal numbers, independent chapter ordering, cover/banner imports, SEO, draft/published/hidden, scheduling, private draft previews, archive/restore as Draft and confirmed bulk chapter actions.
- Global permission-scoped admin search, unsaved changes and navigation/refresh warnings. LocalStorage is restricted to reader history/preferences.
- JPG/JPEG/PNG/WebP/AVIF, sequential multi-image, ZIP natural order/security bounds, PDF page rendering, separate transfer/processing progress, stored jobs and processing resume. Previews, page reorder, rotate, replace, remove and add pages work.
- Original/master retention, efficient input preservation, useful lossless delivery variants, separate cover sizes, PDF masters, obsolete cover/page cleanup and explicit safe orphan cleanup.
- Atomic metadata/relations, editor assignments, page mutations and bulk actions; audited important operations.

## Database upgrade

Apply only unapplied migrations, in order. Part 2 adds **004 and 005** in both SQLite and Supabase variants. Do not edit applied 001–003. SQLite bootstrap tracks migrations automatically. Existing users, titles, assets and history IDs are preserved.

004 adds privileged transactional page reorder/bulk functions and PDF `master_key`. 005 adds transactional metadata/relations, editor assignment and page replacement/deletion functions. Browser roles cannot execute them. The server requires its Supabase service role after application RBAC checks.

## Run and test

`pnpm bootstrap` upgrades local schema without resetting existing credentials. Keep `.data/` for local data. Normal dev/build/start use actual Next.js. Do not enable static export for the production CMS.

`pnpm test` runs isolated API/image/PDF/ZIP plus embedded PostgreSQL tests. `pnpm build` then `pnpm test:admin` runs full desktop/mobile CMS workflows against a real Next production server and a separate temporary database; it never modifies the development account. `pnpm test:browser` preserves Part 1 public regressions. `pnpm preview:export` and `pnpm test:preview` build/check the same public-reader development surface.

## Work and production status

Work URL: `https://inkora-reader.freefire459w.chatgpt.site`. It remains the usable **public-reader development export**, without a fake CMS login. The complete CMS is implemented and tested in the normal Next.js server inside Work. Hosting this CMS requires a Node deployment such as Vercel and real Supabase configuration; the static Work publication cannot run Sharp/native PDF processing or PostgreSQL/Auth by itself.

No Supabase project credentials or Vercel deployment credentials were provided. Live Supabase Auth/Storage/signed URLs and hosted CMS acceptance remain pending. Do not describe embedded PostgreSQL tests or the static reader publication as live Supabase verification. See README for server-only environment values and bootstrap steps.

## Boundaries for Part 3

Preserve public and admin test suites. Byte-transfer resume after closing a tab is not implemented; processing resume is. No permanently running background importer or collaborative chapter locking. Stage maximum-size imports against the intended Vercel memory/time plan. No public account registration. Future user features retain the Part 1 architecture document. No archive hard purge is exposed.
