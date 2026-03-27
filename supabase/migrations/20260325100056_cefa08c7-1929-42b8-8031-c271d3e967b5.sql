
-- Booking Lifecycle State Enum (9 locked states)
CREATE TYPE public.booking_lifecycle_state AS ENUM (
  'initiated',
  'collecting_data',
  'service_resolved',
  'availability_checked',
  'slot_selected',
  'awaiting_confirmation',
  'confirmed',
  'failed',
  'cancelled'
);

-- Booking Event Type Enum (14 events)
CREATE TYPE public.booking_event_type AS ENUM (
  'conversation_started',
  'data_collected',
  'service_matched',
  'availability_requested',
  'slots_suggested',
  'slot_selected',
  'customer_data_collected',
  'confirmation_requested',
  'user_confirmed',
  'booking_committed',
  'slot_conflict',
  'user_cancelled',
  'timeout_expired',
  'system_error'
);

-- Booking Lifecycle Table (single source of truth)
CREATE TABLE public.booking_lifecycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  current_state public.booking_lifecycle_state NOT NULL DEFAULT 'initiated',
  service_id uuid REFERENCES public.scheduling_services(id),
  selected_slot timestamptz,
  customer_name text,
  customer_email text,
  customer_phone text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only ONE active booking per conversation
CREATE UNIQUE INDEX idx_bl_active_conversation
  ON public.booking_lifecycle(conversation_id)
  WHERE current_state NOT IN ('confirmed', 'failed', 'cancelled');

CREATE INDEX idx_bl_empresa ON public.booking_lifecycle(empresa_id);
CREATE INDEX idx_bl_state ON public.booking_lifecycle(current_state);
CREATE INDEX idx_bl_conversation ON public.booking_lifecycle(conversation_id);

-- Booking Lifecycle Log Table (audit trail)
CREATE TABLE public.booking_lifecycle_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_id uuid NOT NULL REFERENCES public.booking_lifecycle(id) ON DELETE CASCADE,
  previous_state public.booking_lifecycle_state NOT NULL,
  next_state public.booking_lifecycle_state NOT NULL,
  event_type public.booking_event_type NOT NULL,
  execution_id text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_code text,
  latency_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency constraint
CREATE UNIQUE INDEX idx_lifecycle_event_idempotency
  ON public.booking_lifecycle_log(lifecycle_id, event_type, execution_id);

CREATE INDEX idx_bll_lifecycle ON public.booking_lifecycle_log(lifecycle_id);
CREATE INDEX idx_bll_event ON public.booking_lifecycle_log(event_type);

-- RLS
ALTER TABLE public.booking_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_lifecycle_log ENABLE ROW LEVEL SECURITY;

-- Booking Lifecycle RLS
CREATE POLICY "Admins can manage booking_lifecycle"
  ON public.booking_lifecycle FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Company users can view their booking_lifecycle"
  ON public.booking_lifecycle FOR SELECT
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- Booking Lifecycle Log RLS
CREATE POLICY "Admins can manage booking_lifecycle_log"
  ON public.booking_lifecycle_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Company users can view their booking_lifecycle_log"
  ON public.booking_lifecycle_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.booking_lifecycle bl
    WHERE bl.id = booking_lifecycle_log.lifecycle_id
      AND bl.empresa_id = public.get_user_empresa_id(auth.uid())
  ));

-- updated_at trigger
CREATE TRIGGER update_booking_lifecycle_updated_at
  BEFORE UPDATE ON public.booking_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
