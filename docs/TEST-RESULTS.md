# Part 1 test results

Date: 2026-10-07. Node 24.19.0, Next.js 16.3.4, React 19.2.6, TypeScript 5.9.3, Linux. Same INKORA source repository throughout.

## Executed successfully

| Check                                                    | Result                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| TypeScript (`pnpm typecheck`)                            | Passed                                                                       |
| Application lint (`pnpm lint`)                           | Passed                                                                       |
| Production Next.js build (`pnpm build`)                  | Passed: homepage, catalogue, series, reader, admin, API and Node proxy       |
| Backend/PostgreSQL suite (`pnpm test`)                   | 45 passed, 0 failed                                                          |
| Next.js desktop/mobile suite (`pnpm test:browser`)       | 14 passed, 0 failed                                                          |
| Public Work export build (`pnpm preview:export`)         | Passed: 3 series, 9 chapters, 27 original sample pages                       |
| Public-export desktop/mobile suite (`pnpm test:preview`) | 2 passed, 0 failed                                                           |
| Client secret-marker scan                                | 0 bootstrap credential, service-key, password-hash or session-cookie markers |

The browser runner uses the bundled Chromium executable through Playwright. Desktop and Pixel 7 viewport tests run against the real production Next.js server. The Work export uses these same public components; its separate tests navigate the generated static routes and check for browser errors and failed requests. Tests do not navigate a deployed private Work URL.

## Browser coverage

Homepage → catalogue → title → reader → Continue Reading. Author and alternative-title search, header search, shareable type/status/genre/year queries, alphabetical sort, filter reset and out-of-range catalogue pages. Numeric chapter ordering `[1,1.5,2]`, previous/next chapter, selector, first/last boundaries, paged mode, original width, dark/light preferences, ArrowLeft/ArrowRight, Escape, exact page resume, recent history and clearing. Failed images show a working retry control. Missing series return HTTP 404 and a usable error page. Main desktop/mobile layouts have no horizontal overflow; saved homepage/catalogue/title screenshots were visually reviewed.

A temporary 100-page webtoon fixture validates a maximum of seven mounted page images during distant jumps, page-count consistency, and restoring page 80. Fixtures are removed after the test. Preload requests are limited to the next two pages, and far images have no source in the DOM.

## PostgreSQL/RLS and backend coverage

Five policy/schema checks execute the real `001`, `002` and `003` PostgreSQL migrations using PGlite. Test fixtures provide Supabase-compatible `auth.users`, `auth.uid()`, anon/authenticated/service roles and `storage.buckets`. Anonymous users see published titles and due chapters only; assigned editors see their own draft; admins can read private records; must-change accounts lose private access. Direct client mutations and admin/session/audit reads are denied. Page ownership, title constraints and page-count triggers are enforced.

The remaining 40 checks use isolated real SQLite/filesystem state and the production API dispatcher. Coverage includes HttpOnly sessions, initial password change, session invalidation, role restrictions, editor assignment, disabled accounts, CSRF, validation, decimals, publication/scheduling, private assets, source preservation, responsive rendition dimensions, React-safe row serialization, image/ZIP/PDF processing and persistent upload jobs. Negative cases intentionally include corrupt files and duplicate slugs; expected diagnostic logs accompany passing assertions.

## Bugs fixed during Part 1 acceptance

SQLite returned rows with null prototypes, causing React Server Component failures. These now become plain objects. Rapid filter updates could resurrect old URL parameters; catalogue changes now update URL state atomically. Images failing before hydration now show the retry UI. Long-distance smooth scrolling could overwrite saved reader progress; explicit page jumps/restoration are immediate, and restoration suppresses observers until positioned. Streaming missing-title pages could return HTTP 200; the server proxy rejects unavailable/private records with an actual HTTP 404 before rendering. Static catalogue query hydration was corrected by allowing the client-only search-parameter boundary.

## Production integration still pending

Live Supabase Auth, Storage, signed CDN URLs and hosted RLS were not tested: no project credentials were supplied. The embedded PostgreSQL policy suite is not a live Supabase integration test. Vercel deployment, representative-device LCP/CDN measurements, maximum-size import load tests, and native Android/iOS Telegram behavior remain deployment acceptance checks.

