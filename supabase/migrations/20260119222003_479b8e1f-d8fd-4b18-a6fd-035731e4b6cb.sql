-- Create enum for credit event types
CREATE TYPE public.credit_event_type AS ENUM (
  'call_completed',
  'call_short',
  'agent_test',
  'message',
  'email',
  'knowledge',
  'other'
);

-- Table: credits_usage (monthly credit usage per company)
CREATE TABLE public.credits_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- Format: YYYY-MM
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_limit INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, month)
);

-- Table: credits_events (individual usage events)
CREATE TABLE public.credits_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  event_type public.credit_event_type NOT NULL,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.credits_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credits_usage
CREATE POLICY "Admins can view all credits_usage"
ON public.credits_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert credits_usage"
ON public.credits_usage
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update credits_usage"
ON public.credits_usage
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete credits_usage"
ON public.credits_usage
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa credits_usage"
ON public.credits_usage
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.empresa_id = credits_usage.empresa_id
));

-- RLS Policies for credits_events
CREATE POLICY "Admins can view all credits_events"
ON public.credits_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert credits_events"
ON public.credits_events
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete credits_events"
ON public.credits_events
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa credits_events"
ON public.credits_events
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.empresa_id = credits_events.empresa_id
));

-- Trigger to update updated_at on credits_usage
CREATE TRIGGER update_credits_usage_updated_at
BEFORE UPDATE ON public.credits_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_credits_usage_empresa_month ON public.credits_usage(empresa_id, month);
CREATE INDEX idx_credits_events_empresa ON public.credits_events(empresa_id);
CREATE INDEX idx_credits_events_created_at ON public.credits_events(created_at DESC);