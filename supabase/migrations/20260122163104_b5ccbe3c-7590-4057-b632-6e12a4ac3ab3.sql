-- Add lifecycle columns to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS closure_reason text,
ADD COLUMN IF NOT EXISTS closure_note text,
ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS summary text,
ADD COLUMN IF NOT EXISTS main_intent text,
ADD COLUMN IF NOT EXISTS result text,
ADD COLUMN IF NOT EXISTS next_action text;