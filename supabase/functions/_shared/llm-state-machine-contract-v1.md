# LLM ↔ State Machine Contract — Source of Truth v1.0

> **Single reference document for implementation.**
> All decisions are final. No ambiguity. No alternatives.
> This document governs all development of the conversational core.

---

## 0. CONTEXT

Multi-tenant SaaS platform for AI-powered customer service for SMBs.
Stack: Supabase Edge Functions (TypeScript/Deno), OpenAI GPT-4o-mini (+ Gemini, Claude supported).
The chat's PRIMARY objective is ALWAYS booking. Everything else is secondary.

---

## 1. FILE MAP

### Files to CREATE (new)

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/state-machine.ts` | State machine with valid transitions |
| `supabase/functions/_shared/extraction-contract.ts` | LLM extraction contract + parsing |
| `supabase/functions/_shared/response-directive.ts` | Code → LLM response contract |
| `supabase/functions/_shared/error-handler.ts` | Error classification and recovery |

### Files to MODIFY (existing)

| File | Changes |
|------|---------|
| `supabase/functions/_shared/types.ts` | Add all new TypeScript interfaces and types |
| `supabase/functions/_shared/constants.ts` | Add all new constants |
| `supabase/functions/_shared/validators.ts` | Adjust validation rules (name, email, phone) |
| `supabase/functions/_shared/context-manager.ts` | Add error_context, partial reset, accumulation |
| `supabase/functions/chat-ai-response/index.ts` | Refactor orchestrator to use new modules |

### Files that MUST NOT be touched

| File | Reason |
|------|--------|
| `supabase/functions/booking-v2/index.ts` | Booking engine works — do not modify |
| `supabase/functions/check-availability/index.ts` | Availability engine works — do not modify |
| Supabase DB schema / migrations | Context is JSONB — no DB migration needed |

---

## 2. TYPES (types.ts)

### 2.1 Conversation States

```typescript
type ConversationState =
  | 'idle'
  | 'collecting_service'
  | 'collecting_data'
  | 'checking_availability'
  | 'awaiting_slot_selection'
  | 'awaiting_confirmation'
  | 'booking_processing'
  | 'completed'
  | 'human_handoff';
