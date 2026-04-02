-- Create system_email_logs table for credit alert emails (separate from email_logs which is for follow-up)
CREATE TABLE public.system_email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'credits_70', 'credits_85', 'credits_100'
  month TEXT NOT NULL, -- YYYY-MM format
  recipients TEXT[] NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_email_logs ENABLE ROW LEVEL SECURITY;

-- Create index for efficient querying
CREATE INDEX idx_system_email_logs_empresa_month ON public.system_email_logs(empresa_id, month);
CREATE INDEX idx_system_email_logs_alert_type ON public.system_email_logs(alert_type);

-- Admin policies
CREATE POLICY "Admins can view all system email logs"
ON public.system_email_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system email logs"
ON public.system_email_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));