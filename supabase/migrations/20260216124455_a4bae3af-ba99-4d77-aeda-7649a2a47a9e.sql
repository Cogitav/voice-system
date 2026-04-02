
-- Add color and capacity columns to scheduling_resources
ALTER TABLE public.scheduling_resources
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_scheduling_resources_empresa_status
  ON public.scheduling_resources(empresa_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduling_resources_priority
  ON public.scheduling_resources(priority);
