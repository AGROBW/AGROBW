# Seller Store Catalog - Visual Stage 2

## Scope

This stage adds a live cover preview and a persisted horizontal alignment choice:

- `left`, `center`, or `right` alignment;
- `center` as the backwards-compatible default;
- the same choice in the browser preview and generated PDF;
- no change to existing catalog eligibility, limits, queue ownership, or download rules.

## Database contract

Apply `sql/add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql` before
deploying the web application and worker.

The migration adds `cover_alignment` to `seller_store_catalog_exports` and exposes
`request_seller_store_catalog_export_v2`. The V2 RPC delegates eligibility, limits,
and deduplication to the original request RPC, then records the visual choice in the
same transaction. Existing requests remain centered. An equivalent queued request
with another alignment returns `CATALOG_EXPORT_ALIGNMENT_CONFLICT` instead of being
changed silently; the user can cancel it before requesting a new version. A request
already processing returns `CATALOG_EXPORT_ALREADY_PROCESSING`.

Run `sql/VALIDATE_add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql`
and require every field to return `true`. Then run the transactional validator
`sql/VALIDATE_add_seller_store_catalog_cover_alignment_stage2_transactional_2026-09-22.sql`;
it must finish with `ROLLBACK` and no exception.

## Deployment order

1. Keep the catalog worker and its external scheduler active; this migration uses a
   non-blocking additive column with a constant default.
2. Apply the Stage 2 migration before merging the application PR. The merge to
   `main` triggers the Vercel deployment, so merging first creates an outage window.
3. Run the Stage 2 validator and verify all fields are `true`.
4. Deploy the web application and catalog worker together.
5. Open Minha Loja and verify that the cover preview reflects title, subtitle, logo,
   cover image, location, and each alignment option.
6. Request one internal catalog with `right` alignment.
7. Require one ready PDF, no retries, no transition errors, and confirm that the PDF
   uses the same alignment shown in the preview.

## Rollback

Pause the external scheduler and catalog processing first. Confirm there are no
queued or processing exports, then redeploy the previous web application and worker
versions. Only after the old code is active, run
`sql/ROLLBACK_add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql`.
