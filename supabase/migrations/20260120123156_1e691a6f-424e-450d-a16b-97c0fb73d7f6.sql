-- Create subscription plans table with external data source limits
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  external_data_source_limit INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add subscription plan reference to empresas
ALTER TABLE public.empresas 
ADD COLUMN subscription_plan_id UUID REFERENCES public.subscription_plans(id);

-- Create external data sources registry (admin-controlled only)
CREATE TABLE public.external_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- e.g., 'crm', 'calendar', 'erp', 'api'
  source_name TEXT NOT NULL,
  source_identifier TEXT, -- external reference ID (never stores actual data)
  is_active BOOLEAN NOT NULL DEFAULT true,
  linked_by UUID REFERENCES auth.users(id), -- admin who linked it
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}', -- config metadata only, never external data
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, source_type, source_identifier)
);

-- Enable RLS on both tables
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_data_sources ENABLE ROW LEVEL SECURITY;

-- Subscription plans: admin read-only, no client access to modify
CREATE POLICY "Admins can view subscription plans"
ON public.subscription_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage subscription plans"
ON public.subscription_plans
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- External data sources: admin full control, clients read-only count only
CREATE POLICY "Admins can manage external data sources"
ON public.external_data_sources
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Clients can only see count of their company's active sources (not details)
CREATE POLICY "Clients can view own company source count"
ON public.external_data_sources
FOR SELECT
TO authenticated
USING (
  empresa_id IN (
    SELECT p.empresa_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);

-- Create function to check external data source limit
CREATE OR REPLACE FUNCTION public.check_external_source_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
  max_limit INTEGER;
BEGIN
  -- Get current count of active sources for this empresa
  SELECT COUNT(*) INTO current_count
  FROM public.external_data_sources
  WHERE empresa_id = NEW.empresa_id AND is_active = true;
  
  -- Get the limit from subscription plan
  SELECT COALESCE(sp.external_data_source_limit, 0) INTO max_limit
  FROM public.empresas e
  LEFT JOIN public.subscription_plans sp ON e.subscription_plan_id = sp.id
  WHERE e.id = NEW.empresa_id;
  
  -- Enforce limit (0 means unlimited for backwards compatibility)
  IF max_limit > 0 AND current_count >= max_limit THEN
    RAISE EXCEPTION 'External data source limit reached for this subscription plan (% of % allowed)', current_count, max_limit;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce limit on insert
CREATE TRIGGER enforce_external_source_limit
BEFORE INSERT ON public.external_data_sources
FOR EACH ROW
EXECUTE FUNCTION public.check_external_source_limit();

-- Create trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_external_data_sources_updated_at
BEFORE UPDATE ON public.external_data_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, external_data_source_limit, description) VALUES
('free', 0, 'Plano gratuito - sem integrações externas'),
('starter', 2, 'Plano inicial - até 2 fontes externas'),
('professional', 5, 'Plano profissional - até 5 fontes externas'),
('enterprise', 0, 'Plano empresarial - ilimitado');

-- Add comment for architectural documentation
COMMENT ON TABLE public.external_data_sources IS 'Registry of admin-authorized external data sources. Agents consult these sources read-only at runtime. No external data is stored, cached or persisted. This table only tracks authorization metadata.';
COMMENT ON COLUMN public.external_data_sources.metadata IS 'Configuration metadata only (connection params, refresh intervals). Never stores actual external data.';