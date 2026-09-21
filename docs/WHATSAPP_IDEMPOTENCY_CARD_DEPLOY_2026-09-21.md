# WhatsApp idempotency and transactional card deploy

## Production deploy

Schedule the database steps for a low-traffic window. Trigger replacement briefly requires an exclusive lock on `announcements`.

1. Disable the WhatsApp Central in the admin panel.
2. Confirm the queue worker cron is not processing jobs.
3. Apply `sql/fix_whatsapp_gateway_idempotency_card_2026-09-21.sql`.
4. Run `sql/VALIDATE_fix_whatsapp_gateway_idempotency_card_2026-09-21.sql` and require every result to be `true`.
5. Run `sql/VALIDATE_fix_whatsapp_gateway_idempotency_card_transactional_2026-09-21.sql` and require a successful rollback with no exception.
6. Deploy `sync-whatsapp-gateway-jobs` and `whatsapp-gateway-admin`.
7. With the Central still disabled, run one controlled text test through the administrative test action.
8. Re-enable the WhatsApp Central.
9. Create one lead with internal test accounts and allow one queue execution to validate the transactional card. Disable the Central again immediately if this test fails.
10. Monitor the first production queue executions.

The database migration must be applied before the new worker. The Central must remain disabled through step 7.
Do not reapply the stage 3 installation script to an existing database; use only the dated correction migration above.

Legacy retries keep `idempotency_key = job.id`. If a previous attempt used the old domain, the canonical payload can receive HTTP 409 because the same key now has different content. This is the safe outcome: the worker moves that job to `dead_letter` and no duplicate message is sent.

## Rollback

Run rollback steps in a low-traffic window for the same locking reason.

1. Disable the WhatsApp Central and stop queue processing.
2. Redeploy the worker version from before this change.
3. Apply `sql/ROLLBACK_fix_whatsapp_gateway_idempotency_card_2026-09-21.sql`.
4. Validate the previous text-only flow.
5. Re-enable the WhatsApp Central.

The SQL rollback removes `idempotency_key` and `event_cycle`, so it must never run while the new worker is active.
