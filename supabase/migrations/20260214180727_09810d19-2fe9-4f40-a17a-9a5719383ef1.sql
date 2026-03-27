
-- =============================================
-- SECURITY HARDENING MIGRATION v1.0
-- =============================================

-- 1. Remove anonymous access to empresas table
-- The public-chat edge function uses service_role and doesn't need this policy
DROP POLICY IF EXISTS "Public can view active empresas by slug" ON public.empresas;

-- 2. Create a secure function for public empresa info (used by widget embedding)
-- Returns ONLY safe, non-sensitive columns
CREATE OR REPLACE FUNCTION public.get_public_empresa_info(_slug text)
RETURNS TABLE (
  id uuid,
  nome text,
  slug text,
  default_welcome_message text,
  default_response_delay_ms integer,
  widget_primary_color text,
  widget_secondary_color text,
  widget_background_color text,
  widget_user_message_color text,
  widget_agent_message_color text,
  widget_agent_text_color text,
  widget_user_text_color text,
  widget_button_color text,
  widget_input_background_color text,
  widget_input_text_color text,
  widget_theme_mode text,
  widget_border_radius text,
  widget_size text,
  widget_header_text text,
  widget_avatar_url text,
  service_chat_enabled boolean,
  service_voice_enabled boolean,
  service_scheduling_enabled boolean,
  service_email_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    e.id, e.nome, e.slug,
    e.default_welcome_message, e.default_response_delay_ms,
    e.widget_primary_color, e.widget_secondary_color, e.widget_background_color,
    e.widget_user_message_color, e.widget_agent_message_color, e.widget_agent_text_color,
    e.widget_user_text_color, e.widget_button_color, e.widget_input_background_color,
    e.widget_input_text_color, e.widget_theme_mode, e.widget_border_radius, e.widget_size,
    e.widget_header_text, e.widget_avatar_url,
    e.service_chat_enabled, e.service_voice_enabled, e.service_scheduling_enabled, e.service_email_enabled
  FROM public.empresas e
  WHERE e.slug = _slug AND e.status = 'ativo'
  LIMIT 1;
$$;

-- 3. Create a safe AI providers view function for admin UI
-- Returns provider info WITHOUT the actual API key, just a boolean flag
CREATE OR REPLACE FUNCTION public.get_ai_providers_safe()
RETURNS TABLE (
  id uuid,
  provider_key text,
  provider_name text,
  is_enabled boolean,
  has_api_key boolean,
  status text,
  last_tested_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id, p.provider_key, p.provider_name, p.is_enabled,
    (p.api_key IS NOT NULL AND p.api_key != '') as has_api_key,
    p.status, p.last_tested_at, p.created_at, p.updated_at
  FROM public.ai_providers p
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.provider_name;
$$;

-- 4. Add authenticated user policy for empresas (users can view their own company)
-- This ensures authenticated company users can still see their empresa
CREATE POLICY "Clients can view their own empresa"
ON public.empresas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.empresa_id = empresas.id
  )
);
