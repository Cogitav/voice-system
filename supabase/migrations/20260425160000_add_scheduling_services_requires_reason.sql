ALTER TABLE public.scheduling_services
ADD COLUMN IF NOT EXISTS requires_reason BOOLEAN NULL;

COMMENT ON COLUMN public.scheduling_services.requires_reason IS
'NULL = inherit from booking_configuration.require_reason; TRUE = force reason for this service; FALSE = do not require reason for this service.';
