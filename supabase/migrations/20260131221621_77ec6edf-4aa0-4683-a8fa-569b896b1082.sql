-- ================================================
-- System Email Templates Table
-- Admin-editable templates for credit alerts
-- ================================================

CREATE TABLE public.system_email_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    template_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    variables TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_email_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage system email templates
CREATE POLICY "Admins can manage system email templates"
ON public.system_email_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_system_email_templates_updated_at
BEFORE UPDATE ON public.system_email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default credit alert templates
INSERT INTO public.system_email_templates (template_key, name, description, subject, body_html, body_text, variables)
VALUES 
(
    'credits_70',
    'Alerta de Créditos 70%',
    'Notificação enviada quando a empresa atinge 70% do limite de créditos',
    'Utilização de créditos a {{percentagem_utilizacao}}%',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
{{#logo}}
<div style="text-align: center; padding: 20px 0;">
<img src="{{platform_logo_url}}" alt="Logo" style="max-height: 60px;" />
</div>
{{/logo}}
<div style="padding: 20px; background-color: #f9fafb; border-radius: 8px;">
<h2 style="color: #374151; margin-top: 0;">Olá {{empresa_nome}},</h2>
<p style="color: #6b7280; line-height: 1.6;">
Informamos que a utilização do seu plafond mensal de créditos atingiu <strong>{{percentagem_utilizacao}}%</strong> 
({{creditos_usados}} de {{creditos_limite}}).
</p>
<p style="color: #6b7280; line-height: 1.6;">
O serviço continua a funcionar normalmente.<br/>
Este aviso serve apenas para acompanhamento do consumo.
</p>
<p style="color: #6b7280; line-height: 1.6;">
Caso tenha alguma questão, poderá contactar o administrador da plataforma.
</p>
</div>
<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
{{platform_signature}}<br/>
{{platform_footer_text}}
</div>
</div>',
    'Olá {{empresa_nome}},

Informamos que a utilização do seu plafond mensal de créditos atingiu {{percentagem_utilizacao}}% ({{creditos_usados}} de {{creditos_limite}}).

O serviço continua a funcionar normalmente.
Este aviso serve apenas para acompanhamento do consumo.

Caso tenha alguma questão, poderá contactar o administrador da plataforma.

{{platform_signature}}
{{platform_footer_text}}',
    ARRAY['empresa_nome', 'percentagem_utilizacao', 'creditos_usados', 'creditos_limite', 'mes', 'plano_nome', 'platform_logo_url', 'platform_signature', 'platform_footer_text']
),
(
    'credits_85',
    'Aviso de Créditos 85%',
    'Aviso enviado quando a empresa atinge 85% do limite de créditos',
    'Atenção à utilização de créditos ({{percentagem_utilizacao}}%)',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
{{#logo}}
<div style="text-align: center; padding: 20px 0;">
<img src="{{platform_logo_url}}" alt="Logo" style="max-height: 60px;" />
</div>
{{/logo}}
<div style="padding: 20px; background-color: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b;">
<h2 style="color: #92400e; margin-top: 0;">Olá {{empresa_nome}},</h2>
<p style="color: #78350f; line-height: 1.6;">
A utilização de créditos atingiu <strong>{{percentagem_utilizacao}}%</strong> do limite mensal 
({{creditos_usados}} de {{creditos_limite}}).
</p>
<p style="color: #78350f; line-height: 1.6;">
Recomendamos acompanhar o consumo para evitar excedentes.
</p>
<p style="color: #78350f; line-height: 1.6;">
Caso seja necessário, poderão ser adicionados créditos extra.
</p>
</div>
<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
{{platform_signature}}<br/>
{{platform_footer_text}}
</div>
</div>',
    'Olá {{empresa_nome}},

A utilização de créditos atingiu {{percentagem_utilizacao}}% do limite mensal ({{creditos_usados}} de {{creditos_limite}}).

Recomendamos acompanhar o consumo para evitar excedentes.

Caso seja necessário, poderão ser adicionados créditos extra.

{{platform_signature}}
{{platform_footer_text}}',
    ARRAY['empresa_nome', 'percentagem_utilizacao', 'creditos_usados', 'creditos_limite', 'mes', 'plano_nome', 'platform_logo_url', 'platform_signature', 'platform_footer_text']
),
(
    'credits_100',
    'Limite de Créditos Ultrapassado',
    'Notificação enviada quando a empresa ultrapassa 100% do limite de créditos',
    'Limite de créditos ultrapassado ({{percentagem_utilizacao}}%)',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
{{#logo}}
<div style="text-align: center; padding: 20px 0;">
<img src="{{platform_logo_url}}" alt="Logo" style="max-height: 60px;" />
</div>
{{/logo}}
<div style="padding: 20px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
<h2 style="color: #991b1b; margin-top: 0;">Olá {{empresa_nome}},</h2>
<p style="color: #7f1d1d; line-height: 1.6;">
O consumo mensal de créditos ultrapassou o limite contratado 
(<strong>{{creditos_usados}}</strong> de {{creditos_limite}} – {{percentagem_utilizacao}}%).
</p>
<p style="color: #7f1d1d; line-height: 1.6;">
O serviço continua ativo, mas o consumo adicional será considerado excedente.
</p>
<p style="color: #7f1d1d; line-height: 1.6;">
Para esclarecimentos ou regularização, contacte o administrador da plataforma.
</p>
</div>
<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
{{platform_signature}}<br/>
{{platform_footer_text}}
</div>
</div>',
    'Olá {{empresa_nome}},

O consumo mensal de créditos ultrapassou o limite contratado ({{creditos_usados}} de {{creditos_limite}} – {{percentagem_utilizacao}}%).

O serviço continua ativo, mas o consumo adicional será considerado excedente.

Para esclarecimentos ou regularização, contacte o administrador da plataforma.

{{platform_signature}}
{{platform_footer_text}}',
    ARRAY['empresa_nome', 'percentagem_utilizacao', 'creditos_usados', 'creditos_limite', 'mes', 'plano_nome', 'platform_logo_url', 'platform_signature', 'platform_footer_text']
);

-- Add empresa filter index to system_email_logs for better query performance
CREATE INDEX IF NOT EXISTS idx_system_email_logs_empresa_id ON public.system_email_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_system_email_logs_status ON public.system_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_system_email_logs_month ON public.system_email_logs(month);