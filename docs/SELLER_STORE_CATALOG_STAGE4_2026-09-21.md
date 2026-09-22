# Seller Store PDF Catalog - Stage 4

## Scope

This stage exposes the private catalog pipeline inside `Minha Loja`.

- Premium catalog builder embedded in the existing seller-store dashboard.
- Selection of one to one hundred active announcements in storefront order.
- Custom title, optional subtitle, and show, consult, or hide price policies.
- Asynchronous request through the owner-bound database RPC.
- Automatic five-second polling only while an export is queued or processing.
- Private history for the twelve most recent exports.
- Ready, queued, processing, failed, cancelled, and locally expired states.
- Queued-export cancellation through the owner-bound RPC.
- Owner-bound download through the Stage 3 Edge Function and a fifteen-minute signed URL.
- Friendly client messages without exposing database or storage details.

## Security boundaries

The browser never inserts or updates `seller_store_catalog_exports` directly.
Creation and cancellation use the Stage 1 security-definer RPCs. History uses
an owner-bound security-definer RPC with a safe projection. Download uses the
authenticated Edge Function, and the client rejects any returned URL that is
not HTTPS on the configured Supabase host. The private bucket has no browser
policy of its own.

The UI eligibility state improves feedback only. The database remains the source
of truth for subscription, store, announcement, concurrency, and daily limits.

## User flow

1. Open `Minha Conta > Minha Loja`.
2. Save and activate the Loja Parceira profile.
3. Choose catalog title, subtitle, price policy, and active announcements.
4. Request generation and continue using the platform while status updates.
5. Download the ready PDF from the private history before its retention expires.
6. Cancel only while a request is still queued.

## Validation

- Run all seller-store catalog tests, including `sellerStoreCatalogStage4.test.ts`.
- Run the full test suite and production build.
- Validate desktop and mobile layouts with an active store and several ads.
- In a controlled environment, verify create, polling, cancel, ready, download,
  expired, failed, plan-disabled, and no-announcement states.

## Deployment boundary

This stage does not deploy the migrations, Edge Function, Vercel worker, or UI.
Keep the catalog cron disabled until the controlled rollout stage is complete.
