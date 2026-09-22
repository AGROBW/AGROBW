# Seller Store PDF Catalog - Stage 6

## Scope

This stage closes the feature with a controlled and reversible production rollout.

- The admin integrations page exposes queue health, recent worker runs, circuit-breaker state, and safe runtime controls.
- Activation requires an explicit accompanied-rollout confirmation.
- Batch size and failure threshold can only be changed while processing is paused.
- Pausing stops new claims without deleting queued requests or ready PDFs.
- The browser continues to use admin-only RPCs and receives no service-role credential or storage path.
- The final SQL validator combines structural readiness with live operational metrics.

## Required environment

Configure these server-side variables without exposing their values in the browser:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CATALOG_EXPORT_CRON_SECRET`

The external scheduler must send:

- Method: `POST`
- URL: `https://agrobw.com.br/api/catalog/process-jobs`
- Header: `x-cron-secret: <CATALOG_EXPORT_CRON_SECRET>`
- Header: `content-type: application/json`
- Body: `{"limit":1}`
- Initial interval: every five minutes
- Timeout: at least 290 seconds
- Only one scheduler entry may target this endpoint.

Do not place the service-role key or cron secret in `VITE_*` variables.

## Deployment order

1. Keep the runtime disabled and the scheduler disabled.
2. Apply the Stage 1, Stage 3, and Stage 5 migrations in that order.
3. Run every static and transactional validator from Stages 1, 3, and 5.
4. Run `VALIDATE_seller_store_catalog_rollout_stage6_2026-09-22.sql`; require all readiness booleans to be `true`.
5. Deploy the web application, catalog endpoint, and `seller-store-catalog-download` Edge Function.
   Confirm the Vercel build contains the four `@sparticuz/chromium` binary archives
   in the catalog function bundle and that the project remains within its direct
   function quota.
6. Confirm the admin catalog operations section loads while processing remains paused.
7. Configure one external scheduler and perform one request while paused. It must return HTTP 200 with `skipped=true` and a persisted `runId`.
8. Confirm that the seller panel reports temporary unavailability and that a direct request returns `CATALOG_EXPORT_RUNTIME_DISABLED` while paused.
9. In the admin panel, keep batch size at one, confirm accompanied activation, and enable processing.
10. Request one catalog from an internal store account, then run the scheduler once and require HTTP 200, `summary.claimed=1`, `summary.ready=1`, and no transition errors.
11. Download the PDF through the user panel and visually verify cover, listing images, prices, QR codes, links, page count, and AGRO BW attribution.
12. Observe at least three scheduler cycles before leaving the scheduler enabled.

## Acceptance evidence

Record without secrets or direct storage URLs:

- activation timestamp;
- catalog export id and run id;
- HTTP status from the controlled scheduler call;
- claimed, ready, retried, failed, released, and transition error counts;
- expired and orphaned object cleanup counts;
- generation duration and final page count;
- confirmation that the signed download belongs to the requesting user;
- confirmation that one request produced one PDF;
- final output from the Stage 6 validator.

## Stop conditions

Pause processing immediately if any of these occur:

- duplicated PDFs for one export request;
- more than one scheduler instance;
- repeated top-level failures;
- jobs left in `processing` for more than ten minutes;
- a growing queue without recent successful runs;
- a signed download accessible to another account;
- private bucket or service-role credentials exposed to the browser.

The circuit breaker pauses automatically at the configured failure threshold, but operators should not wait for it when a security or duplication issue is observed.

## Rollback

1. Pause processing in the admin panel.
2. Disable the external scheduler.
3. Preserve the worker run history and Stage 6 validator output.
4. Leave queued requests intact while investigating; they can resume with the same export id and snapshot.
5. Roll back application code before database objects.
6. Apply the Stage 5, Stage 3, and Stage 1 rollback procedures only if the feature is being fully removed and each rollback precondition is satisfied.

Stage 6 adds no database object, so its immediate rollback is the runtime pause plus application rollback.
