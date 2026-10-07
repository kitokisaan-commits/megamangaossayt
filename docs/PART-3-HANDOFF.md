# Completed INKORA repository

Same persistent checkout: `/workspace/sites/inkora`. Same Site identity: `appgprj_6ac60ae9fad8819184325c17c0addb4f`. Parts 1–3 extend the original public design, reader, admin CMS, data and migration history. Do not scaffold a replacement or reset `.data/` during future work.

## Implemented

Public home/catalogue/query filters/search/series, long and paged readers, history/recent/continue, chapter navigation, NEW badges, progress/copy/top controls, accessible keyboard/focus, safe loading/errors and canonical/OpenGraph metadata. Optional Telegram theme/safe-area/stable viewport/fullscreen API and validated public Mini App deep links; normal browsers remain independent.

Real CMS, secure bootstrap/password rotation/opaque sessions, roles/editor assignments, audit, full metadata and decimal chapters, private previews, drafts/schedules/publishing, archive/restore/bulk actions. Real image/ZIP/PDF imports with transfer versus processing progress, page reorder/remove/replace/rotate, efficient original preservation and useful lossless renditions, cover variants, master retention and stale-orphan cleanup.

Batched queries and indexed database chapter summaries, lightweight metadata reads, request-scoped caching, visible-image priority and two responsive preloads with a bounded image window. Counters are atomic and deduplicate daily refreshes with an expiring anonymous HttpOnly cookie. Credential/account mutation limits are private and atomic. Complete session revocation does not depend on read-query caps.

## Schema and run

Migrations 001–008 have SQLite/Supabase alternatives. Part 3 adds 006 (publication/counters), 007 (credential limits) and 008 (chapter summaries/index). Apply only unapplied migrations. Local bootstrap upgrades without resetting an existing password. Supabase requires trusted bootstrap plus private bucket/Auth setup from README. Keep server secrets out of NEXT_PUBLIC variables.

`pnpm install --frozen-lockfile`, `.env.local` from `.env.example`, `pnpm bootstrap` or development `pnpm seed`, then `pnpm dev`. Requested initial username/password are dieheartman/dieheartman, CLI-only, forced to change before privileged actions. Normal production is `pnpm build` / `pnpm start` with DATA_ADAPTER=supabase on Vercel; never use static export for the CMS.

## Tests and deployment boundary

Final automated checks passed: 84 backend/PostgreSQL/Telegram contract tests, 24 public browser cases, 4 complete CMS desktop/mobile workflows, 2 same-source public-export cases; 114 checks total; see the final test-results document for executed outcomes. Typecheck, lint, real Next production build, image-quality byte/pixel checks, process-restart persistence and client-secret scans are included.

The Work URL `https://inkora-reader.freefire459w.chatgpt.site` is the usable public-reader export. The complete CMS is run/tested on a real Next server inside Work and needs Supabase/Vercel credentials to become a hosted editorial platform. None were provided; embedded PostgreSQL tests are not live Supabase integration. Physical Telegram Android/iOS, production CDN/LCP and maximum import load acceptance remain staging checks. Processing resumes; closed-tab byte-transfer resume, indefinite background workers and collaborative chapter locks are outside this version.

See README, docs/DEPLOYMENT.md, docs/TELEGRAM.md, docs/ARCHITECTURE.md and docs/SECURITY.md. The source is persisted in the same remote repository; the published preview contains no fake admin/auth/upload controls.
