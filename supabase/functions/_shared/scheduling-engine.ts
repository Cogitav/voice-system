/**
 * Scheduling Decision Engine - Edge Function Shared Module
 * 
 * PRODUCTION-GRADE: Determines scheduling capabilities for AI agents based on:
 * 1. empresa.service_scheduling_enabled
 * 2. Active scheduling integrations (future-proof)
 * 
 * CRITICAL SAFETY MODULE - Agents must NEVER confirm appointments
 * without explicit backend success confirmation.
 */

// =============================================
// Scheduling States (PRODUCTION-GRADE)
// =============================================

export type SchedulingState = 
  | 'REAL_TIME_SCHEDULING_ACTIVE'  // Can create real appointments (requires backend confirmation)
  | 'REQUEST_ONLY'                  // Can collect request, but never confirm
  | 'SCHEDULING_DISABLED';          // Cannot schedule at all

// Legacy aliases for backwards compatibility
export const SCHEDULING_STATE_ALIASES = {
  CAN_SCHEDULE_REAL: 'REAL_TIME_SCHEDULING_ACTIVE',
  CAN_COLLECT_REQUEST_ONLY: 'REQUEST_ONLY',
  SCHEDULING_DISABLED: 'SCHEDULING_DISABLED',
} as const;

// =============================================
// Scheduling Provider (Future-Proofing)
// =============================================

export type SchedulingProviderType = 
  | 'internal'    // Built-in scheduling (agendamentos table)
  | 'google'      // Google Calendar (future)
  | 'outlook'     // Outlook Calendar (future)
  | 'calendly'    // Calendly (future)
  | 'sheets';     // Google Sheets (future)

export interface SchedulingProvider {
  provider: SchedulingProviderType;
  status: 'active' | 'inactive' | 'not_configured';
  can_create_events: boolean;
}

// =============================================
// Service Permissions Interface
// =============================================

export interface SchedulingServiceFlags {
  service_scheduling_enabled: boolean;
  service_email_enabled: boolean;
}

// =============================================
// Mandatory Data Gates Configuration
// =============================================

export interface RequiredSchedulingData {
  name: boolean;
  email: boolean;  // MANDATORY - always true
  phone: boolean;  // Recommended
  date_time: boolean;
}

export const SCHEDULING_DATA_REQUIREMENTS: RequiredSchedulingData = {
  name: true,
  email: true,    // MANDATORY - NO EXCEPTIONS
  phone: false,   // Recommended but not blocking
  date_time: true,
};

// =============================================
// Determine Scheduling State
// =============================================

