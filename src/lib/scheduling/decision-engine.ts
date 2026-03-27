/**
 * Scheduling Decision Engine - Frontend Module
 * 
 * PRODUCTION-GRADE: Provides scheduling state determination and
 * behavioral rules for AI agents. This is the frontend counterpart
 * to the backend scheduling-actions.ts module.
 * 
 * CRITICAL SAFETY RULES:
 * 1. AI MUST NEVER confirm appointments without backend success
 * 2. If backend fails, AI MUST use "request registered" language
 * 3. Email is MANDATORY for all scheduling operations
 */

/**
 * Scheduling Decision Engine
 * 
 * PRODUCTION-GRADE: Determines the scheduling capability state for a company.
 * 
 * CRITICAL SAFETY RULES:
 * 1. AI must NEVER confirm appointments without backend success
 * 2. Email is MANDATORY for any scheduling action
 * 3. On any error, treat as "request registered" not "confirmed"
 */

import {
  SchedulingState,
  SchedulingContext,
  SchedulingProvider,
  SchedulingRules,
  SchedulingRequestData,
  SchedulingValidationResult,
  SCHEDULING_DATA_REQUIREMENTS,
} from './types';

// =============================================
// Service Permissions Interface
// =============================================

export interface SchedulingServicePermissions {
  service_scheduling_enabled: boolean;
  service_email_enabled: boolean;
}

// =============================================
// Scheduling Rules per State (PRODUCTION-GRADE)
// =============================================

const RULES_REAL_TIME_SCHEDULING_ACTIVE: SchedulingRules = {
  canAskForDetails: true,
  canConfirmAppointment: true, // BUT ONLY after backend success
  canCollectPreferences: true,
  mustUseCautionLanguage: true, // Always cautious until confirmation
  mustWaitForBackendConfirmation: true, // CRITICAL
  requiresEmail: true, // MANDATORY
  allowedPhrases: [
    'Só um momento, estou a verificar disponibilidade…',
    'O agendamento foi confirmado', // ONLY after success
    'Receberá um email de confirmação',
  ],
  forbiddenPhrases: [], // No restrictions after confirmed success
};

const RULES_REQUEST_ONLY: SchedulingRules = {
  canAskForDetails: true,
  canConfirmAppointment: false, // NEVER
  canCollectPreferences: true,
  mustUseCautionLanguage: true,
  mustWaitForBackendConfirmation: false, // No real-time confirmation available
  requiresEmail: true, // MANDATORY
  allowedPhrases: [
    'Registámos o seu pedido de agendamento',
    'A nossa equipa irá confirmar a disponibilidade',
    'Entraremos em contacto por email ou telefone',
    'O seu pedido foi registado',
  ],
  forbiddenPhrases: [
    'Agendamento confirmado',
    'Consulta marcada',
    'Reserva confirmada',
    'Está marcado',
    'Ficou agendado',
    'O seu agendamento está feito',
  ],
};

const RULES_SCHEDULING_DISABLED: SchedulingRules = {
  canAskForDetails: false,
  canConfirmAppointment: false,
  canCollectPreferences: true, // Can still collect basic info for human follow-up
  mustUseCautionLanguage: true,
  mustWaitForBackendConfirmation: false,
  requiresEmail: true,
  allowedPhrases: [
    'De momento não é possível agendar automaticamente',
    'Posso registar os seus dados de contacto',
    'Por favor, contacte-nos diretamente',
    'Um dos nossos colaboradores irá ajudá-lo',
    'Posso transferi-lo para um operador',
  ],
  forbiddenPhrases: [
    'Agendamento confirmado',
    'Consulta marcada',
    'Reserva confirmada',
    'Posso agendar',
    'Vou marcar',
  ],
};

// =============================================
// State Determination
// =============================================

/**
 * Determine the scheduling state based on service permissions and integrations
 */
export function determineSchedulingState(
  permissions: SchedulingServicePermissions,
  providers: SchedulingProvider[]
): SchedulingState {
  // If scheduling service is disabled, no scheduling allowed
  if (!permissions.service_scheduling_enabled) {
    return 'SCHEDULING_DISABLED';
  }

  // Check if any provider can create events
  const hasActiveProvider = providers.some(
    (p) => p.status === 'active' && p.can_create_events
  );

  if (hasActiveProvider) {
    return 'REAL_TIME_SCHEDULING_ACTIVE';
  }

  // Scheduling enabled but no active integrations
  return 'REQUEST_ONLY';
}

/**
 * Get scheduling rules based on state
 */
export function getSchedulingRules(state: SchedulingState): SchedulingRules {
  switch (state) {
    case 'REAL_TIME_SCHEDULING_ACTIVE':
      return RULES_REAL_TIME_SCHEDULING_ACTIVE;
    case 'REQUEST_ONLY':
      return RULES_REQUEST_ONLY;
    case 'SCHEDULING_DISABLED':
      return RULES_SCHEDULING_DISABLED;
    default:
      return RULES_SCHEDULING_DISABLED;
  }
}

