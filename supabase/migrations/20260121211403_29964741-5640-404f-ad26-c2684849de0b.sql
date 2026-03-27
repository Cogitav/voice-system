-- Add slug column to empresas for URL routing
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_empresas_slug ON public.empresas(slug);

-- Update existing empresas with slugs based on nome
UPDATE public.empresas 
SET slug = LOWER(REGEXP_REPLACE(REPLACE(nome, ' ', '-'), '[^a-zA-Z0-9-]', '', 'g'))
WHERE slug IS NULL;

-- Function to set client identifier in session context (called before anon queries)
CREATE OR REPLACE FUNCTION public.set_client_identifier(identifier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.client_identifier', identifier, true);
END;
$$;

-- Function to get client identifier from session context
CREATE OR REPLACE FUNCTION public.get_client_identifier()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.client_identifier', true), '');
$$;

-- RLS for empresas: anon can only view active empresas by slug (limited info)
CREATE POLICY "Public can view active empresas by slug"
  ON public.empresas
  FOR SELECT
  TO anon
  USING (status = 'ativo' AND slug IS NOT NULL);

-- RLS for conversations: anon can create conversations
CREATE POLICY "Public can create conversations"
  ON public.conversations
  FOR INSERT
  TO anon
  WITH CHECK (
    owner = 'ai' AND 
    status = 'ai_active' AND
    assigned_user_id IS NULL
  );

-- RLS for conversations: anon can ONLY read their own conversations (by client_identifier)
CREATE POLICY "Public can view own conversations"
  ON public.conversations
  FOR SELECT
  TO anon
  USING (client_identifier = get_client_identifier());

-- RLS for messages: anon can insert client messages to their own conversations
CREATE POLICY "Public can insert client messages"
  ON public.messages
  FOR INSERT
  TO anon
  WITH CHECK (
    sender_type = 'client' AND
    sender_user_id IS NULL AND
    is_internal = false AND
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND c.client_identifier = get_client_identifier()
    )
  );

-- RLS for messages: anon can ONLY read messages from their own conversations
CREATE POLICY "Public can view own conversation messages"
  ON public.messages
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND c.client_identifier = get_client_identifier()
    )
  );