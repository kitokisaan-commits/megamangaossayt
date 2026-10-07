# Architecture

## Application boundaries

`app/` contains real Next.js App Router pages and a Node route dispatcher. Public catalogue/title/reader data is loaded server-side. The catalogue filter/search UI, local history and reader preferences hydrate on the client. `components/inkora/admin.tsx` is a separate admin route chunk; normal readers do not download CMS code. The admin shell is client-rendered, but every data read and mutation independently authenticates and authorizes on the server.

`server/db.ts` provides relational row operations over Supabase PostgREST or native SQLite. Queries use prepared parameters/validated table and column identifiers locally. Production reads paginate through PostgREST's response cap. Title relationship queries are batched by title IDs instead of one query per card. `migrations/001.*.sql` are alternative initial schemas, not sequential migrations. Apply the one matching the adapter. Future changes should be separate migrations; do not rewrite an applied production migration.

The current catalogue loads up to 5,000 published titles for client filtering. That explicit first-release bound should be replaced with fully server-paginated filtering/search before operating a much larger catalogue. Chapter storage has no imposed chapter-count ceiling; chapter lists paginate 50 entries visually. Page metadata is capped at the configured per-chapter image limit (maximum 2,000), and image bytes are loaded on demand. Public metadata is deliberately not shared-cache persisted across publication changes; HTTP assets have a short cache lifetime.

## Relational entities

- `admin_users`: role, active status, Auth user reference (production) or scrypt hash (local), first-login password flag.
- `sessions`: SHA-256 digests of opaque random session tokens and expiry.
- `titles`, `title_alt_names`, `genres`, `title_genres`: metadata and normalized catalogue relationships.
- `title_editors`: explicit editor-to-title assignments.
- `chapters`: decimal numbers, independent ordering, lifecycle and scheduled publication.
- `chapter_pages`, `assets`: page ordering, dimensions, media keys, original/delivery/thumbnail metadata.
- `upload_jobs`, `upload_items`: received byte counts, ordered work, completion and per-job leases.
- `audit_logs`: append-only privileged action history through application routes.
- `site_settings`: operational limits and displayed name/description.
- `login_attempts`, `rate_limits`, `view_events`: login/credential throttling and daily anonymous visit deduplication.

There is no giant JSON document standing in for the database. Only reader preferences and anonymous reading history are device-local. Admin form edits remain in React state until an authorized server save, with leave warnings; no admin drafts or credentials use browser storage. A future account-synced history adapter can replace `readLocal/writeLocal` for history without changing chapter IDs or the public content model. No public account, comment or notification controls are exposed.

## Import lifecycle

1. Authorized user creates a job linked to a title/chapter.
2. The browser sends sequential 2 MiB chunks; the server verifies declared and actual byte sizes, writes private objects, and records the next expected chunk.
3. Preparation inspects magic bytes. ZIP validates names, entries, image counts, decompression size and compression ratios. PDF is parsed by PDF.js; images are decoded by Sharp.
4. Each process request handles one staged image or one PDF page. The UI shows completed pages separately from uploaded bytes. A compare-and-update database lease prevents duplicate concurrent work on the same job. Asset/page IDs derive from the item ID so a retried step can reuse completed work.
5. Originals are retained; delivery only changes for lossless byte savings, orientation or requested rotation. Covers have their own reduced-size renditions.
6. On completion, staging objects are removed, while job records remain for diagnostics. Source PDFs are retained as private masters while their imported pages remain. If an import is interrupted during processing, the admin can resume it. Interrupted byte transfer needs cancellation/reselection in this release.
7. Publishing verifies that a chapter has at least one page. Public access additionally requires a live, published parent title and a due publish timestamp.

The browser orchestrates bounded requests; there is no always-running worker service. Processing pauses when the tab closes and resumes via the stored job. ZIP preparation stages one validated entry at a time in private storage. The compressed input is bounded and buffered server-side, so configured limits must fit the hosting memory allocation. The per-job lease expires after 310 seconds if the function dies; a later retry can reclaim it.

## Reader delivery

Public page HTML includes dimensions before images arrive. Vertical mode observes a rolling neighborhood (1,800px margin) and only attaches nearby image URLs. Current content receives high priority; far pages retain dimensioned placeholders. Paged mode displays one page and prefetches the next two. Requests never wait for all chapter image bytes before rendering the first page.

Assets use UUID-versioned URLs. Local bytes use a short public cache; private preview/original responses use `no-store`. Production redirects to 60-second signed private Storage URLs. This prevents draft uploads becoming permanent public objects. A previously issued public signed URL/cache may remain usable for at most its short lifetime after unpublishing; see security notes. The API gate must not be configured as an indefinitely cached CDN redirect.

## Archive and retention

Archiving a series or chapter is reversible at the database level: it sets `deleted_at`, removes public visibility and preserves relationally referenced assets. It intentionally retains storage and does not claim to permanently erase content. The archive UI restores titles/chapters as Draft; restoration never republishes automatically. Permanent title/chapter purge is deliberately not exposed. Do not permanently delete relational rows without deleting referenced objects through the storage adapter first.

