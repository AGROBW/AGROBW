# Seller Store PDF Catalog - Stage 3

## Scope

This stage turns the private queue into an operational PDF pipeline.

- Atomic `SKIP LOCKED` claim with a two-export batch ceiling.
- Ten-minute worker lease recovery and a maximum of three attempts.
- Exponential retry delays without creating a new export or snapshot.
- Chromium 152 plus Puppeteer 25.10 rendering on Node 22.17 or newer.
- Immutable rendering from the Stage 1 snapshots and Stage 2 document model.
- Trusted-image download, MIME and size validation, deduplication, and inline data URLs.
- Bounded image batches and only the primary image used by the layout, keeping memory and runtime predictable.
- Graceful branded placeholders when an image is unavailable.
- Private upload to `seller-store-catalogs/{user_id}/{export_id}.pdf`.
- Thirty-day expiry, private object cleanup, persisted cleanup state, and bounded orphan-object reconciliation.
- Owner-bound, fifteen-minute signed download URLs.

## Runtime boundaries

`api/catalog/process-jobs.ts` is an internal Vercel function. It accepts only
`POST`, compares `x-cron-secret` in constant time, and processes no more than
two exports. Use a dedicated `CATALOG_EXPORT_CRON_SECRET`; do not reuse a public
or browser-exposed key.

`seller-store-catalog-download` is a Supabase Edge Function called by an
authenticated browser. It validates the JWT, binds the export to that user,
requires `ready` and unexpired state, and returns a private signed URL valid for
fifteen minutes.

The worker never rereads mutable announcements or store rows. A retry uses the
same export id, snapshot, storage path, and request creation timestamp.
Image bodies are streamed with a hard byte ceiling, and Chromium blocks every
network request after the trusted images have been embedded as data URLs.

Orphan reconciliation never removes the deterministic path of an export that is
still `queued` or `processing`, covering the short interval between upload and
the database completion transition.

## Environment

Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CATALOG_EXPORT_CRON_SECRET`
- Optional local-only `CATALOG_CHROME_EXECUTABLE_PATH`

Supabase automatically provides the URL, anon key, and service-role key to the
download function.

## Deploy and validate

1. Apply `sql/create_seller_store_catalog_exports_stage1_2026-09-21.sql` if the
   Stage 1 schema is not present.
2. Apply `sql/create_seller_store_catalog_exports_stage3_2026-09-21.sql`.
3. Run `sql/VALIDATE_create_seller_store_catalog_exports_stage3_2026-09-21.sql`
   and require every returned boolean to be `true`.
4. Confirm the catalog queue is empty, then run the transactional validator and
   require a clean `ROLLBACK`. When Stage 5 is installed, the validator enables
   processing only inside its transaction; the rollback restores the paused
   runtime and leaves no claimed job behind.
5. Deploy the Vercel application with Node 22.17 or newer and all three secrets.
6. Deploy `seller-store-catalog-download` with `verify_jwt=false`; authentication
   is performed inside the function with `auth.getUser`.
7. Configure exactly one external cron to `POST /api/catalog/process-jobs` with
   `x-cron-secret`, JSON body `{ "limit": 1 }`, and a five-minute interval.
8. Queue one controlled export, invoke the cron once, and require `ready`, a
   valid private PDF, the expected page count, and a working signed download.
9. Repeat the same download after logout and require access denial.
10. Keep the cron disabled until the controlled production validation passes.

## Failure behavior

- Invalid snapshots and oversized PDFs fail permanently.
- Browser, network, rendering, and storage failures retry with the same export.
- Unavailable product images use placeholders and do not fail the catalog.
- A stale processing lease returns to the queue unless attempts are exhausted.
- Expired rows stop authorizing downloads before object deletion is attempted.
- Failed object deletion is retried by later cron runs.
- Objects without a matching export are removed in bounded batches; paths for
  in-flight exports remain protected.

## Rollback

Disable the cron first. The Stage 3 rollback refuses to run while any catalog
export exists. Remove exports and private objects through a controlled operation,
then apply `sql/ROLLBACK_create_seller_store_catalog_exports_stage3_2026-09-21.sql`.
The Stage 1 rollback remains separate and must run only afterward.
