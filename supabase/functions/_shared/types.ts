export type ConversationState =
  | 'idle'
  | 'collecting_data'
  | 'awaiting_slot_selection'
  | 'awaiting_confirmation'
  | 'booking_processing'
  | 'completed'
  | 'reschedule_pending'
  | 'reschedule_confirm'
  | 'cancel_pending'
  | 'human_handoff'
  | 'error';

export type Intent =
  | 'BOOKING_NEW'
  | 'RESCHEDULE'
  | 'CANCEL'
  | 'INFO_REQUEST'
  | 'HUMAN_REQUEST'
  | 'OTHER';

export interface SlotSuggestion {
  start: string;
  end: string;
  resource_id: string;
  display_label: string;
}

export interface ConfirmedSnapshot {
  service_id: string;
  service_name: string;
  start: string;
  end: string;
  resource_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  agendamento_id: string | null;
}

export interface ConversationContext {
  state: ConversationState;
  previous_state: ConversationState | null;
  current_intent: Intent | null;
  service_id: string | null;
  service_name: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  available_slots: SlotSuggestion[];
  selected_slot: SlotSuggestion | null;
  slots_page: number;
  slots_generated_for_date: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_reason: string | null;
  booking_lifecycle_id: string | null;
  execution_id: string | null;
  agendamento_id: string | null;
  reschedule_from_agendamento_id: string | null;
  reschedule_new_date: string | null;
  reschedule_new_time: string | null;
  reschedule_new_slot: SlotSuggestion | null;
  confirmed_snapshot: ConfirmedSnapshot | null;
  fields_collected: string[];
  fields_missing: string[];
  consecutive_errors: number;
  last_error: string | null;
  language: string;
  context_version: number;
  updated_at: string;
}

export interface SchedulingService {
  id: string;
  empresa_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  status: string;
  bookable: boolean;
  price: number | null;
  currency: string;
}

export interface CustomerData {
  name: string;
  email: string;
  phone: string | null;
  reason: string | null;
}

export interface BookingResult {
  success: boolean;
  agendamento_id: string | null;
  error: string | null;
  error_code: string | null;
}

export interface CreditCheck {
  allowed: boolean;
  remaining: number;
  reason: string | null;
}

export interface LLMRequest {
  system_prompt: string;
  user_message: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | 'json';
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
}
