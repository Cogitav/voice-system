
-- Scheduling Capabilities per Company
CREATE TABLE public.scheduling_capabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  allow_create_appointment BOOLEAN NOT NULL DEFAULT true,
  allow_reschedule_appointment BOOLEAN NOT NULL DEFAULT false,
  allow_cancel_appointment BOOLEAN NOT NULL DEFAULT false,
  allow_view_availability BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id)
);

-- Enable RLS
ALTER TABLE public.scheduling_capabilities ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage scheduling capabilities"
ON public.scheduling_capabilities
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Clients can view their own company capabilities
CREATE POLICY "Clients can view own company capabilities"
ON public.scheduling_capabilities
FOR SELECT
TO authenticated
USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- Auto-create capabilities row when empresa is created
CREATE OR REPLACE FUNCTION public.auto_create_scheduling_capabilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.scheduling_capabilities (empresa_id)
  VALUES (NEW.id)
  ON CONFLICT (empresa_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_scheduling_capabilities
AFTER INSERT ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_scheduling_capabilities();

-- Seed capabilities for existing empresas
INSERT INTO public.scheduling_capabilities (empresa_id)
SELECT id FROM public.empresas
ON CONFLICT (empresa_id) DO NOTHING;

-- Updated_at trigger
CREATE TRIGGER update_scheduling_capabilities_updated_at
BEFORE UPDATE ON public.scheduling_capabilities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