The Work link is a private **public-reader development export** with safe seed content. It does not claim to be the live Supabase CMS deployment. Production Next.js server code, secure bootstrap, migrations and storage adapter are preserved in the same source repository for the next parts.

# Part 2 test results

Date: 2026-10-07. Continued the same repository and preserved the Part 1 public implementation. **90 automated tests pass**, with typecheck, lint and production build also passing.

| Check                                                 | Result                                 |
| ----------------------------------------------------- | -------------------------------------- |
| TypeScript                                            | Passed                                 |
| Application lint                                      | Passed                                 |
| Production Next.js build                              | Passed, including admin/API/Node proxy |
| API, image/ZIP/PDF, SQLite and PostgreSQL suite       | 70 passed, 0 failed                    |
| CMS desktop/mobile real-server suite                  | 4 multistep workflows passed, 0 failed |
| Part 1 public desktop/mobile regressions              | 14 passed, 0 failed                    |
| Same-source public Work export and browser suite      | Build passed; 2 tests passed, 0 failed |
| Client bootstrap/service-key/hash/session marker scan | Zero matches                           |

## CMS browser acceptance

Both desktop and Pixel 7 execute actual superadmin login with the requested initial password, forced password change and re-login; full title metadata/SEO creation; cover and banner upload; decimal chapter creation; naturally sorted multiple images and ZIP; PDF pages; rotate/reorder/replace/remove; invalid image handling; reload persistence; authenticated title and chapter draft preview; public 404 before publishing and 200 after publishing; bulk draft change; chapter/title archive and recovery; global search and server-persisted values. A separate real-server database is created for this suite; development accounts and content are untouched. New browser contexts validate private preview and anonymous visibility.

Both layouts also create an editor, rotate its password, verify privileged API denial, disable the account and verify session revocation, enable/change role/reset password, verify forced reset rotation, delete the account, edit/reload settings and inspect actual audit records. Mobile chapter editor and desktop/mobile audit screenshots were visually checked. Unsaved title navigation is declined successfully; admin form data never uses LocalStorage.

## Additional backend and PostgreSQL coverage

Migrations 001–005 run in embedded PostgreSQL. RLS and RPC grants deny anonymous/authenticated privileged calls; atomic metadata saves roll back old relations on slug conflict, bulk publish rejects all changes when any selected chapter is empty, and transactional deletion protects the final published page. Local API tests cover editor schedule/featured/visibility restrictions, restore-as-Draft, permission-scoped search, four-digit decimal precision, manual order, cover size variants/obsolete-object cleanup, exact efficient JPG/PNG/WebP/AVIF bytes, decoded-pixel equality for useful lossless optimization, master retention through four rotations, upload lease overlap, ZIP traversal/bomb/metadata limits, configurable processing page caps, source PDF retention, archived-upload denial, admin reset/role/delete audit, stale orphan cleanup and abandoned chunk removal.

## Fixes found in Part 2

The previous upload lease lasted only two milliseconds; it now lasts 310 seconds. Editors could reschedule an already-published chapter and alter featured placement; both are now denied. Admin drafts used LocalStorage; they now remain in memory with leave warnings. Private preview metadata incorrectly called `notFound` for valid authorized drafts; metadata and pages now authorize consistently, with noindex/private caching. Mobile navigation could leave the sidebar blocking a dirty form; close/backdrop/Escape controls resolve it. Rotations previously replaced the original master; they now rotate from the retained source. Replaced covers no longer leave obsolete objects. Compound metadata/page/bulk writes are transactional. ZIP expansion stages one image at a time and bounds ignored-entry metadata too.

## Unexecuted deployment checks

Live Supabase Auth, Storage, hosted RLS and signed CDN integration remain untested because no project credentials were supplied. Embedded PostgreSQL is not live Supabase. The Work link remains a private public-reader development export, not a hosted CMS. The CMS runs and is tested on the actual Next.js server inside Work; Vercel/Node plus Supabase configuration are required to publish it. Maximum-size imports under the chosen Vercel memory/time plan, live CDN measurements and native Telegram device checks remain deployment gates.