export function determineSchedulingState(
  flags: SchedulingServiceFlags,
  providers: SchedulingProvider[]
): SchedulingState {
  // If scheduling service is disabled, no scheduling allowed
  if (!flags.service_scheduling_enabled) {
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
 * Get the internal scheduling provider based on service flag
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
// Generate Scheduling Prompt Instructions
// PRODUCTION-GRADE: Strict language control
// =============================================

type SupportedLanguage = 'pt' | 'en' | 'es';

/**
 * Generate scheduling-specific instructions for AI system prompt
 * These instructions are CRITICAL for agent safety and production readiness
 */
export function generateSchedulingPromptInstructions(
  state: SchedulingState,
  language: SupportedLanguage = 'pt'
): string {
  const instructions: Record<SupportedLanguage, Record<SchedulingState, string>> = {
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
- Após SUCESSO confirmado, notifica por email o cliente e a empresa

LINGUAGEM PROIBIDA (NUNCA uses até confirmação de sucesso):
- "Consulta marcada"
- "Agendamento confirmado"  
- "Está marcado"
- "Reserva feita"
- "Ficou agendado"`,

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
   → "Entraremos em contacto brevemente."

LINGUAGEM PROIBIDA (NUNCA uses):
- "Agendamento confirmado"
- "Consulta marcada"
- "Está marcado"
- "Ficou agendado"
- "Reserva confirmada"
- "O seu agendamento está feito"
- Qualquer variação que implique confirmação`,

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
   - Assunto/motivo do contacto

4. Oferece transferência:
   → "Se preferir, posso transferi-lo para um dos nossos operadores."

LINGUAGEM PROIBIDA (NUNCA uses):
- "Posso agendar"
- "Vou marcar"
- "Agendamento confirmado"
- Qualquer promessa de marcação automática`,
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
- On timeout or error, treat as request recorded (not confirmed)
- After confirmed SUCCESS, send email notification to client and company

FORBIDDEN LANGUAGE (NEVER use until success confirmation):
- "Appointment confirmed"
- "Booking confirmed"
- "You're all set"
- "Reservation made"
- "It's booked"`,

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

2. If any required data is missing:
   → "Please provide your email so we can contact you."

3. AFTER collecting the data, ALWAYS say:
   → "I've recorded your scheduling request."
   → "Our team will confirm availability by email or phone."
   → "We'll be in touch shortly."

FORBIDDEN LANGUAGE (NEVER use):
- "Appointment confirmed"
- "Booking confirmed"
- "You're all set"
- "It's scheduled"
- "Your appointment is confirmed"
- Any variation implying confirmation`,

      SCHEDULING_DISABLED: `
=== SCHEDULING (NOT AVAILABLE) ===

Automatic scheduling is NOT active for this company.

If the customer asks to book/schedule something:
1. Inform politely:
   → "Automatic scheduling is not available at the moment."
   
2. Offer alternatives:
   → "I can record your contact details so our team can reach out to you."
   → "You can also contact us directly by email or phone."
   
3. If customer agrees, collect:
   - Name
   - Email (required)
   - Phone (if available)
   - Subject/reason for contact

4. Offer transfer:
   → "If you prefer, I can transfer you to one of our operators."

FORBIDDEN LANGUAGE (NEVER use):
- "I can schedule"
- "I'll book that for you"
- "Appointment confirmed"
- Any promise of automatic booking`,
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

2. Si falta algún dato obligatorio:
   → Pide explícitamente: "Por favor, indique su email para continuar."
   → NO continúes sin email válido

3. ANTES de ejecutar la acción, di:
   → "Un momento, estoy verificando disponibilidad…"

4. DESPUÉS de ejecutar en backend:
   → Si ÉXITO: "Su cita ha sido confirmada para [fecha] a las [hora]. Recibirá un email de confirmación."
   → Si FALLO: "Hemos registrado su solicitud y le contactaremos pronto para confirmar."

REGLAS CRÍTICAS DE SEGURIDAD:
- NUNCA confirmes una cita sin respuesta de éxito del sistema
- Usa SIEMPRE lenguaje cauteloso hasta confirmación técnica
- En timeout o error, tratar como solicitud registrada (no confirmada)
- Tras ÉXITO confirmado, enviar email a cliente y empresa

LENGUAJE PROHIBIDO (NUNCA uses hasta confirmación de éxito):
- "Cita confirmada"
- "Reserva confirmada"
- "Está agendado"
- "Queda reservado"`,

      REQUEST_ONLY: `
=== CITAS (MODO SOLICITUD) ===

NO TIENES CAPACIDAD para confirmar citas en tiempo real.
Solo puedes recoger solicitudes para confirmación manual.

FLUJO OBLIGATORIO:
1. Recoge TODOS los datos:
   - Nombre completo (obligatorio)
   - Email (OBLIGATORIO - no continuar sin esto)
   - Teléfono (recomendado)
   - Fecha y hora preferidas

2. Si falta algún dato obligatorio:
   → "Por favor, indique su email para que podamos contactarle."

3. DESPUÉS de recoger los datos, di SIEMPRE:
   → "Hemos registrado su solicitud de cita."
   → "Nuestro equipo confirmará la disponibilidad por email o teléfono."
   → "Nos pondremos en contacto pronto."

LENGUAJE PROHIBIDO (NUNCA uses):
- "Cita confirmada"
- "Reserva confirmada"
- "Está agendado"
- "Su cita está confirmada"
- Cualquier variación que implique confirmación`,

      SCHEDULING_DISABLED: `
=== CITAS (NO DISPONIBLE) ===

La programación automática NO está activa para esta empresa.

Si el cliente pide agendar algo:
1. Informa educadamente:
   → "En este momento no es posible agendar automáticamente."
   
2. Ofrece alternativas:
   → "Puedo registrar sus datos de contacto para que nuestro equipo le contacte."
   → "También puede contactarnos directamente por email o teléfono."
   
3. Si acepta, recoge:
   - Nombre
   - Email (obligatorio)
   - Teléfono (si disponible)
   - Asunto/motivo del contacto

4. Ofrece transferencia:
   → "Si prefiere, puedo transferirle a uno de nuestros operadores."

LENGUAJE PROHIBIDO (NUNCA uses):
- "Puedo agendar"
- "Voy a reservar"
- "Cita confirmada"
- Cualquier promesa de reserva automática`,
    },
  };

  return instructions[language]?.[state] || instructions['pt'][state];
}

// =============================================
// Generate Knowledge Base Compliance Instructions
// =============================================

export function generateKnowledgeBaseInstructions(language: SupportedLanguage = 'pt'): string {
  const instructions: Record<SupportedLanguage, string> = {
    pt: `
=== CONFORMIDADE COM BASE DE CONHECIMENTO ===

REGRAS OBRIGATÓRIAS:
1. Responde APENAS com informação que tens disponível na base de conhecimento
2. Se a informação não existe ou é ambígua:
   → "Não tenho essa informação confirmada."
   → "Deixe-me verificar com a equipa."
   → "Posso perguntar mais detalhes para ajudá-lo melhor?"

3. NUNCA inventes:
   - Datas de disponibilidade
   - Preços ou valores
   - Horários de funcionamento (se não configurados)
   - Políticas da empresa
   - Capacidade de serviços

4. Se o cliente pedir informação específica que não tens:
   → "Não tenho essa informação disponível de momento."
   → "Recomendo contactar diretamente a nossa equipa para confirmar."
   → Oferece recolher contacto para follow-up`,

    en: `
=== KNOWLEDGE BASE COMPLIANCE ===

MANDATORY RULES:
1. Respond ONLY with information available in the knowledge base
2. If information doesn't exist or is ambiguous:
   → "I don't have that information confirmed."
   → "Let me check with the team."
   → "Can I ask more details to help you better?"

3. NEVER invent:
   - Availability dates
   - Prices or values
   - Operating hours (if not configured)
   - Company policies
   - Service capacity

4. If customer asks for specific information you don't have:
   → "I don't have that information available at the moment."
   → "I recommend contacting our team directly to confirm."
   → Offer to collect contact for follow-up`,

    es: `
=== CONFORMIDAD CON BASE DE CONOCIMIENTO ===

REGLAS OBLIGATORIAS:
1. Responde SOLO con información disponible en la base de conocimiento
2. Si la información no existe o es ambigua:
   → "No tengo esa información confirmada."
   → "Déjame verificar con el equipo."
   → "¿Puedo preguntarte más detalles para ayudarte mejor?"

3. NUNCA inventes:
   - Fechas de disponibilidad
   - Precios o valores
   - Horarios de funcionamiento (si no configurados)
   - Políticas de la empresa
   - Capacidad de servicios

4. Si el cliente pide información específica que no tienes:
   → "No tengo esa información disponible en este momento."
   → "Recomiendo contactar directamente a nuestro equipo para confirmar."
   → Ofrece recoger contacto para seguimiento`,
  };

  return instructions[language] || instructions['pt'];
}

// =============================================
// Generate Service Permission Instructions
// =============================================

export function generateServicePermissionInstructions(
  permissions: SchedulingServiceFlags & { service_chat_enabled?: boolean; service_voice_enabled?: boolean },
  language: SupportedLanguage = 'pt'
): string {
  const disabledServices: string[] = [];
  
  if (!permissions.service_scheduling_enabled) {
    disabledServices.push(language === 'en' ? 'Scheduling' : language === 'es' ? 'Citas' : 'Agendamentos');
  }
  if (!permissions.service_email_enabled) {
    disabledServices.push(language === 'en' ? 'Email automation' : language === 'es' ? 'Email automático' : 'Email automático');
  }

  if (disabledServices.length === 0) {
    return '';
  }

  const labels: Record<SupportedLanguage, { intro: string; rule: string }> = {
    pt: {
      intro: `\n=== SERVIÇOS NÃO DISPONÍVEIS ===\nOs seguintes serviços NÃO estão ativos: ${disabledServices.join(', ')}`,
      rule: `\nSe o cliente pedir algo relacionado com estes serviços, explica educadamente que não está disponível e oferece alternativas (contacto humano, registar dados para follow-up).`,
    },
    en: {
      intro: `\n=== UNAVAILABLE SERVICES ===\nThe following services are NOT active: ${disabledServices.join(', ')}`,
      rule: `\nIf the customer asks for something related to these services, politely explain it's not available and offer alternatives (human contact, record data for follow-up).`,
    },
    es: {
      intro: `\n=== SERVICIOS NO DISPONIBLES ===\nLos siguientes servicios NO están activos: ${disabledServices.join(', ')}`,
      rule: `\nSi el cliente pide algo relacionado con estos servicios, explica educadamente que no está disponible y ofrece alternativas (contacto humano, registrar datos para seguimiento).`,
    },
  };

  const label = labels[language] || labels['pt'];
  return label.intro + label.rule;
}

// =============================================
// Scheduling Action Execution
// =============================================

export type SchedulingActionOutcome = 'success' | 'blocked' | 'failed';
export type SchedulingBlockReason =
  | 'service_disabled'
  | 'no_integration'
  | 'technical_error'
  | 'validation_error'
  | 'missing_required_data';

export interface SchedulingRequestData {
  preferred_date?: string;
  preferred_time?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  notes?: string;
  conversation_id?: string;
  agent_id?: string;
}

export interface SchedulingActionResult {
  success: boolean;
  outcome: SchedulingActionOutcome;
  reason?: SchedulingBlockReason;
  message: string;
  appointment_id?: string;
  request_id?: string;
  credits_consumed: number;
}

/**
 * Validate required data before scheduling action
 * PRODUCTION-GRADE: Email is ALWAYS required
 */
export function validateSchedulingData(
  data: SchedulingRequestData
): { valid: boolean; missingFields: string[]; message?: string } {
  const missingFields: string[] = [];

  // Email is MANDATORY - no exceptions
  if (!data.client_email?.trim()) {
    missingFields.push('email');
  }

  // Name is required
  if (!data.client_name?.trim()) {
    missingFields.push('name');
  }

  // Date and time are required for scheduling
  if (!data.preferred_date) {
    missingFields.push('date');
  }
  if (!data.preferred_time) {
    missingFields.push('time');
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

/**
 * Create a real appointment in the agendamentos table
 * PRODUCTION-GRADE: Requires all mandatory data
 */
// deno-lint-ignore no-explicit-any
export async function createRealAppointment(
  supabase: any,
  empresaId: string,
  data: SchedulingRequestData
): Promise<SchedulingActionResult> {
  // Validate required fields (MANDATORY)
  const validation = validateSchedulingData(data);
  if (!validation.valid) {
    return {
      success: false,
      outcome: 'failed',
      reason: 'missing_required_data',
      message: validation.message || 'Dados obrigatórios em falta.',
      credits_consumed: 0,
    };
  }

  try {
    const { data: appointment, error } = await supabase
      .from('agendamentos')
      .insert({
        empresa_id: empresaId,
        data: data.preferred_date,
        hora: data.preferred_time,
        cliente_nome: data.client_name || null,
        cliente_telefone: data.client_phone || null,
        notas: data.notes ? `${data.notes}\nEmail: ${data.client_email}` : `Email: ${data.client_email}`,
        estado: 'pendente',
        agente_id: data.agent_id || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Scheduling] Failed to create appointment:', error);
      return {
        success: false,
        outcome: 'failed',
        reason: 'technical_error',
        message: 'Registámos o seu pedido e entraremos em contacto em breve para confirmar.',
        credits_consumed: 0,
      };
    }

    console.log(`[Scheduling] ✓ Real appointment created: ${appointment.id}`);
    return {
      success: true,
      outcome: 'success',
      message: `O agendamento foi confirmado para ${data.preferred_date} às ${data.preferred_time}. Receberá um email de confirmação.`,
      appointment_id: appointment.id,
      credits_consumed: 2,
    };
  } catch (err) {
    console.error('[Scheduling] Exception creating appointment:', err);
    return {
      success: false,
      outcome: 'failed',
      reason: 'technical_error',
      message: 'Registámos o seu pedido e entraremos em contacto em breve.',
      credits_consumed: 0,
    };
  }
}

/**
 * Create a scheduling request (for manual follow-up)
 * Used when REQUEST_ONLY state
 * PRODUCTION-GRADE: Requires email
 */
// deno-lint-ignore no-explicit-any
export async function createSchedulingRequest(
  supabase: any,
  empresaId: string,
  data: SchedulingRequestData
): Promise<SchedulingActionResult> {
  // Email is MANDATORY even for requests
  if (!data.client_email?.trim()) {
    return {
      success: false,
      outcome: 'failed',
      reason: 'missing_required_data',
      message: 'Por favor, forneça o seu email para que possamos contactá-lo.',
      credits_consumed: 0,
    };
  }

  try {
    // Store in leads table with scheduling context
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        empresa_id: empresaId,
        conversation_id: data.conversation_id || null,
        agent_id: data.agent_id || null,
        name: data.client_name || null,
        email: data.client_email,
        phone: data.client_phone || null,
        notes: `Pedido de agendamento: ${data.preferred_date || 'data não especificada'} às ${data.preferred_time || 'hora não especificada'}. ${data.notes || ''}`.trim(),
        source: 'scheduling_request',
        status: 'new',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Scheduling] Failed to create request:', error);
      return {
        success: false,
        outcome: 'failed',
        reason: 'technical_error',
        message: 'Não foi possível registar o pedido.',
        credits_consumed: 0,
      };
    }

    console.log(`[Scheduling] ✓ Scheduling request created: ${lead.id}`);
    return {
      success: true,
      outcome: 'success',
      message: 'Registámos o seu pedido de agendamento. A nossa equipa irá confirmar a disponibilidade e entrar em contacto por email ou telefone.',
      request_id: lead.id,
      credits_consumed: 1,
    };
  } catch (err) {
    console.error('[Scheduling] Exception creating request:', err);
    return {
      success: false,
      outcome: 'failed',
      reason: 'technical_error',
      message: 'Erro ao processar o pedido.',
      credits_consumed: 0,
    };
  }
}
