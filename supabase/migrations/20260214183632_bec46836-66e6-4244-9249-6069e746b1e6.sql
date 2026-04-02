
-- Fix: Restrict global settings visibility to exclude admin-only settings
-- Replace the overly broad "Clients can view global settings" policy
DROP POLICY IF EXISTS "Clients can view global settings" ON public.settings;

-- Create a more restrictive policy that excludes admin-only keys
CREATE POLICY "Clients can view safe global settings"
ON public.settings
FOR SELECT
TO authenticated
USING (
  scope = 'global'::settings_scope 
  AND key NOT IN ('admin_notification_email', 'email_sender_address')
);
