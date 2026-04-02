
-- 1. Create appointment_resources table for multi-resource bookings
CREATE TABLE public.appointment_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.scheduling_resources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, resource_id)
);

ALTER TABLE public.appointment_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage appointment_resources"
ON public.appointment_resources FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Company users view own appointment_resources"
ON public.appointment_resources FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = appointment_resources.appointment_id
    AND a.empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- 2. Extend scheduling_service_resources with is_required flag
ALTER TABLE public.scheduling_service_resources
ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true;
