# INKORA

A full-stack Uzbek manga, manhwa and webtoon reader with a server-backed editorial CMS. Next.js App Router, React, TypeScript, Tailwind 4, Sharp, Supabase PostgreSQL/Auth/Storage in production, and a real SQLite/filesystem development adapter.

**Parts 1–3 are implemented in this same repository.** The full Next.js application provides real server-backed authentication, CMS imports, private previews and publishing. Public/admin workflows run against a real production Next server inside Work. The published Work URL remains the public-reader export; deploy the full app to Vercel with Supabase for a hosted CMS. No live Supabase/Vercel credentials were provided. See `docs/TEST-RESULTS.md`, `docs/DEPLOYMENT.md` and `docs/TELEGRAM.md` for executed checks and release boundaries.

## Quick start

Use Node 22.13+ (Node 24 recommended) and pnpm 11.25.0. From the extracted project directory:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm seed
pnpm dev
```

Open http://localhost:3000. On Windows, copy `.env.example` to `.env.local` in Explorer instead of using `cp`. The SQLite database and private uploaded objects are stored in `.data/`; keep this directory when restarting. Nothing authoritative is stored in browser localStorage.

`pnpm seed` creates the local schema, initial account, site settings, three original sample series and nine chapters, each with three clearly labelled development pages. It is idempotent. Generated cover art is original; the pages are deliberately development samples, not licensed manga. Seed content is not required by the application. For an empty installation, run `pnpm bootstrap` instead of `pnpm seed`.

### Initial administrator

- URL: `/admin`
- Username: `dieheartman`
- Initial password: `dieheartman`

The bootstrap script creates this account once. It never resets an existing password. Before any privileged operation, the account must choose a new password of at least 12 characters. Password rotation ends the session; sign in again with the new password. The initial credential is confined to the CLI bootstrap and environment example, never shipped to the browser bundle.

### Normal editorial workflow

1. Open **Asarlar → Yangi asar**. Enter a title, slug and metadata. Save as Draft.
2. Upload a cover and optional banner after creating the title.
3. In **Boblar**, enter a number such as `1`, `1.5` or `10.1` and create the chapter.
4. Upload images, ZIP or PDF. Upload progress and image processing progress are separate.
5. Check the thumbnails. Drag to reorder, or use the up/down controls. Each page can be rotated, replaced or deleted. Replacement accepts one image and preserves its position.
6. Use **Preview** to open the authenticated draft reader.
7. Save the chapter with status **Published**, optionally with a future publish time. Also publish the series. A published chapter in a draft/hidden/archived series stays private.
8. The reader automatically includes scheduled chapters once the publish time is reached; it does not require a cron.

**Administratorlar** is visible to superadmins. Create an ADMIN or EDITOR, set a temporary password, and give it to that person through your own secure channel. New accounts must change the temporary password. Assign editors to individual titles in the title editor. The role/status editor also supports password reset and account disabling. Disabling, resetting a password, changing a role or deleting an account invalidates existing sessions. You cannot delete/demote your own account through this panel.

Title and chapter removal means **archive**: a confirmation explains that the title and its chapters become unavailable publicly. Database references and originals remain for recovery. Open **Arxiv → Tiklash** to restore content as Draft, then review before publishing. Deleting an individual page removes its files and metadata. Superadmins can explicitly clean unreferenced objects and abandoned imports older than 24 hours in Settings. Referenced archive artwork is retained. No automatic purge is performed. See retention details in `docs/ARCHITECTURE.md`.

## Commands

```bash
pnpm dev             # Next development server at localhost:3000
pnpm dev:next        # explicit Next development server
pnpm typecheck
pnpm lint
pnpm test            # isolated SQLite + real image/ZIP/PDF processing tests
pnpm build           # actual production Next.js build
pnpm start           # serves the production build
pnpm test:browser:prepare  # Linux bundled Chromium; use Playwright install on other OS
pnpm test:browser     # public desktop/mobile regression checks; build + development seed required
pnpm test:admin       # isolated real-server CMS acceptance on desktop/mobile
pnpm test:preview     # generated public export acceptance
```

The Work supervisor supplies `--host`; `scripts/dev.mjs` translates it to the Next.js hostname argument. Development and production use the same Next.js framework.

Backend tests create a fresh temporary database and do not mutate the development account or sample content. Browser tests are separate from backend tests. The included Chromium package and `pnpm test:browser:prepare` support this Work environment without downloading a browser from an external CDN.

## Supabase production configuration

1. Create a Supabase project. Apply `migrations/001.supabase.sql`, `002.supabase.sql`, `003.supabase.sql`, `004.supabase.sql`, `005.supabase.sql`, `006.supabase.sql`, `007.supabase.sql` and `008.supabase.sql` in numeric order through the SQL editor or your migration tool. Apply only unapplied migrations on existing databases. It creates normalized tables, indexes, constraints, RLS policies and a private `inkora-private` storage bucket. The SQLite migration is for local development only.
2. In Supabase Auth, disable public signup for this release. Public readers do not register. Admin accounts are created by the trusted bootstrap script or the superadmin UI.
3. Set the server environment values below. Never give the service role key a `NEXT_PUBLIC_` prefix.
4. Run `pnpm bootstrap` against that environment from a trusted local terminal. This creates a Supabase Auth user with a synthetic admin email, its application profile, and initial settings. Do not run the demo seed in production. The seed refuses Supabase mode unless `ALLOW_DEMO_SEED=true` is explicitly provided.
5. Sign in and change the initial password. Remove `BOOTSTRAP_PASSWORD` from the deployment environment afterwards. Keep the Auth email domain stable; usernames are mapped to that domain for sign-in.
6. Run `tests/supabase-rls.sql` in a separate test project, then exercise a real upload and signed download against your bucket. No real Supabase credentials were available during this build, so that integration remains a deployment acceptance gate.

```dotenv
DATA_ADAPTER=supabase
APP_URL=https://your-domain.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
SUPABASE_STORAGE_BUCKET=inkora-private
AUTH_EMAIL_DOMAIN=admins.your-domain.example
BOOTSTRAP_USERNAME=dieheartman
BOOTSTRAP_PASSWORD=dieheartman
MAX_IMAGE_MB=30
MAX_EXTRACTED_MB=300
```

`APP_URL` must exactly match the browser origin, including protocol and port locally. It is used for canonical URLs and same-origin write validation. Configure it separately for each preview deployment. A mismatch deliberately blocks mutations.

## Storage and image delivery

All production blobs live in a **private bucket**. No public bucket is needed. Originals are never exposed anonymously. Asset requests first check title/chapter publication and schedules, then return a short-lived signed Storage URL; Storage/CDN handles the image bytes. Local mode streams from private `.data/objects` after the same access checks.

An efficient input is delivered byte-for-byte unchanged, with its delivery key pointing at the original object to avoid duplicate storage. For large PNG/JPEG inputs, a lossless WebP candidate is kept only if it saves at least 15%. No chapter artwork is upscaled, cropped, stretched or lossily recompressed. EXIF orientation and explicit rotation are applied. Covers have separate 420px and 840px WebP renditions, without upscaling. PDF pages are rendered individually, retaining aspect ratio, up to 1800px wide at a maximum 2.5× PDF-point scale.

Uploads travel in 2 MiB chunks, below common serverless request limits. The browser does not unzip or rasterize a whole PDF. Server-side jobs record received chunks and completed pages. Reopen the chapter editor to resume **processing**. An interrupted upload of incomplete bytes currently requires cancellation and reselecting the file; byte-transfer resume across a closed tab is not implemented. Completed pages remain saved. The interface describes this honestly.

Default limits: 100 MiB per import, 500 pages/chapter, 30 MiB/image, 60 megapixels/image, 300 MiB expanded ZIP, compression ratio up to 250:1. The superadmin can change import/page limits; the image/expanded limits are server environment values. Very large uploads still require sufficient function memory and execution time. ZIP expansion stages each validated image directly to private storage, so the entire expanded archive is not retained in memory. The bounded compressed input and one extracted image are buffered server-side; configured limits must still fit function memory.

The storage interface is `server/storage.ts` (`put/get/delete/deleteMany/signed`). An R2 or S3 implementation can replace it without changing CMS behavior. It is an extension point, not an already-configured R2 deployment.

## Vercel deployment

1. Push this directory to your own Git repository. Exclude `.env*` except `.env.example`, `.data`, `node_modules`, build output and test artifacts.
2. Import into Vercel and select the **Next.js** framework. Use a supported Node version >=22.13 (prefer Node 24 where available), install with `pnpm install --frozen-lockfile`, and build with `pnpm build`.
3. Add the Supabase variables above. Use `DATA_ADAPTER=supabase`; local mode intentionally refuses to open SQLite on Vercel.
4. Provision the migration and private bucket, then bootstrap the account before directing users to the site.
5. Allocate function memory/time suitable for PDF rendering and your configured upload caps. The API requests `maxDuration=300`; the hosting plan may enforce a lower limit. Keep import limits consistent with your plan. No browser request sends more than 2 MiB of file data.
6. Validate the production acceptance checks listed below, then connect your domain and update `APP_URL`.

The app uses Node native Sharp and `@napi-rs/canvas`, declared as server external packages. Confirm native packages are installed for the deployment platform. It is not intended for an Edge-only runtime or a static export.

## Telegram

The HTTPS site and direct `/title/<slug>` or `/read/<chapter-id>` links work in normal browsers without Telegram. Only a Mini App launch or an existing Telegram WebApp object enables the optional SDK adapter. It supports live dark/light themes, device and content safe areas, stable viewport events, native Mini App fullscreen where supported, accessible touch controls and 16px mobile fields to prevent iOS focus zoom. Reader background preferences override automatic theme following after the reader makes a choice.

Configure a bot's Main Mini App/menu URL through BotFather using your deployed HTTPS origin. Optional public variables `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME` enable the reader's “Telegram’da ochish” link. Leave the short name empty for a Main Mini App. There is no bot token in the website.

Start parameters are `title_<slug>` and `chapter_<uuid>`, for example `https://t.me/your_bot?startapp=title_salt-and-steel`. Only validated public relative routes are accepted; launch data never authenticates an admin or enables a draft preview. See `docs/TELEGRAM.md` for configuration and physical Android/iOS acceptance checks. Automated tests exercise both platform API shapes and mobile layouts; actual Telegram devices have not been available.
## Release acceptance gates

