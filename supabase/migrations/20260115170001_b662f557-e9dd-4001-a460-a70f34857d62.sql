-- Add proxima_acao column for storing admin's next action decision
ALTER TABLE public.chamadas 
ADD COLUMN proxima_acao text DEFAULT NULL;

-- Add UPDATE policy for admins to update the proxima_acao field
CREATE POLICY "Admins can update chamadas" 
ON public.chamadas 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));