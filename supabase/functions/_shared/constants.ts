export const CREDIT_COSTS = {
  message: 1,
  booking_create: 5,
  booking_reschedule: 3,
  booking_cancel: 1,
  email_send: 2,
  knowledge_lookup: 1,
  voice_minute: 10,
  agent_test: 0,
} as const;

export const CREDIT_THRESHOLDS = {
  soft: 0.70,
  warning: 0.85,
  critical: 0.95,
} as const;

export const TIMEOUTS = {
  llm_request_ms: 10000,
  availability_check_ms: 5000,
  booking_execution_ms: 8000,
} as const;

export const LIMITS = {
  llm_retries: 2,
  booking_suggestions: 5,
  consecutive_errors_before_handoff: 3,
  idle_conversation_minutes: 30,
  max_slots_per_page: 5,
} as const;

export const SUPPORTED_LLM_PROVIDERS = ['openai', 'gemini', 'anthropic'] as const;

export const DEFAULT_LLM_PROVIDER = 'openai';
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
export const FALLBACK_LLM_PROVIDER = 'openai';
export const FALLBACK_LLM_MODEL = 'gpt-4o-mini';

export const BOOKING_STATES_THAT_ALLOW_CHANGES = [
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
] as const;

export const CONVERSATION_TIMEZONE_DEFAULT = 'Europe/Lisbon';
