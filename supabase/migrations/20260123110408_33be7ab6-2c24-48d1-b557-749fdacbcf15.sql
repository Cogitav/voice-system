-- Add widget branding fields to empresas table
ALTER TABLE public.empresas
ADD COLUMN widget_primary_color text DEFAULT NULL,
ADD COLUMN widget_secondary_color text DEFAULT NULL,
ADD COLUMN widget_background_color text DEFAULT NULL,
ADD COLUMN widget_user_message_color text DEFAULT NULL,
ADD COLUMN widget_agent_message_color text DEFAULT NULL,
ADD COLUMN widget_theme_mode text DEFAULT 'light',
ADD COLUMN widget_border_radius text DEFAULT 'normal',
ADD COLUMN widget_header_text text DEFAULT NULL,
ADD COLUMN widget_avatar_url text DEFAULT NULL;

-- Add check constraint for theme_mode
ALTER TABLE public.empresas
ADD CONSTRAINT empresas_widget_theme_mode_check 
CHECK (widget_theme_mode IS NULL OR widget_theme_mode IN ('light', 'dark', 'auto'));

-- Add check constraint for border_radius
ALTER TABLE public.empresas
ADD CONSTRAINT empresas_widget_border_radius_check 
CHECK (widget_border_radius IS NULL OR widget_border_radius IN ('normal', 'rounded', 'soft'));