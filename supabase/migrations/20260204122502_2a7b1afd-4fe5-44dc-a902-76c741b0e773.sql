-- Add AI configuration fields to empresas table
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS chat_ai_provider text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS chat_ai_model text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS chat_ai_real_enabled boolean NOT NULL DEFAULT false;

-- Add comment explaining the fields
COMMENT ON COLUMN public.empresas.chat_ai_provider IS 'AI provider: lovable (uses Lovable AI gateway)';
COMMENT ON COLUMN public.empresas.chat_ai_model IS 'Model to use for chat AI (e.g., google/gemini-2.5-flash, openai/gpt-5-mini)';
COMMENT ON COLUMN public.empresas.chat_ai_real_enabled IS 'If true, uses real LLM; if false, uses mock AI fallback';