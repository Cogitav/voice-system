
-- Remove the legacy is_fallback column and its unique partial index
DROP INDEX IF EXISTS idx_one_fallback_per_empresa;
ALTER TABLE public.scheduling_services DROP COLUMN IF EXISTS is_fallback;
