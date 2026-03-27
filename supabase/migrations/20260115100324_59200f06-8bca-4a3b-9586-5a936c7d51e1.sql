-- Add INSERT policy for admins
CREATE POLICY "Admins can insert agentes" 
ON public.agentes 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add UPDATE policy for admins
CREATE POLICY "Admins can update agentes" 
ON public.agentes 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add INSERT policy for clients (only for their empresa)
CREATE POLICY "Clients can insert their empresa agentes" 
ON public.agentes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND profiles.empresa_id = empresa_id
  )
);

-- Add UPDATE policy for clients (only for their empresa)
CREATE POLICY "Clients can update their empresa agentes" 
ON public.agentes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND profiles.empresa_id = agentes.empresa_id
  )
);