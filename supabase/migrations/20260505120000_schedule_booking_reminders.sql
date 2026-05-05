-- Schedule the send-booking-reminders Edge Function to run every 30 minutes.
--
-- Cadence:
--   `*/30 * * * *` - every 30 minutes (UTC).
--   The Edge Function itself is idempotent: it filters reminder_sent = false
--   and only flips reminder_sent after a successful send.
--
-- Prerequisites (must be configured outside this migration):
--   1. Extensions `pg_cron` and `pg_net` are enabled in the Supabase
--      Dashboard (Database > Extensions).
--   2. The Vault secret `edge_functions_service_role` is populated with
--      the project's service-role JWT, e.g. (one-time, in SQL Editor):
--          select vault.create_secret(
--            '<SERVICE_ROLE_JWT>',
--            'edge_functions_service_role'
--          );
--      The secret value is NEVER stored in this migration file.
--
-- Reverse / disable:
--   select cron.unschedule('send-booking-reminders-every-30-minutes');

do $$
begin
  perform cron.unschedule('send-booking-reminders-every-30-minutes');
exception
  when others then
    -- No prior schedule, or unschedule unavailable. Safe to continue.
    null;
end
$$;

select cron.schedule(
  'send-booking-reminders-every-30-minutes',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/send-booking-reminders',
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
    body := jsonb_build_object('dry_run', false)
  ) as request_id;
  $cron$
);
