-- Step 1: Add new role values to the enum (must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente_coordenador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente_normal';