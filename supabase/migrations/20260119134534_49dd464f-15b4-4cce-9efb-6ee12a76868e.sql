-- Create scope enum for settings
CREATE TYPE public.settings_scope AS ENUM ('global', 'empresa');

-- Create settings table
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope settings_scope NOT NULL DEFAULT 'global',
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create partial unique indexes for uniqueness constraints
CREATE UNIQUE INDEX idx_settings_unique_global_key ON public.settings(key) WHERE (scope = 'global' AND empresa_id IS NULL);
CREATE UNIQUE INDEX idx_settings_unique_empresa_key ON public.settings(empresa_id, key) WHERE (scope = 'empresa' AND empresa_id IS NOT NULL);

-- Create indexes for faster lookups
CREATE INDEX idx_settings_key ON public.settings(key);
CREATE INDEX idx_settings_empresa_id ON public.settings(empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX idx_settings_scope ON public.settings(scope);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Admin policies (full access)
CREATE POLICY "Admins can view all settings"
ON public.settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update settings"
ON public.settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete settings"
ON public.settings
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Client policy (read-only, empresa-scoped)
CREATE POLICY "Clients can view their empresa settings"
ON public.settings
FOR SELECT
USING (
  scope = 'empresa' AND 
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.empresa_id = settings.empresa_id
  )
);

-- Clients can also view global settings (read-only)
CREATE POLICY "Clients can view global settings"
ON public.settings
FOR SELECT
USING (scope = 'global');

-- Add trigger for updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();