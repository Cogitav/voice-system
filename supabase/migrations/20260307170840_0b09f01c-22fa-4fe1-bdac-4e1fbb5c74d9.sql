
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS pricing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.scheduling_services ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE public.scheduling_services ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
ALTER TABLE public.scheduling_services ADD COLUMN IF NOT EXISTS promo_price numeric;
ALTER TABLE public.scheduling_services ADD COLUMN IF NOT EXISTS promo_start timestamp with time zone;
ALTER TABLE public.scheduling_services ADD COLUMN IF NOT EXISTS promo_end timestamp with time zone;
