
-- Add fallback_service_id to booking_configuration
ALTER TABLE public.booking_configuration
ADD COLUMN IF NOT EXISTS fallback_service_id uuid NULL
REFERENCES public.scheduling_services(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.booking_configuration.fallback_service_id IS 'Service used when AI cannot resolve a requested service. Must belong to same empresa.';
