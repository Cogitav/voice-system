-- Fix infinite recursion in profiles RLS policies
-- Drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "Coordinators can view empresa profiles" ON public.profiles;
DROP POLICY IF EXISTS "Coordinators can insert empresa profiles" ON public.profiles;

-- Recreate policies using the SECURITY DEFINER function to avoid recursion
CREATE POLICY "Coordinators can view empresa profiles" 
ON public.profiles 
FOR SELECT 
USING (
  is_coordinator(auth.uid()) 
  AND empresa_id = get_user_empresa_id(auth.uid())
);

CREATE POLICY "Coordinators can insert empresa profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  is_coordinator(auth.uid()) 
  AND empresa_id = get_user_empresa_id(auth.uid())
);