export type ConversationState =
  | 'idle'
  | 'collecting_service'
  | 'collecting_data'
  | 'checking_availability'
  | 'awaiting_slot_selection'
  | 'awaiting_confirmation'
  | 'booking_processing'
  | 'completed'
  | 'human_handoff';

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

// ─── Extraction Contract ────────────────────────────────────────────────────

export type ExtractedIntent =
  | 'BOOKING_NEW'
  | 'RESCHEDULE'
  | 'CANCEL'
  | 'INFO_REQUEST'
  | 'HUMAN_REQUEST'
  | 'CONFIRMATION'
  | 'SLOT_SELECTION'
  | 'DATE_CHANGE'
  | 'CORRECTION'
  | 'EXPLICIT_RESTART'
  | 'OFF_TOPIC'
  | 'UNCLEAR';

export interface EmotionalContext {
  tone: 'neutral' | 'urgent' | 'frustrated' | 'anxious' | 'friendly';
  keywords: string[];
  detected_by: 'deterministic' | 'llm';
}

export interface SlotSelection {
  method: 'by_number' | 'by_time' | 'by_date' | 'by_ordinal' | 'by_description';
  value: string;
}

export type ConfirmationSignal =
  | 'CONFIRM'
  | 'DENY'
  | 'CHANGE_DATE'
  | 'CHANGE_TIME'
  | 'CHANGE_SERVICE'
  | 'CHANGE_DATA'
  | 'QUESTION';

export interface LLMExtraction {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_keywords: string[] | null;
  service_id: string | null;
  date_raw: string | null;
  time_raw: string | null;
  date_parsed: string | null;
  time_parsed: string | null;
  intent: ExtractedIntent;
  emotional_context: EmotionalContext | null;
  slot_selection: SlotSelection | null;
  confirmation: ConfirmationSignal | null;
  confidence: number;
  raw_message: string;
}

// ─── Response Directive ─────────────────────────────────────────────────────

export type MustSayType =
  | 'ask_field'
  | 'ask_multiple_fields'
  | 'ask_service'
  | 'ask_date'
  | 'present_slots'
  | 'ask_confirmation'
  | 'confirm_booking'
  | 'report_error'
  | 'inform'
  | 'redirect'
  | 'suggest_services'
  | 'no_availability'
  | 'handoff_notice'
  | 'clarify';

export interface SlotPresentation {
  slot_number: number;
  date: string;
  time_start: string;
  time_end: string;
  display: string;
}

export interface MustSayBlock {
  type: MustSayType;
  content: string | string[] | SlotPresentation[];
  priority: number;
}

export interface ToneDirective {
  base: 'professional' | 'friendly' | 'warm' | 'formal';
  adapt_to_emotion: boolean;
  max_emoji: number;
  max_sentences: number;
}

export interface ConfirmedDataSnapshot {
  service_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  date: string | null;
  time_start: string | null;
  time_end: string | null;
}

export interface ResponseDirective {
  must_say: MustSayBlock[];
  must_not: string[];
  creative_freedom: 'none' | 'low' | 'medium' | 'high';
  tone: ToneDirective;
  emotional_context: EmotionalContext | null;
  current_state: ConversationState;
  confirmed_data: ConfirmedDataSnapshot;
  language: string;
}

// ─── Error System ───────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'validation_issue'
  | 'user_correction'
  | 'system_error';

export type CorrectionType =
  | 'change_date'
  | 'change_time'
  | 'change_service'
  | 'change_personal_data'
  | 'change_slot'
  | 'restart_flow';

export type SystemErrorType =
  | 'availability_api_failure'
  | 'database_error'
  | 'booking_creation_failed'
  | 'slot_conflict'
  | 'service_unavailable'
  | 'llm_failure'
  | 'llm_invalid_response'
  | 'unknown';

export type RecoveryAction =
  | 'retry_once'
  | 'ask_new_date'
  | 'suggest_alternatives'
  | 'apologize_and_retry'
  | 'handoff';

export interface ValidationIssue {
  category: 'validation_issue';
  field: string;
  raw_value: string;
  error_reason: string;
  attempt: number;
  max_attempts: number;
}

export interface UserCorrection {
  category: 'user_correction';
  correction_type: CorrectionType;
  fields_affected: string[];
  preserve_fields: string[];
}

export interface SystemError {
  category: 'system_error';
  error_type: SystemErrorType;
  recoverable: boolean;
  recovery_action: RecoveryAction;
}

export interface FieldValidation {
  field: string;
  status: 'not_provided' | 'valid' | 'invalid';
  raw_value: string | null;
  error_reason: string | null;
}

export interface FieldAttemptTracker {
  customer_email: number;
  customer_phone: number;
  customer_name: number;
  preferred_date: number;
}

export interface ErrorState {
  consecutive_errors: number;
  field_attempts: FieldAttemptTracker;
  frustration_consecutive: number;
  last_error_type: SystemErrorType | null;
  last_error_timestamp: string | null;
}