- Keep the included desktop/mobile browser suite passing after changes.
- Exercise Supabase Auth, RLS and private Storage with real staging credentials.
- Measure reader LCP/image transfer on representative phones and networks. No universal “one second” loading guarantee is made.
- Load-test the largest configured ZIP/PDF against the selected Vercel memory/time limits.
- Back up PostgreSQL and object storage, select an archive retention policy, and configure monitoring/rate limits at your hosting perimeter for internet scale.
- Remove development sample titles before a public release unless you intentionally want them.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `docs/TEST-RESULTS.md` for implementation details and remaining validation boundaries.

## Work public-reader preview

The private Work review surface is a public-reader export from this same source and development database, not a second project. Run `pnpm preview:export` to regenerate it. It contains the homepage, catalogue, series pages and all nine sample chapters, with working query filters, navigation, reader settings and device-local history. It contains no admin login or server secrets. Use the normal Next.js server for admin/auth operations and Supabase/Vercel production deployment.

`pnpm images:prepare` backfills responsive renditions for existing pages; new imports prepare them automatically. Responsive images use lossless WebP at bounded widths, and original-width reading retains original delivery bytes.

Public reader history uses only `inkora.history`, `inkora.recent` and `inkora.reader` in localStorage. It never stores tokens, administrative records, source files or database content.

