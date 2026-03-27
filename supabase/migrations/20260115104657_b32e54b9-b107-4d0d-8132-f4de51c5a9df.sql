-- Create enum type for knowledge types
CREATE TYPE public.knowledge_type AS ENUM ('faq', 'document', 'website', 'notes');

-- Create agent_knowledge_base table
CREATE TABLE public.agent_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agentes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type knowledge_type NOT NULL,
  content TEXT,
  source_url TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Admin policies (full CRUD)
CREATE POLICY "Admins can view all knowledge"
  ON public.agent_knowledge_base
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert knowledge"
  ON public.agent_knowledge_base
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update knowledge"
  ON public.agent_knowledge_base
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete knowledge"
  ON public.agent_knowledge_base
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Client policies (read-only, empresa-isolated)
CREATE POLICY "Clients can view their empresa knowledge"
  ON public.agent_knowledge_base
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.empresa_id = agent_knowledge_base.empresa_id
    )
  );

-- Create index for performance
CREATE INDEX idx_knowledge_empresa_id ON public.agent_knowledge_base(empresa_id);
CREATE INDEX idx_knowledge_agent_id ON public.agent_knowledge_base(agent_id);
CREATE INDEX idx_knowledge_type ON public.agent_knowledge_base(type);