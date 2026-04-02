-- First, update subscription_plans structure to support technical profiles
-- Add new fields for credit envelope, voice quality, and alert thresholds
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS monthly_credit_envelope integer NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS voice_quality_profile text NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS alert_threshold_soft integer NOT NULL DEFAULT 70,
ADD COLUMN IF NOT EXISTS alert_threshold_warning integer NOT NULL DEFAULT 85,
ADD COLUMN IF NOT EXISTS alert_threshold_critical integer NOT NULL DEFAULT 95;

-- Add monthly_price to empresas (commercial value, informational only)
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2) DEFAULT NULL;

-- Delete old plans and insert new technical profiles
DELETE FROM public.subscription_plans;

-- Insert new technical plans: BASE, PRO, ADVANCED
INSERT INTO public.subscription_plans (
  name, 
  description, 
  external_data_source_limit, 
  monthly_credit_envelope,
  voice_quality_profile,
  alert_threshold_soft,
  alert_threshold_warning,
  alert_threshold_critical,
  is_active
) VALUES 
(
  'BASE',
  'Plano base - Capacidade técnica essencial',
  1,
  1000,
  'standard',
  70,
  85,
  95,
  true
),
(
  'PRO',
  'Plano profissional - Capacidade técnica avançada',
  5,
  5000,
  'enhanced',
  70,
  85,
  95,
  true
),
(
  'ADVANCED',
  'Plano avançado - Capacidade técnica máxima',
  20,
  20000,
  'premium',
  70,
  85,
  95,
  true
);

-- Update empresas status enum to support test status
-- First check current values
ALTER TABLE public.empresas 
ALTER COLUMN status SET DEFAULT 'ativo';

-- Add comment for clarity
COMMENT ON COLUMN public.empresas.monthly_price IS 'Commercial value agreed with client. Informational only - does not affect system limits or usage.';