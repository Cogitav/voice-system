-- Add service access flags to empresas table
-- These control which operational capabilities are enabled per company
-- Safe-by-default: all services start disabled for new companies

ALTER TABLE public.empresas
ADD COLUMN service_chat_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN service_voice_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN service_scheduling_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN service_email_enabled boolean NOT NULL DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN public.empresas.service_chat_enabled IS 'Enables website chat widget, inbox messaging, human handoff, and internal AI assistant';
COMMENT ON COLUMN public.empresas.service_voice_enabled IS 'Enables phone call handling, AI voice agents, call transcription and summaries';
COMMENT ON COLUMN public.empresas.service_scheduling_enabled IS 'Enables appointment creation, calendar sync, and scheduling features';
COMMENT ON COLUMN public.empresas.service_email_enabled IS 'Enables follow-up emails, system notifications, and email alerts';