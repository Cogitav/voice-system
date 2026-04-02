CREATE UNIQUE INDEX idx_agendamentos_resource_start_unique 
ON public.agendamentos (resource_id, start_datetime) 
WHERE resource_id IS NOT NULL 
AND scheduling_state IN ('requested', 'confirmed');