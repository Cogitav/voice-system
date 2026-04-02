
CREATE INDEX IF NOT EXISTS idx_service_resources_service_id ON public.scheduling_service_resources (service_id);
CREATE INDEX IF NOT EXISTS idx_service_resources_resource_id ON public.scheduling_service_resources (resource_id);
