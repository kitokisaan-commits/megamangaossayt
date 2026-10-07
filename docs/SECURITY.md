# Security notes

## Authentication and authorization

Production passwords are managed by Supabase Auth. Local passwords use scrypt with a random salt and constant-time comparison. Authentication returns an opaque, random 256-bit session token in an HttpOnly, SameSite=Lax cookie, Secure on HTTPS. Only a SHA-256 digest is stored in the database. Sessions expire after eight hours. First-login password change is enforced server-side before all privileged APIs; resetting a password, changing role/status, disabling or deleting an account revokes its sessions.

Role values in request payloads are never accepted as the caller's authority. The server reloads the active admin profile for each request. SUPERADMIN manages the team, audit and global settings; ADMIN manages content; EDITOR can access assigned titles and upload/edit chapters but cannot change publication state/schedules/featured placement, manage accounts or archive entire titles/chapters.

Supabase RLS is enabled on every application table. Anonymous access is granted only to published content metadata. Storage is private. Browser clients have no privileged write grants. The trusted server uses its service key only after application authorization. RLS functions have a fixed search path. The production service key is never imported by client components or given a `NEXT_PUBLIC_` name.

The real PostgreSQL migrations and policies pass embedded PostgreSQL (PGlite) tests, including denial of privileged RPC execution to browser roles. Live Supabase Auth/Storage/RLS have not been exercised because no staging credentials were supplied. Validate the dedicated SQL smoke test and live integration against staging before production use.

## Input, upload and request protections

- Same-origin checks on every mutation, including login. `APP_URL` is an exact allowlisted origin.
- Zod validation for metadata, roles, passwords, UUID references and publication timestamps.
- Parameterized SQLite statements and fixed database identifiers.
- Ten login attempts per normalized username within fifteen minutes, stored in the database. Add an IP/WAF limiter at the hosting layer to resist distributed internet-scale abuse; account throttling is not a complete anti-abuse perimeter.
- Actual streamed request byte caps for JSON and file chunks, independent of Content-Length.
- Sharp format/dimension checks and actual pixel decoding. No SVG, HTML or animated payloads are accepted as chapter images.
- Archive path traversal rejection; no untrusted filename is used as a filesystem destination. Object keys are generated IDs.
- Expanded-size, compression-ratio, page-count and image-dimension limits for imports.
- Cookie sessions and all admin data use `Cache-Control: no-store`.
- Safe error responses; public clients never receive a server stack trace. Internal logs remain on the server.
- React escapes metadata text. No user-provided HTML is inserted into the page.
- Self-deletion/role mutation is blocked in team management. Destructive controls request confirmation.

## Operational boundaries

Private signed image URLs are bearer URLs valid for 60 seconds. A previously issued URL may still work briefly after unpublishing, and an image already downloaded cannot be recalled. Original/master URLs require admin authorization. Do not change the private bucket to public or set long-lived caching on the authorization route.

Uploads are resumable at the processing stage. A per-job lease prevents duplicate requests against the same job. Concurrent independent jobs for the same chapter should be avoided by editors during ordering; this release does not offer collaborative locking of an entire chapter or a complete collaborative editor protocol. Page reorder/replacement/deletion and bulk writes themselves are transactional. Treat page ordering as a single-editor operation.

Metadata and relations, editor assignments, page replacement/deletion/reorder and bulk chapters use transactional PostgreSQL RPCs and SQLite transactions. RPC execution is granted only to service_role; anonymous/authenticated clients cannot bypass server authorization through these functions. Database uniqueness prevents duplicate slugs, usernames and chapter numbers.

The Work publication is a public-reader development export. The live Next.js/Supabase CMS deployment is still pending credentials. Do not publish an uninitialized production database. Bootstrap, rotate the initial password, disable public Auth signups, configure backups, and run staging acceptance checks first. Remove bootstrap credentials from the runtime environment after provisioning.

## Part 3 review

- All new RPCs are invoker-only, fixed-search-path functions with execution revoked from PUBLIC/anon/authenticated and granted to service_role only. `rate_limits` has RLS and no browser grants; private view events keep their existing RLS restriction. Migrations 006–008 are covered by embedded PostgreSQL tests.
- Session invalidation removes every session in one database delete, including users exceeding ordinary read-query caps.
- Credential rotation is capped at ten operations and account mutations at thirty operations per authenticated actor in atomic 15-minute windows. Existing login throttling and ten-active-import limits remain. These controls complement, rather than substitute for, a hosting WAF/network limiter.
- Counter submissions recheck public title, chapter ownership, publication/schedule and archive state inside the write transaction. The anonymous cookie contains a random nonce, not identity or credentials. Only daily nonce/resource hashes persist briefly. Counters do not confer authority and can be manipulated by determined clients; they are approximate popularity.
- Public image ETag revalidation runs after publication/authorization, so a matching tag cannot reveal hidden content. Signed URL redirects are private/no-store; underlying signed objects remain valid only briefly. Public metadata/title query results are not stored in a persistent shared cache.
- Telegram `initDataUnsafe`, launch query/hash and API presence are presentation hints only. Deep links allow public title/chapter paths; admin paths, open redirects, query injection and preview flags are rejected. No bot token, Telegram identity trust or client-controlled role escalation is introduced.
- The production reader browser test inspects scripts for CMS/upload/native-processing and privileged key markers. Final source and exported bundle scans check that bootstrap passwords and service credentials remain server-only.

Executed tests provide application and embedded SQL coverage, not a penetration-test certification. Live Supabase integration and physical Telegram Android/iOS acceptance require deployment credentials/devices and remain explicit deployment checks.
