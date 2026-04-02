
CREATE TABLE public.agent_runtime_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid,
  conversation_id uuid,
  event_type text,
  message text,
  payload jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.agent_runtime_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage runtime logs" ON public.agent_runtime_logs
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert runtime logs" ON public.agent_runtime_logs
  FOR INSERT TO service_role
  WITH CHECK (true);
