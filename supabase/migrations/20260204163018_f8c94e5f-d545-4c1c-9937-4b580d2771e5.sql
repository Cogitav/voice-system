-- Create table for AI providers with API keys (admin only)
CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  last_tested_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.ai_providers IS 'Stores AI provider configurations and API keys. Admin-only access.';
COMMENT ON COLUMN public.ai_providers.provider_key IS 'Unique identifier: openai, google';
COMMENT ON COLUMN public.ai_providers.status IS 'inactive, active, auth_error';

-- Enable RLS
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage ai_providers"
  ON public.ai_providers
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default providers (disabled by default)
INSERT INTO public.ai_providers (provider_key, provider_name, is_enabled, status)
VALUES 
  ('openai', 'OpenAI', false, 'inactive'),
  ('google', 'Google Gemini', false, 'inactive');