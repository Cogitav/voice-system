-- Schedule the close-idle-conversations Edge Function to run every hour.
--
-- Cadence:
--   `0 * * * *`  — top of every hour (UTC).
--   The Edge Function itself decides which conversations are idle (>24h)
--   based on `last_message_at`; this schedule simply gives it a heartbeat.
--
-- Idempotency:
--   * The Edge Function is idempotent — already-closed conversations are a
--     no-op on re-invocation. Safe to call at any cadence.
--   * This migration is also idempotent — it removes any prior schedule
--     with the same name before installing a fresh one. Replay-safe.
--
-- Prerequisites (must be configured outside this migration):
--   1. Extensions `pg_cron` and `pg_net` are enabled in the Supabase
--      Dashboard (Database > Extensions). Cannot be done via plain
--      migration as enabling extensions requires superuser privileges.
--   2. The Vault secret `edge_functions_service_role` is populated with
--      the project's service-role JWT, e.g. (one-time, in SQL Editor):
--          select vault.create_secret(
--            '<SERVICE_ROLE_JWT>',
--            'edge_functions_service_role'
--          );
--      The secret value is NEVER stored in this migration file.
--
-- Reverse:
--   select cron.unschedule('close-idle-conversations-hourly');

-- Step 1 — drop any existing schedule with the same name. cron.unschedule
-- returns false (not error) for missing jobs, but we wrap in a DO block
-- with an exception handler to stay defensive against edge cases (e.g.
-- pg_cron not yet loaded, permission anomalies on replay).
do $$
begin
  perform cron.unschedule('close-idle-conversations-hourly');
exception
  when others then
    -- No prior schedule, or unschedule unavailable. Safe to continue.
    null;
end
$$;

-- Step 2 — install the hourly schedule.
-- The Authorization header is composed at run-time by reading the vault
-- secret. The secret value never crosses the file system boundary nor
-- enters the migration history.
select cron.schedule(
  'close-idle-conversations-hourly',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := 'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/close-idle-conversations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'edge_functions_service_role'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
