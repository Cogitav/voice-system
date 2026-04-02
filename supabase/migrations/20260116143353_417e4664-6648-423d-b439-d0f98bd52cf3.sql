-- Create follow_up_rules table for configurable rules per intent per empresa
CREATE TABLE public.follow_up_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  
  -- Action toggles - all default to FALSE (safe defaults)
  send_email_client BOOLEAN NOT NULL DEFAULT false,
  send_email_company BOOLEAN NOT NULL DEFAULT false,
  create_appointment BOOLEAN NOT NULL DEFAULT false,
  register_only BOOLEAN NOT NULL DEFAULT true,
  mark_manual_followup BOOLEAN NOT NULL DEFAULT false,
  
  -- Template references (optional - emails only sent if template selected AND action enabled)
  client_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  company_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  
  -- Company notification email (where to send internal emails)
  company_notification_email TEXT,
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Each empresa can only have one rule per intent
  UNIQUE(empresa_id, intent)
);

-- Enable RLS
ALTER TABLE public.follow_up_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all follow_up_rules"
ON public.follow_up_rules
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert follow_up_rules"
ON public.follow_up_rules
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update follow_up_rules"
ON public.follow_up_rules
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete follow_up_rules"
ON public.follow_up_rules
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa follow_up_rules"
ON public.follow_up_rules
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.empresa_id = follow_up_rules.empresa_id
));

-- Add updated_at trigger
CREATE TRIGGER update_follow_up_rules_updated_at
BEFORE UPDATE ON public.follow_up_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add recipient_type to email_templates to distinguish client vs company templates
ALTER TABLE public.email_templates 
ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'client' 
CHECK (recipient_type IN ('client', 'company'));