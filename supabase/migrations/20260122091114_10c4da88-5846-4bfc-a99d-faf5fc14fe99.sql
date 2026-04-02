-- Add 'voice' to the conversation_channel enum
ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'voice';

-- Add 'system' to the message_sender_type enum for system messages
ALTER TYPE public.message_sender_type ADD VALUE IF NOT EXISTS 'system';