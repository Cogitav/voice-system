-- Create notifications table for credit alerts
CREATE TABLE public.credit_notifications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL, -- 'soft_70', 'warning_85', 'overage_100'
    threshold_percentage INTEGER NOT NULL, -- 70, 85, 100
    month TEXT NOT NULL, -- YYYY-MM format
    notified_admin_at TIMESTAMP WITH TIME ZONE,
    notified_company_at TIMESTAMP WITH TIME ZONE,
    credits_used_at_notification INTEGER NOT NULL,
    credits_limit_at_notification INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, notification_type, month)
);

-- Enable RLS
ALTER TABLE public.credit_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all notifications
CREATE POLICY "Admins can manage credit notifications"
    ON public.credit_notifications FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own empresa notifications
CREATE POLICY "Clients can view their empresa notifications"
    ON public.credit_notifications FOR SELECT
    USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Create credit_packages table for manual admin credit additions
CREATE TABLE public.credit_packages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    package_type TEXT NOT NULL CHECK (package_type IN ('EXTRA_S', 'EXTRA_M', 'EXTRA_L')),
    credits_amount INTEGER NOT NULL,
    month TEXT NOT NULL, -- YYYY-MM format
    added_by UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Admins can manage credit packages
CREATE POLICY "Admins can manage credit packages"
    ON public.credit_packages FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own empresa packages
CREATE POLICY "Clients can view their empresa packages"
    ON public.credit_packages FOR SELECT
    USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Add extra_credits column to credits_usage to track package additions
ALTER TABLE public.credits_usage ADD COLUMN IF NOT EXISTS extra_credits INTEGER NOT NULL DEFAULT 0;

-- Create index for performance
CREATE INDEX idx_credit_notifications_empresa_month ON public.credit_notifications(empresa_id, month);
CREATE INDEX idx_credit_packages_empresa_month ON public.credit_packages(empresa_id, month);