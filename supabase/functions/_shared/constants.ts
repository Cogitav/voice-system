import type { ConversationState } from './types.ts';

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
  idle_conversation_minutes: 24 * 60,
  max_slots_per_page: 5,
} as const;

export const SUPPORTED_LLM_PROVIDERS = ['openai', 'gemini', 'anthropic'] as const;

export const DEFAULT_LLM_PROVIDER = 'openai';
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
export const FALLBACK_LLM_PROVIDER = 'openai';
export const FALLBACK_LLM_MODEL = 'gpt-4o-mini';

export const BOOKING_STATES_THAT_ALLOW_CHANGES = [
  'collecting_service',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
] as const satisfies readonly ConversationState[];

export const CONVERSATION_TIMEZONE_DEFAULT = 'Europe/Lisbon';

// ─── State Machine ──────────────────────────────────────────────────────────

// Phase 1: transition validation only recognizes the official runtime states.
export const VALID_TRANSITIONS = {
  'idle': ['collecting_service', 'collecting_data', 'human_handoff'],
  'collecting_service': [
    'collecting_data',
    'awaiting_slot_selection',
    'human_handoff',
  ],
  'collecting_data': [
    'collecting_service',
    'awaiting_slot_selection',
    'awaiting_confirmation',
    'human_handoff',
  ],
  'awaiting_slot_selection': [
    'awaiting_confirmation',
    'collecting_data',
    'human_handoff',
  ],
  'awaiting_confirmation': [
    'booking_processing',
    'collecting_data',
    'awaiting_slot_selection',
    'human_handoff',
  ],
  'booking_processing': [
    'completed',
    'awaiting_slot_selection',
    'collecting_data',
    'human_handoff',
  ],
  'completed': ['collecting_data', 'human_handoff'],
  'human_handoff': [],
} as const satisfies Record<ConversationState, readonly ConversationState[]>;

// ─── Response Directive ─────────────────────────────────────────────────────

export const CREATIVE_FREEDOM_BY_STATE = {
  'idle': 'high',
  'collecting_service': 'medium',
  'collecting_data': 'low',
  'awaiting_slot_selection': 'low',
  'awaiting_confirmation': 'none',
  'booking_processing': 'none',
  'completed': 'high',
  'human_handoff': 'low',
} as const satisfies Record<ConversationState, 'none' | 'low' | 'medium' | 'high'>;

export const MAX_SENTENCES_BY_STATE = {
  'idle': 4,
  'collecting_service': 4,
  'collecting_data': 3,
  'awaiting_slot_selection': 6,
  'awaiting_confirmation': 3,
  'booking_processing': 0,
  'completed': 4,
  'human_handoff': 3,
} as const satisfies Record<ConversationState, number>;

// ─── Emotion Detection ──────────────────────────────────────────────────────

export const EMOTION_KEYWORDS = {
  urgent: [
    'urgente', 'urgência', 'dor', 'dói', 'não aguento',
    'emergência', 'já não consigo', 'terrível', 'insuportável',
    'preciso já', 'o mais rápido', 'hoje se possível',
    'quanto antes', 'não pode esperar',
    'preciso de consulta', 'tenho visita marcada',
  ],
  frustrated: [
    'ninguém atende', 'estou farto', 'já tentei', 'não funciona',
    'péssimo', 'horrível', 'isto é ridículo', 'nunca mais',
    'há horas', 'impossível', 'sempre a mesma coisa',
  ],
  anxious: [
    'estou preocupado', 'tenho medo', 'será grave', 'nervoso',
    'não sei o que fazer', 'ansioso', 'receio', 'assustado',
    'primeira vez', 'nunca fiz isto',
  ],
  friendly: [
    'obrigado', 'por favor', 'excelente', 'perfeito',
    'ótimo', 'maravilha', 'fantástico', 'adorei', 'top',
  ],
} as const;

export const EMOTION_PERSISTENCE_RULES = {
  update_threshold: 0.7,
  decay_after_messages: 3,
  frustration_handoff_threshold: 3,
  urgent_never_decays: true,
} as const;

// ─── Handoff Rules ──────────────────────────────────────────────────────────

export const HANDOFF_RULES = {
  system_error_threshold: 3,
  frustration_threshold: 3,
  explicit_request: true,
  validation_triggers_handoff: false,
  correction_triggers_handoff: false,
  reset_on_recovery: true,
} as const;

// ─── Error Messages ─────────────────────────────────────────────────────────

export const ERROR_MESSAGES = {
  validation: {
    email_attempt_1: 'O email que indicou parece ter um erro. Pode confirmar?',
    email_attempt_2: 'Preciso de um email válido para a confirmação, por exemplo nome@email.pt',
    phone_attempt_1: 'O número de telefone não parece completo. Pode verificar?',
    phone_attempt_2: 'Preciso de um número válido com 9 dígitos, por exemplo 912345678',
    date_past: 'Essa data já passou. Pode indicar uma data futura?',
    date_ambiguous: "Não consegui perceber a data. Pode indicar o dia, por exemplo 'dia 20' ou 'próxima segunda'?",
  },
  system: {
    retry: 'Houve um pequeno problema. A tentar novamente...',
    slot_conflict: 'Esse horário acabou de ser ocupado. Vou mostrar outras opções disponíveis.',
    general_failure: 'Ocorreu um problema no sistema. Vou transferir para um colega que pode ajudar.',
    llm_failure: 'Peço desculpa, não consegui processar. Pode repetir de outra forma?',
  },
  correction: {
    acknowledged: 'Sem problema, vamos alterar.',
  },
} as const;

// ─── LLM Guardrails ─────────────────────────────────────────────────────────

export const GLOBAL_MUST_NOT: string[] = [
  'Nunca inventar informação não fornecida pelo sistema',
  'Nunca prometer contacto da equipa se não foi instruído',
  'Nunca inventar preços, horários ou disponibilidades',
  'Nunca sugerir serviços que não existam na lista fornecida',
  'Nunca dizer que o agendamento está feito sem confirm_booking',
  'Nunca pedir dados que já estão em confirmed_data',
  'Nunca dar diagnósticos médicos, legais ou financeiros',
  'Nunca mencionar que é uma IA ou chatbot salvo se perguntado',
  "Nunca dizer 'infelizmente não consigo' — sempre redirecionar",
];

// ─── Validation Rules ───────────────────────────────────────────────────────

export const NAME_RULES = {
  min_length: 1,
  max_length: 100,
  must_contain_letter: true,
  single_word_valid: true,
  trim_whitespace: true,
  capitalize_first: true,
} as const;

export const EMAIL_VALIDATION = {
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  suspicious_tlds: ['cococ', 'con', 'coom', 'comm', 'gmai', 'gmial'],
} as const;

// ─── Context Reset Rules ────────────────────────────────────────────────────

export const CONTEXT_RESET_RULES = {
  change_date: {
    clear: ['preferred_date', 'date_parsed', 'conflict_suggestions', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone', 'service_id'],
  },
  change_time: {
    clear: ['time_parsed', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone', 'service_id', 'preferred_date'],
  },
  change_service: {
    clear: ['service_id', 'preferred_date', 'conflict_suggestions', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone'],
  },
  change_personal_data: {
    clear: [] as string[],
    preserve: ['ALL'],
  },
  change_slot: {
    clear: ['selected_datetime', 'slot_confirmed'],
    preserve: ['ALL_EXCEPT_CLEARED'],
  },
  restart_flow: {
    clear: ['ALL'],
    preserve: [] as string[],
  },
} as const;

// ─── Extraction Contract ────────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLD = 0.6;
