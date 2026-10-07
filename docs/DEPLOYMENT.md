# Deployment and release runbook

## Local usable application

Use Node 22.13+ (24 recommended) and pnpm 11.25.0. Install with `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, then run `pnpm bootstrap` for an empty database or `pnpm seed` for safe development examples. Run `pnpm dev`; visit `/admin`. The initial dieheartman/dieheartman account must change its password before content operations. Bootstrap never resets an existing account. Keep `.data/` across restarts and back it up together with its private objects.

Use the README editorial workflow to create admins, assign editors, create a draft title, upload cover/banner, create decimal chapters, import images/ZIP/PDF, reorder/rotate/replace pages, preview privately, then publish both title and chapters. Draft/private content stays unavailable to anonymous readers.

## Supabase

Create a project and apply each unapplied `migrations/001.supabase.sql` through `008.supabase.sql` in numeric order. The SQLite alternatives are not production migrations. Use a private `inkora-private` bucket (created by 001) and disable public Auth signups. Set the server values from `.env.example`: DATA_ADAPTER=supabase, exact HTTPS APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET and a stable AUTH_EMAIL_DOMAIN. Keep secrets out of NEXT_PUBLIC variables.

From a trusted terminal using that production environment, run `pnpm bootstrap`, sign in, change the initial password and remove BOOTSTRAP_PASSWORD from the runtime environment. Never seed development artwork into production unless you explicitly intend to. Verify all new RPCs are present and browser execution is denied; partial migration deployment must be completed before serving this version.

Run `tests/supabase-rls.sql` in a separate staging project. Complete a real Auth login/password change, assigned-editor permission check, original/variant upload, private draft request denial, signed image request, public publish/unpublish and archive/restore cycle. Embedded PostgreSQL tests do not replace this live acceptance step.

## Vercel

Import this same source repo with the Next.js preset. Install with `pnpm install --frozen-lockfile`; build with `pnpm build`. Configure Node >=22.13, the Supabase server variables and exact APP_URL for each deployment origin. Do not enable static export for the full CMS, use an Edge-only runtime, or deploy the local SQLite adapter.

Sharp and native canvas are server-external dependencies. The Node API requests maxDuration=300, subject to the hosting plan. Choose memory/time limits and import caps together, then load-test the largest allowed ZIP/PDF on that plan. Browser chunks are 2 MiB; archives and one extracted image are bounded server buffers. Each PDF page is processed separately. Processing resumes on reopening; interrupted byte transfer requires reselecting the file.

Backfill existing responsive renditions with `pnpm images:prepare` if importing older data. Configure a network/WAF limiter around auth/public view writes and upload endpoints. Back up PostgreSQL and the private object bucket as a pair, monitor server errors, and choose an explicit archive retention policy. Existing archived content is retained; no automatic hard purge is enabled.

## Validation commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:browser` and `pnpm test:admin`. Browser public tests require a local development seed; admin tests use an isolated database and do not reset your account. `pnpm preview:export` plus `pnpm test:preview` verify the public Work export from the same reader components.

## Work preview boundary

https://inkora-reader.freefire459w.chatgpt.site hosts the usable public-reader development export from this repository. It does not provide fake auth/uploads/publishing. The full Next server/CMS is implemented and tested inside Work, and needs the Supabase/Vercel deployment above for hosted editorial use. Live deployment credentials and physical Telegram devices were not provided during development.
