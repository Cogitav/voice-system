UPDATE public.agentes
SET initial_greeting = welcome_message
WHERE welcome_message IS NOT NULL
  AND welcome_message <> ''
  AND (initial_greeting IS NULL OR initial_greeting = '');
