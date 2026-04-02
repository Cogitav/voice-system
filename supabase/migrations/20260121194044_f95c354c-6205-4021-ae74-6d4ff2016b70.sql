-- Create enum for conversation channels
CREATE TYPE public.conversation_channel AS ENUM ('chat', 'whatsapp');

-- Create enum for conversation status
CREATE TYPE public.conversation_status AS ENUM ('ai_active', 'waiting_human', 'human_active', 'closed');

-- Create enum for conversation owner
CREATE TYPE public.conversation_owner AS ENUM ('ai', 'human');

-- Create enum for message sender type
CREATE TYPE public.message_sender_type AS ENUM ('client', 'ai', 'human');

-- Create conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  channel conversation_channel NOT NULL DEFAULT 'chat',
  status conversation_status NOT NULL DEFAULT 'ai_active',
  owner conversation_owner NOT NULL DEFAULT 'ai',
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_identifier TEXT NOT NULL,
  client_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type message_sender_type NOT NULL,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_conversations_empresa_id ON public.conversations(empresa_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Admins can view all conversations"
ON public.conversations FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert conversations"
ON public.conversations FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update conversations"
ON public.conversations FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa conversations"
ON public.conversations FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Clients can update their empresa conversations"
ON public.conversations FOR UPDATE
USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for messages
CREATE POLICY "Admins can view all messages"
ON public.messages FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert messages"
ON public.messages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their empresa messages"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.empresa_id = get_user_empresa_id(auth.uid())
  )
);

CREATE POLICY "Clients can insert messages to their empresa conversations"
ON public.messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;