```

### 2.2 LLM Extraction Contract

```typescript
interface LLMExtraction {
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

type ExtractedIntent =
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

interface EmotionalContext {
  tone: 'neutral' | 'urgent' | 'frustrated' | 'anxious' | 'friendly';
  keywords: string[];
  detected_by: 'deterministic' | 'llm';
}

interface SlotSelection {
  method: 'by_number' | 'by_time' | 'by_date' | 'by_ordinal' | 'by_description';
  value: string;
}

type ConfirmationSignal =
  | 'CONFIRM'
  | 'DENY'
  | 'CHANGE_DATE'
  | 'CHANGE_TIME'
  | 'CHANGE_SERVICE'
  | 'CHANGE_DATA'
  | 'QUESTION';
```

### 2.3 Response Directive Contract

```typescript
interface ResponseDirective {
  must_say: MustSayBlock[];
  must_not: string[];
  creative_freedom: 'none' | 'low' | 'medium' | 'high';
  tone: ToneDirective;
  emotional_context: EmotionalContext | null;
  current_state: ConversationState;
  confirmed_data: ConfirmedDataSnapshot;
  language: string;
}

interface MustSayBlock {
  type: MustSayType;
  content: string | string[] | SlotPresentation[];
  priority: number;
}

type MustSayType =
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

interface SlotPresentation {
  slot_number: number;
  date: string;
  time_start: string;
  time_end: string;
  display: string;
}

interface ToneDirective {
  base: 'professional' | 'friendly' | 'warm' | 'formal';
  adapt_to_emotion: boolean;
  max_emoji: number;
  max_sentences: number;
}

interface ConfirmedDataSnapshot {
  service_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  date: string | null;
  time_start: string | null;
  time_end: string | null;
}
```

### 2.4 Error System

```typescript
type ErrorCategory =
  | 'validation_issue'
  | 'user_correction'
  | 'system_error';

interface ValidationIssue {
  category: 'validation_issue';
  field: string;
  raw_value: string;
  error_reason: string;
  attempt: number;
  max_attempts: number;
}

interface UserCorrection {
  category: 'user_correction';
  correction_type: CorrectionType;
  fields_affected: string[];
  preserve_fields: string[];
}

type CorrectionType =
  | 'change_date'
  | 'change_time'
  | 'change_service'
  | 'change_personal_data'
  | 'change_slot'
  | 'restart_flow';

interface SystemError {
  category: 'system_error';
  error_type: SystemErrorType;
  recoverable: boolean;
  recovery_action: RecoveryAction;
}

type SystemErrorType =
  | 'availability_api_failure'
  | 'database_error'
  | 'booking_creation_failed'
  | 'slot_conflict'
  | 'service_unavailable'
  | 'llm_failure'
  | 'llm_invalid_response'
  | 'unknown';

type RecoveryAction =
  | 'retry_once'
  | 'ask_new_date'
  | 'suggest_alternatives'
  | 'apologize_and_retry'
  | 'handoff';

interface FieldValidation {
  field: string;
  status: 'not_provided' | 'valid' | 'invalid';
  raw_value: string | null;
  error_reason: string | null;
}

interface FieldAttemptTracker {
  customer_email: number;
  customer_phone: number;
  customer_name: number;
  preferred_date: number;
}

interface ErrorState {
  consecutive_errors: number;
  field_attempts: FieldAttemptTracker;
  frustration_consecutive: number;
  last_error_type: SystemErrorType | null;
  last_error_timestamp: string | null;
}
```

---

## 3. CONSTANTS (constants.ts)

### 3.1 State Machine Transitions

```typescript
const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  'idle': ['collecting_service', 'human_handoff'],
  'collecting_service': [
    'collecting_data',
    'checking_availability',
    'idle',
    'human_handoff'
  ],
  'collecting_data': [
    'checking_availability',
    'collecting_service',
    'human_handoff'
  ],
  'checking_availability': [
    'awaiting_slot_selection',
    'awaiting_confirmation',
    'collecting_data'
  ],
  'awaiting_slot_selection': [
    'awaiting_confirmation',
    'checking_availability',
    'collecting_service',
    'collecting_data',
    'human_handoff'
  ],
  'awaiting_confirmation': [
    'booking_processing',
    'collecting_data',
    'awaiting_slot_selection',
    'collecting_service',
    'human_handoff'
  ],
  'booking_processing': [
    'completed',
    'awaiting_slot_selection',
    'collecting_data'
  ],
  'completed': ['idle', 'human_handoff'],
  'human_handoff': []
};
```

NOTE: collecting_service → idle ONLY on EXPLICIT_RESTART intent.
NOTE: collecting_service → checking_availability when service_id resolved + user requests availability.

### 3.2 Creative Freedom by State

```typescript
const CREATIVE_FREEDOM_BY_STATE: Record<ConversationState, 'none' | 'low' | 'medium' | 'high'> = {
  'idle': 'high',
  'collecting_service': 'medium',
  'collecting_data': 'low',
  'checking_availability': 'none',
  'awaiting_slot_selection': 'low',
  'awaiting_confirmation': 'none',
  'booking_processing': 'none',
  'completed': 'high',
  'human_handoff': 'low'
};
```

States with creative_freedom: 'none' use hardcoded templates. NO LLM call.

### 3.3 Max Sentences by State

```typescript
const MAX_SENTENCES_BY_STATE: Record<ConversationState, number> = {
  'idle': 4,
  'collecting_service': 4,
  'collecting_data': 3,
  'checking_availability': 0,
  'awaiting_slot_selection': 6,
  'awaiting_confirmation': 3,
  'booking_processing': 0,
  'completed': 4,
  'human_handoff': 3
};
```

### 3.4 Emotion Keywords

```typescript
const EMOTION_KEYWORDS = {
  urgent: [
    "urgente", "urgência", "dor", "dói", "não aguento",
    "emergência", "já não consigo", "terrível", "insuportável",
    "preciso já", "o mais rápido", "hoje se possível",
    "quanto antes", "não pode esperar",
    "preciso de consulta", "tenho visita marcada"
  ],
  frustrated: [
    "ninguém atende", "estou farto", "já tentei", "não funciona",
    "péssimo", "horrível", "isto é ridículo", "nunca mais",
    "há horas", "impossível", "sempre a mesma coisa"
  ],
  anxious: [
    "estou preocupado", "tenho medo", "será grave", "nervoso",
    "não sei o que fazer", "ansioso", "receio", "assustado",
    "primeira vez", "nunca fiz isto"
  ],
  friendly: [
    "obrigado", "por favor", "excelente", "perfeito",
    "ótimo", "maravilha", "fantástico", "adorei", "top"
  ]
};
```

### 3.5 Emotion Persistence Rules

```typescript
const EMOTION_PERSISTENCE_RULES = {
  update_threshold: 0.7,
  decay_after_messages: 3,
  frustration_handoff_threshold: 3,
  urgent_never_decays: true
};
```

### 3.6 Handoff Rules

```typescript
const HANDOFF_RULES = {
  system_error_threshold: 3,
  frustration_threshold: 3,
  explicit_request: true,
  validation_triggers_handoff: false,
  correction_triggers_handoff: false,
  reset_on_recovery: true
};
```

### 3.7 Error Messages

```typescript
const ERROR_MESSAGES = {
  validation: {
    email_attempt_1: "O email que indicou parece ter um erro. Pode confirmar?",
    email_attempt_2: "Preciso de um email válido para a confirmação, por exemplo nome@email.pt",
    phone_attempt_1: "O número de telefone não parece completo. Pode verificar?",
    phone_attempt_2: "Preciso de um número válido com 9 dígitos, por exemplo 912345678",
    date_past: "Essa data já passou. Pode indicar uma data futura?",
    date_ambiguous: "Não consegui perceber a data. Pode indicar o dia, por exemplo 'dia 20' ou 'próxima segunda'?"
  },
  system: {
    retry: "Houve um pequeno problema. A tentar novamente...",
    slot_conflict: "Esse horário acabou de ser ocupado. Vou mostrar outras opções disponíveis.",
    general_failure: "Ocorreu um problema no sistema. Vou transferir para um colega que pode ajudar.",
    llm_failure: "Peço desculpa, não consegui processar. Pode repetir de outra forma?"
  },
  correction: {
    acknowledged: "Sem problema, vamos alterar."
  }
};
```

### 3.8 Global Must Not

```typescript
const GLOBAL_MUST_NOT: string[] = [
  "Nunca inventar informação não fornecida pelo sistema",
  "Nunca prometer contacto da equipa se não foi instruído",
  "Nunca inventar preços, horários ou disponibilidades",
  "Nunca sugerir serviços que não existam na lista fornecida",
  "Nunca dizer que o agendamento está feito sem confirm_booking",
  "Nunca pedir dados que já estão em confirmed_data",
  "Nunca dar diagnósticos médicos, legais ou financeiros",
  "Nunca mencionar que é uma IA ou chatbot salvo se perguntado",
  "Nunca dizer 'infelizmente não consigo' — sempre redirecionar"
];
```

### 3.9 Name Validation Rules

```typescript
const NAME_RULES = {
  min_length: 1,
  max_length: 100,
  must_contain_letter: true,
  single_word_valid: true,
  trim_whitespace: true,
  capitalize_first: true
};
```

### 3.10 Email Validation

```typescript
const EMAIL_VALIDATION = {
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  suspicious_tlds: ['cococ', 'con', 'coom', 'comm', 'gmai', 'gmial']
};
```

### 3.11 Context Reset Rules

```typescript
const CONTEXT_RESET_RULES: Record<CorrectionType, { clear: string[]; preserve: string[] }> = {
  'change_date': {
    clear: ['preferred_date', 'date_parsed', 'conflict_suggestions', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone', 'service_id']
  },
  'change_time': {
    clear: ['time_parsed', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone', 'service_id', 'preferred_date']
  },
  'change_service': {
    clear: ['service_id', 'preferred_date', 'conflict_suggestions', 'selected_datetime', 'slot_confirmed'],
    preserve: ['customer_name', 'customer_email', 'customer_phone']
  },
  'change_personal_data': {
    clear: [],
    preserve: ['ALL']
  },
  'change_slot': {
    clear: ['selected_datetime', 'slot_confirmed'],
    preserve: ['ALL_EXCEPT_CLEARED']
  },
  'restart_flow': {
    clear: ['ALL'],
    preserve: []
  }
};
```

---

## 4. STATE MACHINE (state-machine.ts — new file)

### 4.1 Complete Transition Map
idle → collecting_service
idle → human_handoff
collecting_service → collecting_data
collecting_service → checking_availability  [service_id resolved + availability request]
collecting_service → idle                   [ONLY on EXPLICIT_RESTART]
collecting_service → human_handoff
collecting_data → checking_availability
collecting_data → collecting_service
collecting_data → human_handoff
checking_availability → awaiting_slot_selection
checking_availability → awaiting_confirmation
checking_availability → collecting_data
awaiting_slot_selection → awaiting_confirmation
awaiting_slot_selection → checking_availability
awaiting_slot_selection → collecting_service
awaiting_slot_selection → collecting_data
awaiting_slot_selection → human_handoff
awaiting_confirmation → booking_processing
awaiting_confirmation → collecting_data
awaiting_confirmation → awaiting_slot_selection
awaiting_confirmation → collecting_service
awaiting_confirmation → human_handoff
booking_processing → completed
booking_processing → awaiting_slot_selection
booking_processing → collecting_data
completed → idle
completed → human_handoff

### 4.2 Non-Negotiable Rules

1. No direct transition from idle to collecting_data — service must be resolved first.
2. checking_availability is NEVER visible to user — internal state only.
3. human_handoff is accessible from any state — only for legitimate reasons.
4. Any transition NOT listed above is INVALID.
5. collecting_service → idle ONLY on EXPLICIT_RESTART intent.

---

## 5. EXTRACTION CONTRACT (extraction-contract.ts — new file)

### 5.1 LLM Extraction Rules

The LLM extracts. The code validates. Never the reverse.

The LLM ALWAYS returns the same format. If it did not find a field, it returns null.

### 5.2 Field-Specific Rules

- Names: Accept single-word names. Never reject for being short. Never invent surname.
- Email: Extract as-is. LLM does NOT validate. Code validates afterwards.
- Phone: Extract digits as written. Code validates format.
- Dates: ALWAYS save original text in date_raw/time_raw. Only fill date_parsed if high confidence.
- Service: service_keywords = relevant words. service_id = only if direct match with known services.
- Unmentioned fields: ALWAYS null.

### 5.3 Confidence Threshold

```typescript
const CONFIDENCE_THRESHOLD = 0.6;
// Below this → request clarification
// MustSayType: 'clarify'
```

### 5.4 Post-Extraction Validation

| Field | Validation | If invalid |
|-------|-----------|-----------|
| customer_name | length >= 1 AND contains letter | Ask again gently |
| customer_email | regex + suspicious_tlds check | Inform user specifically |
| customer_phone | 9 digits, starts 2/3/9 (PT) | Ask again |
| date_parsed | Valid ISO + future date | Use date_raw to clarify |
| service_id | Exists in company services | Use keywords to suggest |

### 5.5 Field Validation Distinction

- not_provided: field is null → ask normally
- invalid: field has value but fails validation → inform specific error
- valid: field accepted → save to context

Invalid fields NEVER increment consecutive_errors.

---

## 6. RESPONSE DIRECTIVE (response-directive.ts — new file)

### 6.1 Core Principle

Code decides WHAT. LLM decides HOW TO SAY IT. Never the reverse.

### 6.2 must_say Serialization

must_say blocks MUST be sorted by priority before serialization to LLM.

### 6.3 Prompt Template
Function: Generate response for customer service assistant.
DIRECTIVE (MANDATORY):

State: {current_state}
Must communicate: {must_say — serialized, sorted by priority}
Confirmed data: {confirmed_data}
Tone: {tone.base}, max emoji: {tone.max_emoji}, max sentences: {tone.max_sentences}
Creative freedom: {creative_freedom}
Emotional context: {emotional_context}

PROHIBITED:
{must_not — list}
RULES:

Say EVERYTHING in must_say, in priority order
Do NOT say ANYTHING in must_not
Do NOT invent information
Do NOT repeat already confirmed data
Respond in {language}


### 6.4 Hardcoded Templates (creative_freedom: 'none')

```typescript
const HARDCODED_TEMPLATES = {
  awaiting_confirmation: (data: ConfirmedDataSnapshot) =>
    `Confirma o agendamento?\n\n` +
    `📅 ${data.date}\n` +
    `⏰ ${data.time_start} - ${data.time_end}\n` +
    `📋 ${data.service_name}\n` +
    `👤 ${data.customer_name}\n` +
    `📧 ${data.customer_email}\n` +
    `📞 ${data.customer_phone ?? 'N/A'}`,

  booking_confirmed: (data: ConfirmedDataSnapshot) =>
    `✅ Agendamento confirmado!\n\n` +
    `📅 ${data.date}\n` +
    `⏰ ${data.time_start} - ${data.time_end}\n` +
    `📋 ${data.service_name}\n\n` +
    `Enviámos uma confirmação para ${data.customer_email}.`
};
```

---

## 7. ERROR HANDLER (error-handler.ts — new file)

### 7.1 Three Categories

| Category | Increments consecutive_errors? | Triggers handoff? |
|----------|-------------------------------|-------------------|
| validation_issue | NEVER | NEVER |
| user_correction | NEVER | NEVER |
| system_error | YES | At threshold (3) |

### 7.2 Validation Issue Handling

- Per-field attempt counter (max 3)
- Attempt 1: specific gentle message
- Attempt 2: direct message with example
- Attempt 3: accept and advance

### 7.3 User Correction Handling

- Partial context reset using CONTEXT_RESET_RULES
- Only clear affected fields
- Preserve everything else
- State transition per Section 4 map

### 7.4 System Error Handling

- Increment consecutive_errors by 1
- Execute recovery_action
- If recovery succeeds → reset consecutive_errors to 0
- If consecutive_errors >= 3 → handoff

---

## 8. EDGE CASES

### EC1: Single-word name
- "Tay", "João" → customer_name: "Tay" → VALID
- Validation: length >= 1 AND contains at least one letter
- Never ask for surname

### EC2: Invalid email
- Extract as-is, code validates
- Attempt 1: "O email que indicou parece ter um erro. Pode confirmar?"
- Attempt 2: "Preciso de um email válido para a confirmação, por exemplo nome@email.pt"
- Attempt 3: accept and advance
- "tiago arroba gmail ponto com" → LLM extracts as "tiago@gmail.com" (legitimate conversion)

### EC3: Next availability with no date
- service_id resolved + no preferred_date → fetch next 5 business days of slots
- Do NOT require personal data before showing availability
- Flow: show slots → user selects → THEN collect personal data → confirm

### EC4: User changes mind mid-flow
- Use CONTEXT_RESET_RULES
- Clear only affected fields
- Preserve everything not contested
- user_correction category — NEVER increment errors

### EC5: Question during awaiting_confirmation
- Detect via confirmation === 'QUESTION'
- Do NOT leave awaiting_confirmation state
- Answer from context
- Re-present confirmation with hardcoded template

### EC6: Off-topic message
- Never destroy context, never change state, never increment errors
- Gentle redirection adapted to current state
- More advanced in flow = more direct redirection

### EC7: Time without date
- Has active slots? → match against available slots
- Has preferred_date but no suggestions? → keep date + new time → checking_availability
- No date, no suggestions → "Às {time}h, ótimo! Mas para que dia?"
- NEVER assume today

### EC8: Data across multiple messages
- Context manager ACCUMULATES
- After each message, check what is missing
- If multiple fields missing, ask for ALL in one message
- Accept partial input without complaint

---

## 9. IMPLEMENTATION ORDER
PHASE 0 → types.ts → constants.ts → validators.ts
PHASE 1 → context-manager.ts (refactor)
PHASE 2 → state-machine.ts (new)
PHASE 3 → extraction-contract.ts (new)
PHASE 4 → response-directive.ts (new)
PHASE 5 → error-handler.ts (new)
PHASE 6 → chat-ai-response/index.ts (refactor in 5 sub-steps)
PHASE 7 → end-to-end tests

Each phase only starts when the previous one compiles and tests pass.

Sub-steps for Phase 6:
- 6.1a: Replace intent classification with extraction-contract.ts
- 6.1b: Add state machine — add collecting_service as real state
- 6.1c: Replace response_hint with ResponseDirective
- 6.1d: Integrate error system
- 6.1e: Integrate EC3 (availability before personal data)

---

## 10. ACCEPTANCE TESTS

Test 1: "boa noite tenho uma dor terrível"
Expected: Empathy + service suggestion. NEVER "a equipa vai contactar". State: collecting_service.

Test 2: "quando há disponibilidade para consulta?"
Expected: Shows slots. Does NOT ask for name first. State: collecting_service → checking_availability.

Test 3: "Tiago G, email tiago@gmail.cococ e 915686562"
Expected: customer_name "Tiago G" valid. Email flagged specifically. Phone valid. No handoff.

Test 4: "tenho dor, o meu nome é Tay"
Expected: customer_name "Tay" accepted. Flow continues. NEVER asks for surname. NEVER handoff.

Test 5: Question during awaiting_confirmation
Expected: Answer + re-present confirmation. State unchanged.

Test 6: Off-topic during collecting_data
Expected: Gentle redirect. Context preserved. No errors incremented.

Test 7: "às 15h" with no date in context
Expected: "Às 15h, ótimo! Mas para que dia?" NEVER assume today.

Test 8: Data across 4 separate messages
Expected: Each field accumulated. After name collected, asks for email AND phone together.

Test 9: System error recovery
Expected: consecutive_errors increments. Recovery attempted. If success → resets to 0.
