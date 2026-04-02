-- Add additional columns for agendamentos module
ALTER TABLE public.agendamentos 
ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.agentes(id),
ADD COLUMN IF NOT EXISTS notas text,
ADD COLUMN IF NOT EXISTS cliente_telefone text,
ADD COLUMN IF NOT EXISTS cliente_nome text,
ADD COLUMN IF NOT EXISTS external_calendar_id text,
ADD COLUMN IF NOT EXISTS external_calendar_type text;

-- Add comment for future calendar integration preparation
COMMENT ON COLUMN public.agendamentos.external_calendar_id IS 'ID for external calendar integration (Calendly/Google Calendar)';
COMMENT ON COLUMN public.agendamentos.external_calendar_type IS 'Type of external calendar (calendly/google)';

-- Create INSERT policy for admins
CREATE POLICY "Admins can insert agendamentos"
ON public.agendamentos
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create UPDATE policy for admins
CREATE POLICY "Admins can update agendamentos"
ON public.agendamentos
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create DELETE policy for admins
CREATE POLICY "Admins can delete agendamentos"
ON public.agendamentos
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));