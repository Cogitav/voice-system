-- Allow admins to insert simulated calls
CREATE POLICY "Admins can insert chamadas"
ON public.chamadas
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));