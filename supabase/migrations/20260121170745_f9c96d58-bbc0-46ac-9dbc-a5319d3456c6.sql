-- Step 1: Migrate existing 'cliente' roles to 'cliente_normal'
UPDATE public.user_roles 
SET role = 'cliente_normal' 
WHERE role = 'cliente';

-- Step 2: Drop existing RLS policies on profiles that need updating
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Step 3: Create comprehensive RLS policies for profiles

-- Admin can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can insert profiles
CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can update profiles (except empresa_id which is handled at application level)
CREATE POLICY "Admins can update profiles" 
ON public.profiles 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Coordinators can view profiles from their own empresa
CREATE POLICY "Coordinators can view empresa profiles" 
ON public.profiles 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'cliente_coordenador') 
  AND empresa_id = (
    SELECT p.empresa_id 
    FROM public.profiles p 
    WHERE p.user_id = auth.uid()
  )
);

-- Coordinators can insert profiles for their empresa
CREATE POLICY "Coordinators can insert empresa profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  public.has_role(auth.uid(), 'cliente_coordenador') 
  AND empresa_id = (
    SELECT p.empresa_id 
    FROM public.profiles p 
    WHERE p.user_id = auth.uid()
  )
);

-- Step 4: Update user_roles RLS to allow coordinators to manage users
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;

-- Admins can manage all roles
CREATE POLICY "Admins can manage all roles" 
ON public.user_roles 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read their own roles
CREATE POLICY "Users can read own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Coordinators can read roles from their empresa
CREATE POLICY "Coordinators can read empresa roles" 
ON public.user_roles 
FOR SELECT 
USING (
  public.has_role(auth.uid(), 'cliente_coordenador') 
  AND user_id IN (
    SELECT p.user_id 
    FROM public.profiles p 
    WHERE p.empresa_id = (
      SELECT p2.empresa_id 
      FROM public.profiles p2 
      WHERE p2.user_id = auth.uid()
    )
  )
);

-- Coordinators can insert cliente_normal roles only
CREATE POLICY "Coordinators can insert cliente_normal roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  public.has_role(auth.uid(), 'cliente_coordenador') 
  AND role = 'cliente_normal'
);

-- Step 5: Create helper functions
CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id 
  FROM public.profiles 
  WHERE user_id = _user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'cliente_coordenador'
  )
$$;