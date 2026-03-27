-- Add is_default_chat_agent and welcome_message to agentes table
ALTER TABLE public.agentes 
ADD COLUMN IF NOT EXISTS is_default_chat_agent boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS welcome_message text;

-- Add default_welcome_message to empresas table
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS default_welcome_message text;

-- Create a trigger to ensure only one default chat agent per empresa
CREATE OR REPLACE FUNCTION public.ensure_single_default_chat_agent()
RETURNS TRIGGER AS $$
BEGIN
  -- If we're setting this agent as the default, unset all others for this empresa
  IF NEW.is_default_chat_agent = true THEN
    UPDATE public.agentes 
    SET is_default_chat_agent = false 
    WHERE empresa_id = NEW.empresa_id 
      AND id != NEW.id 
      AND is_default_chat_agent = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger (drop first if exists to allow re-running)
DROP TRIGGER IF EXISTS ensure_single_default_chat_agent_trigger ON public.agentes;

CREATE TRIGGER ensure_single_default_chat_agent_trigger
BEFORE INSERT OR UPDATE ON public.agentes
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_chat_agent();

-- Add index for faster lookups of default agent
CREATE INDEX IF NOT EXISTS idx_agentes_default_chat ON public.agentes(empresa_id, is_default_chat_agent) WHERE is_default_chat_agent = true;