/**
 * Build complete scheduling context for AI prompts
 */
export function buildSchedulingContext(
  permissions: SchedulingServicePermissions,
  providers: SchedulingProvider[]
): SchedulingContext {
  const state = determineSchedulingState(permissions, providers);
  const rules = getSchedulingRules(state);

  return {
    state,
    providers,
    rules,
  };
}

/**
 * Get the default internal provider based on service flag
 * This represents the built-in agendamentos table
 */
export function getInternalSchedulingProvider(
  schedulingEnabled: boolean
): SchedulingProvider {
  return {
    provider: 'internal',
    status: schedulingEnabled ? 'active' : 'inactive',
    can_create_events: schedulingEnabled,
  };
}

// =============================================
// Data Validation
// =============================================

/**
 * Validate required data before scheduling action
 * PRODUCTION-GRADE: Email is ALWAYS required
 */
export function validateSchedulingData(
  data: SchedulingRequestData
): SchedulingValidationResult {
  const missingFields: string[] = [];

  // Email is MANDATORY - no exceptions
  if (!data.client_email?.trim()) {
    missingFields.push('email');
  }

  // Name is required
  if (SCHEDULING_DATA_REQUIREMENTS.name && !data.client_name?.trim()) {
    missingFields.push('name');
  }

  // Date and time are required for real scheduling
  if (SCHEDULING_DATA_REQUIREMENTS.date_time) {
    if (!data.preferred_date) {
      missingFields.push('date');
    }
    if (!data.preferred_time) {
      missingFields.push('time');
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      message: `Dados obrigatórios em falta: ${missingFields.join(', ')}. Por favor, forneça estas informações.`,
    };
  }

  return { valid: true, missingFields: [] };
}

// =============================================
// Prompt Injection Helpers
// =============================================

/**
 * Generate scheduling instructions for AI system prompt
 * PRODUCTION-GRADE: Strict language control
 */
