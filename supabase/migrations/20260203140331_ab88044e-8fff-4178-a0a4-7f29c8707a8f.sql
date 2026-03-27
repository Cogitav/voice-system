-- =============================================
-- Agent Action Logs Table
-- Tracks all agent action executions for audit
-- =============================================

CREATE TABLE public.agent_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agentes(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  
  -- Action details
  action_type TEXT NOT NULL,
  action_data JSONB DEFAULT '{}'::jsonb,
  
  -- Execution context
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ai', 'human')),
  reference_id TEXT, -- For idempotency
  
  -- Outcome
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'blocked', 'failed')),
  outcome_message TEXT,
  
  -- Credits (if applicable)
  credits_consumed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comments for documentation
COMMENT ON TABLE public.agent_action_logs IS 'Audit log for all agent action executions';
COMMENT ON COLUMN public.agent_action_logs.action_type IS 'One of: answer_information, collect_lead, send_link, create_appointment, reschedule_appointment, cancel_appointment, send_email, handoff_to_human';
COMMENT ON COLUMN public.agent_action_logs.actor_type IS 'Whether action was triggered by AI or Human operator';
COMMENT ON COLUMN public.agent_action_logs.outcome IS 'success = executed, blocked = service disabled, failed = execution error';
COMMENT ON COLUMN public.agent_action_logs.reference_id IS 'Used for idempotency to prevent duplicate executions';

-- Indexes for common queries
CREATE INDEX idx_agent_action_logs_empresa ON public.agent_action_logs(empresa_id);
CREATE INDEX idx_agent_action_logs_conversation ON public.agent_action_logs(conversation_id);
CREATE INDEX idx_agent_action_logs_action_type ON public.agent_action_logs(action_type);
CREATE INDEX idx_agent_action_logs_created_at ON public.agent_action_logs(created_at DESC);
CREATE UNIQUE INDEX idx_agent_action_logs_idempotency ON public.agent_action_logs(empresa_id, action_type, reference_id) WHERE reference_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage action logs"
  ON public.agent_action_logs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa action logs"
  ON public.agent_action_logs
  FOR SELECT
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- =============================================
-- Leads Table (for collect_lead action)
-- =============================================

CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agentes(id) ON DELETE SET NULL,
  
  -- Lead data
  name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  
  -- Metadata
  source TEXT DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Leads collected by AI agents via collect_lead action';

-- Indexes
CREATE INDEX idx_leads_empresa ON public.leads(empresa_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all leads"
  ON public.leads
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa leads"
  ON public.leads
  FOR SELECT
  USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Clients can update their empresa leads"
  ON public.leads
  FOR UPDATE
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();