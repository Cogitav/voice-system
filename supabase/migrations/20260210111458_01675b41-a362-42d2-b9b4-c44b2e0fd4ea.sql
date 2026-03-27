
-- Add execution tracking columns to agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS execution_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS scheduling_state TEXT NOT NULL DEFAULT 'requested'
    CHECK (scheduling_state IN ('requested', 'confirmed', 'cancelled', 'failed')),
  ADD COLUMN IF NOT EXISTS external_execution_state TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (external_execution_state IN ('not_attempted', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS resource_id UUID,
  ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credits_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index on execution_id for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_agendamentos_execution_id ON public.agendamentos(execution_id) WHERE execution_id IS NOT NULL;

-- Index on scheduling_state for filtering
CREATE INDEX IF NOT EXISTS idx_agendamentos_scheduling_state ON public.agendamentos(scheduling_state);

-- Add execution_id to agent_action_logs for traceability
ALTER TABLE public.agent_action_logs
  ADD COLUMN IF NOT EXISTS execution_id TEXT;

-- Trigger to update updated_at on agendamentos
CREATE TRIGGER update_agendamentos_updated_at
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
