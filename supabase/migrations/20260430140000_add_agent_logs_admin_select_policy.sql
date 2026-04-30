-- Phase 0 — Conversation Debug Dashboard
-- Adds an admin-only SELECT policy on public.agent_logs.
--
-- Context:
--   public.agent_logs already has RLS enabled (see 20260425143000_create_agent_logs.sql)
--   but ships with no policies, which means anon and authenticated roles cannot
--   read it. Edge Functions continue to write via service_role and are unaffected.
--
-- This migration only grants SELECT to admins. INSERT/UPDATE/DELETE are intentionally
-- left implicit-deny so production writes stay funneled through service_role.

-- Idempotency guard: `create policy` is not natively replay-safe in Postgres,
-- so we drop the policy first if it already exists. service_role bypasses RLS
-- in either case, so dropping does not interrupt edge-function writes.
drop policy if exists "Admins can read agent logs" on public.agent_logs;

create policy "Admins can read agent logs"
  on public.agent_logs
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
