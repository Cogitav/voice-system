-- Align booking persistence with the multi-resource scheduling model.
-- Multiple bookings may share the same company/time when they use different resources.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_unique_slot;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS unique_slot_per_empresa;

DROP INDEX IF EXISTS public.idx_agendamentos_resource_start_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_resource_start_unique
ON public.agendamentos (resource_id, start_datetime)
WHERE resource_id IS NOT NULL
  AND scheduling_state != 'cancelled';
