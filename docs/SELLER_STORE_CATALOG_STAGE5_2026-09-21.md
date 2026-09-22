# Seller Store PDF Catalog - Stage 5

## Scope

This stage hardens the catalog pipeline for controlled production validation.

- Runtime configuration is disabled by default and restricted to administrators.
- Every cron call receives a persisted run id, duration, status, summary, and safe error code.
- Three consecutive top-level failures pause processing by default through a circuit breaker configurable from two to ten failures.
- Runs left open for more than ten minutes are marked failed on the next invocation.
- An explicit worker runtime budget releases claimed jobs that have not started yet.
- Retries preserve the same export id, snapshot, worker transition contract, and deterministic storage path.
- Expired private PDFs are removed in one bounded storage operation.
- Orphaned private PDFs are reconciled in a separate bounded operation without touching in-flight deterministic paths.
- JPEG, PNG, and WebP downloads require both an allowed MIME type and matching file signature.
- End-to-end worker tests cover expiry cleanup, claim, render, upload, completion, retry, and safe release.
- Completed worker-run history older than ninety days is retained only up to a bounded operational window.

## Operational RPCs

Administrators can use:

- `get_seller_store_catalog_health_admin()` for runtime state, queue depth, recent results, and the oldest queued request.
- `update_seller_store_catalog_runtime_admin(enabled, batch_size, failure_threshold)` to enable, pause, or recover processing.
- `list_seller_store_catalog_worker_runs_admin(limit)` for recent cron execution diagnostics.

Direct table access remains unavailable to browser roles. Worker lifecycle RPCs are restricted to `service_role`; admin RPCs still verify `public.is_admin()` internally.

## Apply and validate

1. Apply the Stage 1 and Stage 3 migrations first.
2. Apply `sql/create_seller_store_catalog_observability_stage5_2026-09-21.sql`.
3. Run the Stage 5 static validator and require every boolean to be `true`.
4. Run the transactional validator and require a clean rollback.
5. Deploy application code while leaving `processing_enabled=false`.
6. Confirm the cron endpoint returns `skipped=true` with a persisted run id.
7. Continue with the controlled activation procedure in Stage 6.

## Failure policy

Job-level rendering and storage failures continue through the existing same-job retry policy. Top-level failures that prevent normal batch execution increment the runtime circuit breaker. Re-enabling processing through the admin RPC resets the consecutive failure count and clears the pause reason.
Jobs released before processing because the remaining runtime budget is too
short do not count as failed work. An ambiguous completion response preserves
the uploaded object; the database state and later orphan reconciliation decide
whether that deterministic path remains referenced or is removed.

## Rollback

Disable the cron before rollback. The Stage 5 rollback refuses to delete non-empty worker history. Preserve or export that history, remove it through a controlled operation, and only then apply `sql/ROLLBACK_create_seller_store_catalog_observability_stage5_2026-09-21.sql`.
