
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS conversation_state text NOT NULL DEFAULT 'idle';

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS conversation_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_conversations_state
ON public.conversations (conversation_state);
