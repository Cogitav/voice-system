
ALTER TABLE public.scheduling_services
ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

-- Ensure only one fallback per empresa via unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_fallback_per_empresa
ON public.scheduling_services (empresa_id)
WHERE is_fallback = true;