## Part 2 CMS additions

All requested admin URLs are handled by the existing catch-all admin route. The top bar searches permitted titles/chapters. The title chapter manager supports confirmed bulk publishing, draft changes and archiving, up to 100 selected chapters. Publishing in bulk clears schedules and publishes immediately; single-chapter saves retain the schedule field. Decimal numbers accept up to four fractional digits, matching PostgreSQL precision. The independent order field controls public reader navigation; numeric chapter order remains the default.

Editors only access assigned titles; they cannot create/archive titles, manage accounts/settings, change visibility, featured placement, chapter publication status or schedules. Staff reads/writes are authorized independently of hidden controls. Admin forms show unsaved changes and warn before leaving; they do not store editorial data in localStorage. Draft previews are private and noindex, including metadata generation.

Metadata and alt-name/genre changes, editor assignments, page replacement/deletion/reordering and bulk chapter changes use atomic database operations. PostgreSQL RPC execution is revoked from anonymous/authenticated browser roles and granted only to the server service role. Apply the new numbered migrations before starting this version against Supabase.

Efficient JPG/PNG/WebP/AVIF originals stay byte-for-byte intact. Useful image optimization is lossless. Rotations retain the original master; PDFs keep their source master while imported pages remain. Cover replacement removes obsolete artwork. Uploads, rotations, password resets, role/state changes, publication, archives/restores and storage cleanup are audited.

## Part 3 performance and privacy

Catalogue/home use indexed database chapter summaries: accurate counts, two recent chapters per series and the latest publication time. Full chapter lists load only for a title or reader. SEO metadata loads the title/chapter record without fetching page assets. Relation reads and editor assignment checks are batched. React cache deduplicates records within a server render; publication-dependent data is not persisted in a shared cache that could expose a withdrawn draft.

The vertical reader uses one passive scroll listener, animation-frame scheduling and binary search over dimensioned placeholders. Only visible pages and a small surrounding window have image elements; two following images receive responsive preloads. Visible images have high fetch priority. Paged mode has one image. Intrinsic-width srcset candidates preserve sharp text on high-density screens; Original width bypasses resized variants. Far images are never fetched on initial chapter load.

Lightweight title/chapter popularity records qualified visible visits after 1.5 seconds. An anonymous HttpOnly, SameSite cookie expires after 24 hours; daily hashed events deduplicate refreshes atomically and expire after a short retention window. No IP address, user agent, Telegram ID or reading history is collected. Counters are useful approximate popularity, not billing-grade anti-fraud analytics. Only history/preferences use LocalStorage. Hosting perimeter limits remain necessary for internet-scale abuse prevention.

`006` adds publication timestamps/counters; `007` adds private atomic limits for credential/account mutations; `008` adds indexed chapter summaries. Apply only unapplied migrations. Existing records and credentials are preserved. Documentation and source remain in the same repository.