Deleting/replacing a page uses the application path that removes old object keys and asset records after detaching references. Failed uploads remain linked to their job and can be cancelled in the editor. Back up database and private objects together. For high-volume operations, add a scheduled retention/garbage-collection job with an explicitly selected retention period; no background purge is silently enabled.

## Not implemented as first-release features

Public accounts, favourites, comments, push notifications, double-page spreads, automated native Telegram identity sign-in, a permanently running import worker, and cross-tab byte upload resumption. These are not presented as working buttons. Bulk chapter publish/draft/archive actions are implemented with confirmation. Duplication is not presented as a feature.

## Part 1 reader changes

Local row adapters return plain objects for React Server Component serialization. Public chapter pages expose only IDs, positions, dimensions and delivery URLs. New pages receive lossless responsive WebP renditions at 640/960/1280px without upscaling. A tracked migration flags prepared assets; older assets can be backfilled with `pnpm images:prepare`. Supabase requests can redirect directly to signed CDN URLs once renditions exist, without downloading each rendition through the application.

The reader keeps placeholder dimensions for all pages but mounts only a bounded window of images and preloads two following pages. Page jumps and history restore use immediate positioning to avoid saving an intermediate page. Restore suppresses visibility updates until positioned. Catalogue filtering uses native URL history updates supported by Next.js, avoiding overlapping server navigation races.

The Node proxy checks series/chapter availability before streaming and returns a branded HTTP 404 for unavailable records. Authenticated draft preview checks role, assignment and password-change state. Production page data is still independently authorized.

`preview:export` is a build-only adapter from the same public routes/components and local seed; it excludes the CMS, API routes, credentials, private assets and auth data. `.work-export` is ignored build staging, not a second repository. The static Work review surface and full Next.js deployment share one source history.

## Part 2 compound writes and cleanup

`server/mutations.ts` and `server/db.ts` use synchronous SQLite transactions locally and service-role-only PostgreSQL RPCs in production. Migrations 004/005 add atomic title metadata/relations, editor assignments, page replacement/deletion/reordering and bulk chapter operations. Failed metadata saves preserve the previous relations. Deletion rechecks the last published page within the transaction. Rotation uses optimistic asset/rotation matching and deletes its new unused asset if another edit won.

`server/maintenance.ts` removes only unreferenced stale assets and abandoned imports after 24 hours, rechecks references, respects active processing leases and acquires a lease before cancelling an import. It retains archive references and completed pages. Cleanup is an explicit superadmin operation with confirmation and audit. Filesystem and Supabase storage deletes share a batched adapter interface.

Import processing runs in bounded requests. Upload chunk leases last 310 seconds, and processing rechecks the configured page cap. Independent imports into the same chapter still require editorial coordination; this is not a collaborative editing product. Global search is permission-scoped and returns at most 20 matches.

## Part 3 reader and query finalization

Public home/catalogue request indexed chapter summaries using a SQLite window query or the service-only PostgreSQL `inkora_chapter_summaries` RPC (migration 008). Each title sends at most two chapter summaries plus its true count/latest publication. Full title/reader lists remain complete and numerically ordered with explicit editorial sort overrides. Alt names and genres use maps after batched queries; CMS list/search loads editor assignments once and chapters in batches. Chapter SEO uses `chapterRecord`, not page data; `titleRecord`/`chapterRecord` use request-scoped React cache. No shared publication cache survives draft/hidden changes.

Reader placeholders retain every page's dimensions, while image elements occupy the current visible range, two preceding pages and three following pages. Two images following the visible range receive responsive preloads. A single passive listener and animation-frame binary search replace two observers per page; the same geometry determines visible high-priority images. Short pages can make more images visible at once; the fixed seven-image test bound applies to the long-page fixture, not an artificial limit on visible artwork. Page jump/resume ignores intermediate events and uses a header-aware scroll margin. Images display as blocks to eliminate baseline layout shifts. Intrinsic-width srcset candidates avoid limiting high-density displays to 1280px. Paged mode mounts one image.

Migration 006 supplies publication timestamps (ordinary metadata edits do not renew NEW badges), title/chapter counters and short-lived hashed deduplication events. Cookie identity is anonymous, HttpOnly and expires in one day. Events are purged on subsequent qualified visits after their three-day deduplication window; totals remain. PostgreSQL insert triggers and SQLite transactions increment without lost updates. Migration 007 atomically limits sensitive account and password mutations; its keys are hashes of server-authenticated identities/actions. Neither mechanism uses browser LocalStorage.

`lib/telegram.ts` is a presentation-only, optional typed SDK adapter. The independent client bridge handles theme, safe area, stable viewport and public launch routes; it does not process Telegram identity for auth. Normal browsing does not download the SDK. Private previews retain the existing authorization and noindex rules. Storage remains replaceable at the existing adapter boundary.
