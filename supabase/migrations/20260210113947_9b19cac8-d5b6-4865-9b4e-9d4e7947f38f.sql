
-- =============================================
-- Scheduling Resources Table
-- =============================================
-- Each company can have 0..N scheduling resources (people, rooms, equipment)
-- Each resource has its own duration and calendar association

CREATE TABLE public.scheduling_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'person' CHECK (type IN ('person', 'room', 'equipment')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  default_appointment_duration_minutes INTEGER NOT NULL DEFAULT 30,
  calendar_type TEXT DEFAULT 'internal' CHECK (calendar_type IN ('internal', 'google', 'outlook', 'calendly')),
  external_calendar_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduling_resources ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage scheduling resources"
ON public.scheduling_resources
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Company users can view their own resources
CREATE POLICY "Company users can view their scheduling resources"
ON public.scheduling_resources
FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
);

-- Timestamp trigger
CREATE TRIGGER update_scheduling_resources_updated_at
BEFORE UPDATE ON public.scheduling_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Availability Logs Table (audit trail)
-- =============================================
CREATE TABLE public.availability_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  requested_by TEXT, -- 'agent' or 'user' or 'system'
  resource_ids UUID[], -- resources evaluated
  requested_date_from DATE NOT NULL,
  requested_date_to DATE NOT NULL,
  requested_duration_minutes INTEGER NOT NULL,
  slots_returned INTEGER NOT NULL DEFAULT 0,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view availability logs"
ON public.availability_logs
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Company users can view their availability logs"
ON public.availability_logs
FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
);

-- =============================================
-- Update agendamentos to reference scheduling_resources
-- =============================================
-- resource_id already exists as TEXT, alter to UUID FK
ALTER TABLE public.agendamentos 
  ALTER COLUMN resource_id TYPE UUID USING resource_id::UUID;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_resource_id_fkey 
  FOREIGN KEY (resource_id) REFERENCES public.scheduling_resources(id);

-- Add start/end datetime columns if not present (they exist already from prior migration)
-- Add duration tracking
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
