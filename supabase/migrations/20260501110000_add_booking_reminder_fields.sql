-- Booking reminder MVP — schema additions.
--
-- agendamentos:
--   reminder_sent      bool         — set to true after a reminder email succeeds
--   reminder_sent_at   timestamptz  — timestamp of the successful reminder send
--
-- booking_configuration:
--   reminder_enabled        bool — per-empresa opt-in/out (default true)
--   reminder_hours_before   int  — window relative to start_datetime (default 24)
--
-- Idempotency: the send-booking-reminders edge function only flips
-- reminder_sent → true after the email succeeds. A failed send leaves it
-- false so the next manual run retries.

alter table public.agendamentos
  add column if not exists reminder_sent boolean not null default false;

alter table public.agendamentos
  add column if not exists reminder_sent_at timestamptz null;

alter table public.booking_configuration
  add column if not exists reminder_enabled boolean not null default true;

alter table public.booking_configuration
  add column if not exists reminder_hours_before integer not null default 24;

-- Partial index to keep the reminder query fast: only indexes rows that are
-- candidates for reminding (confirmed + not yet sent). Already-sent and
-- cancelled rows do not contribute to the index size.
create index if not exists idx_agendamentos_reminder_pending
  on public.agendamentos (start_datetime)
  where reminder_sent = false
    and scheduling_state = 'confirmed';
