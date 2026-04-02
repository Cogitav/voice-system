-- Drop the existing unique constraint on (empresa_id, intent)
-- and replace with (empresa_id, intent, recipient_type)

-- First, find and drop the existing constraint
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the unique constraint on empresa_id and intent
    SELECT conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'email_templates'
    AND n.nspname = 'public'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 2;
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.email_templates DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Drop any existing index that might be enforcing uniqueness
DROP INDEX IF EXISTS public.email_templates_empresa_intent_unique;
DROP INDEX IF EXISTS public.idx_email_templates_empresa_intent;

-- Create the new unique constraint that allows multiple templates per intent
-- (one per recipient_type)
ALTER TABLE public.email_templates
ADD CONSTRAINT email_templates_empresa_intent_recipient_unique 
UNIQUE (empresa_id, intent, recipient_type);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_lookup 
ON public.email_templates (empresa_id, intent, is_active);