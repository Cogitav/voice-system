create table if not exists public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid null references public.conversations(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.agent_logs enable row level security;

create index if not exists idx_agent_logs_conversation_created_at
  on public.agent_logs (conversation_id, created_at desc);

create index if not exists idx_agent_logs_event_type_created_at
  on public.agent_logs (event_type, created_at desc);
