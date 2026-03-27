
-- Create booking_configuration table
CREATE TABLE public.booking_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  require_name BOOLEAN NOT NULL DEFAULT true,
  require_email BOOLEAN NOT NULL DEFAULT true,
  require_phone BOOLEAN NOT NULL DEFAULT false,
  require_reason BOOLEAN NOT NULL DEFAULT true,
  allow_same_day_booking BOOLEAN NOT NULL DEFAULT true,
  allow_outside_business_hours BOOLEAN NOT NULL DEFAULT false,
  minimum_advance_minutes INTEGER NOT NULL DEFAULT 0,
  allow_internal_calendar BOOLEAN NOT NULL DEFAULT true,
  allow_external_calendar BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

ALTER TABLE public.booking_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage booking configuration"
ON public.booking_configuration
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company users can view own booking configuration"
ON public.booking_configuration
FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE TRIGGER update_booking_configuration_updated_at
BEFORE UPDATE ON public.booking_configuration
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create config for new companies
CREATE OR REPLACE FUNCTION public.auto_create_booking_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.booking_configuration (empresa_id)
  VALUES (NEW.id)
  ON CONFLICT (empresa_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_booking_configuration
AFTER INSERT ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_booking_configuration();

-- Seed existing companies
INSERT INTO public.booking_configuration (empresa_id)
SELECT id FROM public.empresas
ON CONFLICT (empresa_id) DO NOTHING;