# Part 3 final test results

Date: 2026-10-07. Same repository, original design, reader and CMS retained. **114 automated checks passed**, plus typecheck, lint and the production build. Final application checks are recorded below; the public Work export is verified separately from a full Next server.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Application lint | Passed |
| Production Next.js build | Passed; public/admin/API/proxy routes |
| Backend/SQLite, image/ZIP/PDF, PostgreSQL and Telegram contracts | 84 passed |
| Public/reader/Telegram/performance desktop + mobile | 24 passed |
| Complete CMS desktop + mobile | 4 multistep workflows passed |
| Same-source Work export | Build passed: 3 series, 9 chapters; 2 browser cases passed |
| Client secret markers | No bootstrap username/password, service-key, password-hash or session-cookie marker |

Backend coverage includes real process-restart persistence: a second Node process reopens saved title/chapter rows and original image objects. Efficient originals retain exact bytes; useful lossless conversion retains decoded pixels; covers have independent sizes; rotations keep masters; PDF order/aspect/source retention and secure ZIP natural sorting/bounds remain passing. PostgreSQL executes actual migrations 001–008 with RLS and browser RPC restrictions, atomic counters, rate limits and summary queries. No live Supabase project was available.

Public tests cover the full browsing/history/filter/reader flows, error retries, paged/vertical modes, previous/next, page 80 resume, keyboard, focus/Escape, normal-browser independence from Telegram, Android/iOS SDK shapes, dynamic themes, safe areas/stable height, Mini App fullscreen and public launch routes. The SDK shapes are simulated in Chromium; native Telegram/WebKit device acceptance remains unexecuted. Reader/admin desktop/mobile screenshots were visually inspected.

## Observed bounded transfer and bundle

The 100-page fixture uses 100 **different asset IDs**, so downloading all pages cannot be masked by repeated identical URLs. Desktop initially requested **3** distinct page images; mobile requested **5**. After jumping directly to page 80, totals were **8 desktop / 11 mobile**. Paged mode mounted one image. Both checks limited preloads to at most three (the implementation requests two) and mounted at most seven images for this long-page fixture. Far pages were not fetched. Short pages can make more artwork visible simultaneously and receive priority accordingly.

Both reader runs loaded 9 JS files, **508,212 decoded bytes** / **154,401 bytes estimated with gzip** including the Next/React runtime. This is an observation from the local production build, not a network-speed or physical-device LCP guarantee. Scripts contained no CMS/account controls, native PDF/ZIP library or privileged-secret markers. Admin remains a separate route. Catalogue/home return two recent chapter records plus accurate counts, with complete lists on the series/reader route.

## Defects found and corrected

A baseline long-chapter test landed on page 79 after selecting page 80. Stale per-page IntersectionObserver callbacks could overwrite an explicit jump. One animation-frame scroll listener with binary search, restore suppression, block-level images and header-aware scroll margins fixes the race and avoids hundreds of observers. Native-width srcset candidates remove the previous 1280px ceiling on high-density readers.

Preview export transformations were made robust to multiline imports and the new lightweight metadata helpers. Original image extensions now match delivery MIME; native-width images reuse existing delivery objects. A preview assertion matched transient homepage headings while navigation was pending; the check now waits for the title's unique level-one heading. These failures were corrected before publication. Backward jumps also reset the visible range immediately, preventing an old page-80 range from eagerly mounting pages 1–80. A transfer regression now checks jumps in both directions. Session revocation uses one unbounded DELETE instead of a capped query loop; a 1,005-session regression confirms complete revocation.

## Deployment checks still required

Live Supabase Auth/Storage/signed URL/hosted RLS, physical Telegram Android/iOS devices, production CDN/LCP and maximum-import loads under the selected Vercel plan require credentials/devices and remain explicit deployment acceptance. The Work publication remains the public reader; it is not a fake hosted CMS. Full CMS implementation runs against a real Next server and uses the production Supabase adapter when configured.
