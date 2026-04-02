-- Add response_delay_ms to agentes table (agent-level configuration)
ALTER TABLE public.agentes
ADD COLUMN IF NOT EXISTS response_delay_ms integer;

-- Add default_response_delay_ms to empresas table (empresa-level fallback)
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS default_response_delay_ms integer;

-- Add comments for documentation
COMMENT ON COLUMN public.agentes.response_delay_ms IS 'Artificial delay in milliseconds before showing AI responses. Used to simulate human typing.';
COMMENT ON COLUMN public.empresas.default_response_delay_ms IS 'Default response delay for all agents of this company. Used when agent-level delay is not set.';