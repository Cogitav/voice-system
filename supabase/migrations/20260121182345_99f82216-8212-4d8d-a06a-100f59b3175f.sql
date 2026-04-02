-- Create RPC function to get current user's role
-- This is the SINGLE SOURCE OF TRUTH for role resolution
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
  LIMIT 1
$$;