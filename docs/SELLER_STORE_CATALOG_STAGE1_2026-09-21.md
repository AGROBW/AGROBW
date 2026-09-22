# Seller Store PDF Catalog - Stage 1

## Scope

This stage creates only the secure foundation. It does not render PDFs and does
not add UI controls yet.

- Private export history and asynchronous queue contract.
- Immutable snapshots of the store and up to 100 active announcements.
- Active Loja Parceira subscription enforcement inside a security-definer RPC.
- No direct e-mail or phone data inside snapshots.
- Private `seller-store-catalogs` bucket, PDF-only, 30 MB maximum.
- No direct browser access to generated files; owner downloads are authorized by the Edge Function.
- Two concurrent exports and twenty requests per rolling 24 hours per owner.
- Per-owner transaction serialization so concurrent requests cannot bypass limits or deduplication.
- Thirty-day default retention metadata.
- Safe cancellation while an export is still queued.

## Apply and validate

1. Apply `sql/create_seller_store_catalog_exports_stage1_2026-09-21.sql`.
2. Run `sql/VALIDATE_create_seller_store_catalog_exports_stage1_2026-09-21.sql`.
3. Require every returned boolean to be `true`.
4. Run `sql/VALIDATE_create_seller_store_catalog_exports_stage1_transactional_2026-09-21.sql`.
5. Require a successful rollback with no exception.

The transactional validator needs at least one active Loja Parceira store with
one active announcement. It creates and cancels an export inside a transaction
that is always rolled back. It also assumes `authenticated` can query
`storage.objects` under the platform's existing policies and verifies that the
catalog migration does not break access to the unrelated `ads-images` bucket.

## Rollback

Use `sql/ROLLBACK_create_seller_store_catalog_exports_stage1_2026-09-21.sql`
before later stages are deployed. The rollback refuses to run when export rows
or generated files exist, preventing accidental data loss.

## Next stages

Stage 2 will add the premium print layout and deterministic document model.
Stage 3 will add the worker, rendering, storage upload, expiration, and signed
downloads. Stage 4 will expose the catalog builder and history in Minha Loja.
Stage 5 will add end-to-end validation, observability, accessibility, and
operational safeguards. Stage 6 will cover controlled production rollout and
monitoring before general availability.
