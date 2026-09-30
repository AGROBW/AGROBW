# Seller Store Insights - Stage 6

## Scope

This stage closes Seller Store Insights with a controlled, observable and
reversible production rollout. The corrected Stage 1 migration adds the private
retention execution ledger; the Stage 6 SQL validator itself is read-only and no
raw analytics data is exposed.

The release includes:

- private and deduplicated browser events;
- service-only catalog generation and download events;
- catalog PDF QR attribution;
- owner-only aggregation for 7, 30 and 90 days;
- the lazy-loaded `Desempenho` tab for eligible Seller Store accounts;
- a final readiness and live-data integrity check.

## Deployment order

1. Keep the application deployment unchanged while applying the Stage 1 and
   Stage 3 migrations, in that order.
2. Run both structural validators. Run the transactional validators in a safe
   maintenance window and require a successful `ROLLBACK`.
3. Deploy `purge-seller-store-insights` with `verify_jwt=false`, configure the
   server-only `SELLER_STORE_INSIGHTS_CRON_SECRET`, and schedule exactly one
   daily `POST` with that value in `x-cron-secret`. Run it once. Never expose the
   service-role key or cron secret in a browser variable.
4. Run `VALIDATE_seller_store_insights_rollout_stage6_2026-09-29.sql`. Every
   boolean column, including `pronto_para_operar`, must be `true`. Numeric
   counters may be zero before traffic.
5. Deploy the web application, catalog worker endpoint and
   `seller-store-catalog-download` Edge Function from the same commit.
6. Open `Minha Loja > Desempenho` with an active Seller Store account. Validate
   the 7, 30 and 90-day filters, empty state and previous-period comparison.
7. From a non-owner session, visit the storefront, open one announcement and
   perform one commercial action. Refresh the panel and confirm the aggregates.
8. Generate one catalog, download it and open one product through its QR Code.
   Confirm the generated, downloaded and QR metrics without exposing a storage
   URL or raw session.
9. Execute the final validator again and preserve its output as release evidence.

## Acceptance evidence

Record without secrets, visitor identifiers or signed URLs:

- deployment commit and timestamp;
- outputs from Stage 1, Stage 3 and Stage 6 validators;
- confirmation that an ineligible account cannot read the dashboard;
- confirmation that browser roles cannot read the raw event table;
- one storefront visit, product open and commercial action reflected in totals;
- one catalog generated, one download and one QR open reflected in totals;
- confirmation that the owner activity is ignored;
- confirmation that the retention job is server-side and scheduled once.
- latest retention execution timestamp and deleted-row count.

## Stop conditions

Roll back the application release immediately if any of these occur:

- raw events or session hashes become readable by browser roles;
- an ineligible or non-owner account receives aggregate insights;
- the dashboard exposes contact data, raw referrers or signed storage URLs;
- catalog generation or download fails because analytics recording failed;
- QR attribution is accepted for an announcement outside the referenced catalog;
- metrics grow repeatedly from a single action inside the deduplication window;
- frontend errors affect the existing `Minha Loja` tabs.

## Rollback

1. Roll back the application and Edge Function to the previous release.
2. Keep the private event ledger intact while investigating so evidence is not
   lost. The old application does not depend on it.
3. Disable the retention scheduler only if the feature is being fully removed.
4. Do not drop tables or functions during an incident response. Database removal
   requires a separately reviewed destructive rollback and preservation of the
   required analytics retention evidence.

Stage 6 is the final implementation stage. After it, only production execution,
controlled smoke testing, observation and the requested independent review remain.