export function generateSchedulingPromptInstructions(
  context: SchedulingContext,
  language: 'pt' | 'en' | 'es' = 'pt'
): string {
  const { state } = context;

  const translations = {
    pt: {
      REAL_TIME_SCHEDULING_ACTIVE: `
=== AGENDAMENTOS (MODO TEMPO REAL) ===

FLUXO OBRIGATÓRIO:
1. PRIMEIRO recolhe TODOS os dados obrigatórios:
   - Nome completo (obrigatório)
   - Email (OBRIGATÓRIO - não prosseguir sem isto)
   - Telefone (recomendado)
   - Data e hora pretendidas

2. Se faltar algum dado obrigatório:
   → Pede explicitamente: "Por favor, indique o seu email para prosseguir."
   → NÃO continues sem email válido

3. ANTES de executar o agendamento, diz:
   → "Só um momento, estou a verificar disponibilidade…"

4. APÓS executar a ação no backend:
   → Se SUCESSO: "O agendamento foi confirmado para [data] às [hora]. Receberá um email de confirmação."
   → Se FALHA: "Registámos o seu pedido e entraremos em contacto em breve para confirmar."

REGRAS CRÍTICAS DE SEGURANÇA:
- NUNCA confirmes um agendamento sem resposta de sucesso do sistema
- Usa SEMPRE linguagem cautelosa até confirmação técnica
- Se houver timeout ou erro, trata como pedido registado (não confirmado)

LINGUAGEM PROIBIDA (NUNCA uses até confirmação de sucesso):
- "Consulta marcada"
- "Agendamento confirmado"  
- "Está marcado"
- "Reserva feita"`,

      REQUEST_ONLY: `
=== AGENDAMENTOS (MODO PEDIDO) ===

NÃO TENS CAPACIDADE para confirmar agendamentos em tempo real.
Podes APENAS recolher pedidos para confirmação manual.

FLUXO OBRIGATÓRIO:
1. Recolhe TODOS os dados:
   - Nome completo (obrigatório)
   - Email (OBRIGATÓRIO - não prosseguir sem isto)
   - Telefone (recomendado)
   - Data e hora preferidas

2. Se faltar algum dado obrigatório:
   → "Por favor, indique o seu email para que possamos contactá-lo."

3. APÓS recolher os dados, diz SEMPRE:
   → "Registámos o seu pedido de agendamento."
   → "A nossa equipa irá confirmar a disponibilidade por email ou telefone."

LINGUAGEM PROIBIDA (NUNCA uses):
- "Agendamento confirmado"
- "Consulta marcada"
- "Está marcado"
- "Ficou agendado"
- "O seu agendamento está feito"`,

      SCHEDULING_DISABLED: `
=== AGENDAMENTOS (NÃO DISPONÍVEL) ===

O agendamento automático NÃO está ativo para esta empresa.

Se o cliente pedir para marcar/agendar algo:
1. Informa educadamente:
   → "De momento não é possível agendar automaticamente."
   
2. Oferece alternativas:
   → "Posso registar os seus dados de contacto para que a nossa equipa entre em contacto."
   → "Pode também contactar-nos diretamente por email ou telefone."
   
3. Se o cliente aceitar, recolhe:
   - Nome
   - Email (obrigatório)
   - Telefone (se disponível)

LINGUAGEM PROIBIDA (NUNCA uses):
- "Posso agendar"
- "Vou marcar"
- "Agendamento confirmado"`,
    },
    en: {
      REAL_TIME_SCHEDULING_ACTIVE: `
=== SCHEDULING (REAL-TIME MODE) ===

MANDATORY FLOW:
1. FIRST collect ALL required data:
   - Full name (required)
   - Email (MANDATORY - do not proceed without this)
   - Phone (recommended)
   - Preferred date and time

2. If any required data is missing:
   → Ask explicitly: "Please provide your email to proceed."
   → DO NOT continue without a valid email

3. BEFORE executing the scheduling action, say:
   → "Just a moment, I'm checking availability…"

4. AFTER backend execution:
   → If SUCCESS: "Your appointment has been confirmed for [date] at [time]. You'll receive a confirmation email."
   → If FAILURE: "We've recorded your request and will contact you shortly to confirm."

CRITICAL SAFETY RULES:
- NEVER confirm an appointment without system success response
- ALWAYS use cautious language until technical confirmation

FORBIDDEN LANGUAGE (NEVER use until success confirmation):
- "Appointment confirmed"
- "Booking confirmed"
- "You're all set"`,

      REQUEST_ONLY: `
=== SCHEDULING (REQUEST MODE) ===

You DO NOT have the capability to confirm appointments in real-time.
You can ONLY collect requests for manual confirmation.

MANDATORY FLOW:
1. Collect ALL data:
   - Full name (required)
   - Email (MANDATORY - do not proceed without this)
   - Phone (recommended)
   - Preferred date and time

2. AFTER collecting the data, ALWAYS say:
   → "I've recorded your scheduling request."
   → "Our team will confirm availability by email or phone."

FORBIDDEN LANGUAGE (NEVER use):
- "Appointment confirmed"
- "Booking confirmed"
- "You're all set"`,

      SCHEDULING_DISABLED: `
=== SCHEDULING (NOT AVAILABLE) ===

Automatic scheduling is NOT active for this company.

If the customer asks to book/schedule something:
1. Inform politely:
   → "Automatic scheduling is not available at the moment."
   
2. Offer alternatives:
   → "I can record your contact details so our team can reach out to you."

FORBIDDEN LANGUAGE (NEVER use):
- "I can schedule"
- "I'll book that for you"
- "Appointment confirmed"`,
    },
    es: {
      REAL_TIME_SCHEDULING_ACTIVE: `
=== CITAS (MODO TIEMPO REAL) ===

FLUJO OBLIGATORIO:
1. PRIMERO recoge TODOS los datos obligatorios:
   - Nombre completo (obligatorio)
   - Email (OBLIGATORIO - no continuar sin esto)
   - Teléfono (recomendado)
   - Fecha y hora preferidas

2. ANTES de ejecutar la acción, di:
   → "Un momento, estoy verificando disponibilidad…"

3. DESPUÉS de ejecutar en backend:
   → Si ÉXITO: "Su cita ha sido confirmada para [fecha] a las [hora]."
   → Si FALLO: "Hemos registrado su solicitud y le contactaremos pronto."

LENGUAJE PROHIBIDO (NUNCA uses hasta confirmación de éxito):
- "Cita confirmada"
- "Reserva confirmada"
- "Está agendado"`,

      REQUEST_ONLY: `
=== CITAS (MODO SOLICITUD) ===

NO TIENES CAPACIDAD para confirmar citas en tiempo real.

FLUJO OBLIGATORIO:
1. Recoge TODOS los datos:
   - Nombre completo (obligatorio)
   - Email (OBLIGATORIO)
   - Fecha y hora preferidas

2. DESPUÉS de recoger los datos, di SIEMPRE:
   → "Hemos registrado su solicitud de cita."
   → "Nuestro equipo confirmará la disponibilidad."

LENGUAJE PROHIBIDO:
- "Cita confirmada"
- "Reserva confirmada"`,

      SCHEDULING_DISABLED: `
=== CITAS (NO DISPONIBLE) ===

La programación automática NO está activa.

Si el cliente pide agendar algo:
1. Informa educadamente:
   → "En este momento no es posible agendar automáticamente."

LENGUAJE PROHIBIDO:
- "Puedo agendar"
- "Cita confirmada"`,
    },
  };

  return translations[language][state] || translations['pt'][state];
}
