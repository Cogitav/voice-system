-- Add new widget branding fields for text colors, size, and button color
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS widget_agent_text_color text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS widget_user_text_color text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS widget_size text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS widget_button_color text DEFAULT NULL;

-- Add check constraint for widget_size
ALTER TABLE public.empresas
ADD CONSTRAINT empresas_widget_size_check 
CHECK (widget_size IS NULL OR widget_size IN ('small', 'medium', 'large'));