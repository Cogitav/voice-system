-- Remove client INSERT and UPDATE policies
DROP POLICY IF EXISTS "Clients can insert their empresa agentes" ON public.agentes;
DROP POLICY IF EXISTS "Clients can update their empresa agentes" ON public.agentes;