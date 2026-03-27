-- Add widget input branding columns to empresas table
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS widget_input_background_color text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS widget_input_text_color text DEFAULT NULL;