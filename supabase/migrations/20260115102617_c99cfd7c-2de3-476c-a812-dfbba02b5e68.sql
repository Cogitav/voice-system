-- Add new columns for improved agent training structure
ALTER TABLE public.agentes 
ADD COLUMN IF NOT EXISTS descricao_funcao text,
ADD COLUMN IF NOT EXISTS contexto_negocio text;

-- Add comments for documentation
COMMENT ON COLUMN public.agentes.descricao_funcao IS 'Short role description - who is this agent and their main responsibility';
COMMENT ON COLUMN public.agentes.contexto_negocio IS 'Business context and domain knowledge the agent should know';
COMMENT ON COLUMN public.agentes.prompt_base IS 'Core behavior instructions - how the agent should behave (system prompt)';
COMMENT ON COLUMN public.agentes.regras IS 'Rules and constraints - what the agent must never do';