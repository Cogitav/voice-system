
-- 1) Create scheduling_services table
CREATE TABLE public.scheduling_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduling services"
ON public.scheduling_services FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company users can view their scheduling services"
ON public.scheduling_services FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE TRIGGER update_scheduling_services_updated_at
BEFORE UPDATE ON public.scheduling_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Create scheduling_service_resources (many-to-many)
CREATE TABLE public.scheduling_service_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.scheduling_services(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.scheduling_resources(id) ON DELETE CASCADE,
  UNIQUE(service_id, resource_id)
);

ALTER TABLE public.scheduling_service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage service resources"
ON public.scheduling_service_resources FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company users can view their service resources"
ON public.scheduling_service_resources FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.scheduling_services ss
  WHERE ss.id = scheduling_service_resources.service_id
  AND ss.empresa_id = get_user_empresa_id(auth.uid())
));

-- 3) Create scheduling_business_hours
CREATE TABLE public.scheduling_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(empresa_id, day_of_week)
);

ALTER TABLE public.scheduling_business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage business hours"
ON public.scheduling_business_hours FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company users can view their business hours"
ON public.scheduling_business_hours FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

-- 4) Add slot_increment_minutes to empresas
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS slot_increment_minutes INTEGER DEFAULT 15;

-- 5) Add service_id to agendamentos
ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.scheduling_services(id);
