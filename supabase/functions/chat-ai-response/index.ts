import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  loadServicePermissions, 
  checkActionPermission,
  logActionExecution,
  collectLead,
  handoffToHuman,
  type ServicePermissions,
} from '../_shared/action-layer.ts';
import {
  determineSchedulingState,
  getInternalSchedulingProvider,
  generateSchedulingPromptInstructions,
  type SchedulingState,
  type SchedulingProvider,
} from '../_shared/scheduling-engine.ts';
import {
  generateBehavioralContractPrompt,
  mapToContractLanguage,
} from '../_shared/behavioral-contract.ts';
import {
  createInternalBooking,
  type BookingResult,
} from '../_shared/booking-engine.ts';
import {
  checkInternalAvailability,
  type InternalAvailabilityResult,
} from '../_shared/scheduling-actions.ts';
import {
  getConversationContext,
  updateConversationState,
  mergeConversationContext,
} from '../_shared/conversation-context.ts';
import { autoCloseConversation } from '../_shared/auto-close.ts';
import { type ConversationState } from '../_shared/conversation-states.ts';
import {
  Intent,
  classifyIntent,
  classifyIntentDeterministic,
  isBookingIntent,
  BOOKING_INTENT_FAMILY,
  runIntentRouter,
  type IntentRouterResult,
} from '../_shared/intent-router.ts';
import { extractDeterministicFields } from '../_shared/deterministic-field-extractor.ts';
import { extractStructuredFieldsViaLLM, type CompanyServiceSummary } from '../_shared/structured-field-extractor.ts';
import { resolveServiceSemantically, type ServiceCandidate } from '../_shared/semantic-service-resolver.ts';
// CCE removed — handlePreResponseStateTransition is the sole state authority
import {
  orchestrate,
  shouldResolveServiceEarly,
  shouldCleanBookingContext,
  reconcileState,
  bookingOrchestrator,
  type OrchestratorDecision,
  type BookingOrchestratorResult,
} from '../_shared/conversation-orchestrator-v2.ts';
import {
  checkRescheduleAllowed,
  executeReschedule,
  validateRescheduleAvailability,
} from '../_shared/reschedule-engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================
// Runtime Logger (non-blocking, never throws)
// Uses dedicated service-role client so RLS is bypassed.
// =============================================
async function runtimeLog(
  _supabase: unknown,
  empresaId: string | undefined,
  conversationId: string | undefined,
  eventType: string,
  message: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await serviceClient.from('agent_runtime_logs').insert({
      empresa_id: empresaId || null,
      conversation_id: conversationId || null,
      event_type: eventType,
      message: message,
      payload: payload,
    });
  } catch (_) {
    // logging must never break runtime
  }
}

interface Agent {
  id: string;
  nome: string;
  prompt_base: string | null;
  personalidade: string | null;
  contexto_negocio: string | null;
  is_default_chat_agent: boolean;
  response_style: string | null;
}

// =============================================
// Response Style Formatter
// =============================================

type ResponseStyle = 'formal' | 'neutral' | 'friendly' | 'energetic';

/**
 * Format AI response content based on agent's configured response style.
 * Applied right before inserting the AI message — does NOT modify AI reasoning.
 */
function formatResponseByStyle(content: string, style: ResponseStyle): string {
  if (!content?.trim()) return content;

  switch (style) {
    case 'formal':
      return applyFormalStyle(content);
    case 'friendly':
      return applyFriendlyStyle(content);
    case 'energetic':
      return applyEnergeticStyle(content);
    case 'neutral':
    default:
      return applyNeutralStyle(content);
  }
}

function applyFormalStyle(content: string): string {
  // Remove all emojis
  const noEmojis = content.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
  // Clean up double spaces from emoji removal
  return noEmojis.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function applyNeutralStyle(content: string): string {
  // Keep content mostly as-is, just limit excessive emojis
  // Replace sequences of 2+ emojis with just the first
  return content.replace(/([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}])\s*([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}])+/gu, '$1');
}

function applyFriendlyStyle(content: string): string {
  // Already friendly from AI — just ensure it doesn't feel too formal
  // Add a warm touch if the message ends without punctuation
  let result = content.trim();
  if (result && !/[.!?😊👋🙏✨]$/u.test(result)) {
    result += ' 😊';
  }
  return result;
}

function applyEnergeticStyle(content: string): string {
  let result = content.trim();
  // Add enthusiasm if message ends plainly
  if (result && !/[!🎉✨🚀💪😄]$/u.test(result)) {
    result += ' ✨';
  }
  // Replace single period endings with exclamation where natural
  result = result.replace(/\.\s*$/gm, '!');
  return result;
}

// =============================================
// Response Integrity Guard
// =============================================

/**
 * Detects and repairs truncated AI responses.
 * If a message ends with incomplete indicators, appends a graceful closure.
 */
function repairTruncatedResponse(content: string): string {
  if (!content?.trim()) return content;

  const trimmed = content.trim();

  // Patterns that indicate truncation
  const truncationPatterns = [
    /[,;:\-–—]\s*$/,           // ends with punctuation that expects continuation
    /\b(e|ou|mas|como|para|com|de|que|se|por|em|um|uma|no|na|do|da|os|as)\s*$/i, // ends with conjunction/preposition
    /\b(and|or|but|with|for|the|to|in|of|is|are|can|will|this|that)\s*$/i, // English truncation
    /\.\.\s*$/,                 // ends with incomplete ellipsis
    /[a-záàâãéèêíïóôõúüç]\s*$/i, // ends mid-word (lowercase letter at very end without punctuation)
  ];

  // Check if response appears truncated
  const lastChar = trimmed[trimmed.length - 1];
  const endsWithCompletePunctuation = /[.!?…»"\)]$/.test(lastChar);

  if (!endsWithCompletePunctuation) {
    for (const pattern of truncationPatterns) {
      if (pattern.test(trimmed)) {
        console.warn('[ResponseIntegrity] Truncated response detected — appending closure');
        // Remove the trailing incomplete fragment and add graceful ending
        const repaired = trimmed.replace(/[,;:\-–—]\s*$/, '').replace(/\b\w{1,4}\s*$/, '').trim();
        if (repaired.length > 20) {
          return repaired + '. Se precisar de mais informações, estou ao dispor.';
        }
        return trimmed + '. Se precisar de mais informações, estou ao dispor.';
      }
    }
  }

  return content;
}

// =============================================
// Booking Recovery Layer v2.0 — Deterministic Conflict Recovery Engine
// =============================================

interface BookingRecoveryResult {
  recoveryMessage: string;
  shouldRetry: boolean;
  triggerSuggestions?: boolean;
}

/**
 * Deterministic error-to-question mapping for booking failures.
 * Returns a conversational recovery message — never technical.
 */
function generateBookingRecovery(errorCode: string, errorMessage: string): BookingRecoveryResult {
  switch (errorCode) {
    case 'MISSING_REQUIRED_FIELD': {
      if (errorMessage.includes('Nome')) {
        return { recoveryMessage: 'Para prosseguir com o agendamento, preciso do seu nome completo. Pode indicar, por favor?', shouldRetry: false };
      }
      if (errorMessage.includes('Email')) {
        return { recoveryMessage: 'Para confirmar o agendamento, preciso do seu endereço de email. Pode fornecer?', shouldRetry: false };
      }
      if (errorMessage.includes('Telefone')) {
        return { recoveryMessage: 'Para este agendamento é necessário um número de telefone de contacto. Pode indicar o seu?', shouldRetry: false };
      }
      if (errorMessage.includes('Motivo')) {
        return { recoveryMessage: 'Pode indicar o motivo ou assunto do agendamento, por favor?', shouldRetry: false };
      }
      return { recoveryMessage: 'Faltam alguns dados para completar o agendamento. Pode fornecer as informações em falta?', shouldRetry: false };
    }
    case 'MINIMUM_ADVANCE_NOT_RESPECTED': {
      const minutesMatch = errorMessage.match(/(\d+)\s*minutos/);
      const minutes = minutesMatch ? minutesMatch[1] : '';
      return {
        recoveryMessage: minutes
          ? `Este agendamento precisa de pelo menos ${minutes} minutos de antecedência. Pode escolher outro horário mais à frente?`
          : 'O horário selecionado não tem antecedência suficiente. Pode escolher outro horário?',
        shouldRetry: false,
      };
    }
    case 'OUTSIDE_BUSINESS_HOURS': {
      const hoursMatch = errorMessage.match(/\((\d{2}:\d{2})[–-](\d{2}:\d{2})\)/);
      const hoursInfo = hoursMatch 
        ? ` O horário de funcionamento é das ${hoursMatch[1]} às ${hoursMatch[2]}.`
        : '';
      return {
        recoveryMessage: `O horário solicitado está fora do período de funcionamento.${hoursInfo} Pode escolher um horário dentro do horário de atendimento?`,
        shouldRetry: false,
      };
    }
    case 'INTERNAL_CALENDAR_DISABLED':
      return { recoveryMessage: 'O agendamento direto não está disponível de momento. Por favor contacte-nos diretamente para agendar.', shouldRetry: false };
    case 'EXTERNAL_CALENDAR_DISABLED':
      return { recoveryMessage: 'O agendamento externo não está disponível para esta empresa. Por favor contacte-nos diretamente para agendar.', shouldRetry: false };
    case 'CALENDAR_CONFLICT':
    case 'SLOT_NOT_AVAILABLE':
      return { recoveryMessage: 'O horário selecionado já não está disponível. Pode indicar outro horário da sua preferência?', shouldRetry: false, triggerSuggestions: true };
    case 'UNIQUE_SLOT_VIOLATION':
      return { recoveryMessage: 'Esse horário acabou de ficar indisponível. Vou sugerir novas opções.', shouldRetry: false, triggerSuggestions: true };
    case 'NO_RESOURCES_CONFIGURED':
      return { recoveryMessage: 'De momento não existem recursos disponíveis para este serviço. Por favor contacte-nos para mais informações.', shouldRetry: false };
    case 'NO_VALID_RESOURCE_COMBINATION':
      return { recoveryMessage: 'Neste horário não temos disponibilidade simultânea de sala e profissional. Poderia indicar outro horário?', shouldRetry: false, triggerSuggestions: true };
    case 'NO_CREDITS':
      return { recoveryMessage: 'De momento não é possível concluir o agendamento. Por favor contacte-nos diretamente.', shouldRetry: false };
    case 'DUPLICATE_EXECUTION':
      return { recoveryMessage: 'Este agendamento já foi processado anteriormente.', shouldRetry: false };
    default:
      return { recoveryMessage: 'Não foi possível concluir o agendamento. Pode tentar novamente ou escolher outro horário.', shouldRetry: false };
  }
}

// =============================================
// Deterministic Conflict Recovery Handler
// =============================================

interface ConflictSuggestion {
  start_datetime: string;
  end_datetime: string;
}

function formatSuggestionSlots(suggestions: ConflictSuggestion[]): string {
  return suggestions.map((s) => {
    const dt = new Date(s.start_datetime);
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `• ${dayNames[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }).join('\n');
}

/**
 * Deterministic booking failure handler.
 * Never calls LLM. Never re-enters confirmation flow.
 * Returns deterministic system response based on error_type.
 */
// deno-lint-ignore no-explicit-any
async function handleBookingFailure(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
  empresaId: string,
  bookingResult: BookingResult,
  // deno-lint-ignore no-explicit-any
  currentContext: Record<string, any>,
  resolvedServiceId?: string,
): Promise<{ result: string; isRecovery: boolean }> {
  const errorType = bookingResult.error_type || 'system';
  const errorCode = bookingResult.error_code || 'UNKNOWN_ERROR';

  console.log(`[ConflictRecovery] Handling failure: error_type=${errorType}, error_code=${errorCode}`);

  // Always clear booking_in_progress
  await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });

  // === CASE A: Conflict ===
  if (errorType === 'conflict') {
    console.log('[ConflictRecovery] CASE A — conflict recovery');

    // Keep preferred_date — do not clear it
    // Fetch alternative suggestions via AvailabilityEngine
    let suggestions: ConflictSuggestion[] = [];
    const serviceId = resolvedServiceId || (currentContext.service_id as string);

    if (serviceId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const suggestionsResponse = await fetch(
          `${supabaseUrl}/functions/v1/check-availability`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
            body: JSON.stringify({
              company_id: empresaId,
              service_id: serviceId,
              requested_start: currentContext.preferred_date || (currentContext.selected_datetime && String(currentContext.selected_datetime).includes('T') ? currentContext.selected_datetime : null),
              max_suggestions: 5,
              search_days: 14,
            }),
          }
        );
        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json();
          suggestions = (suggestionsData.suggestions || []) as ConflictSuggestion[];
        }
      } catch (sugErr) {
        console.error('[ConflictRecovery] Failed to fetch suggestions:', sugErr);
      }
    }

    if (suggestions.length > 0) {
      // Save suggestions + transition to awaiting_slot_selection
      await mergeConversationContext(supabase, conversationId, {
        conflict_suggestions: suggestions,
        conflict_origin: errorCode,
      });
      await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');
      console.log('[ConflictRecovery] Transitioned to awaiting_slot_selection with suggestions');

      const formatted = formatSuggestionSlots(suggestions);
      const recoveryMessage = `O horário selecionado já não está disponível.\nAqui estão alternativas disponíveis:\n${formatted}\n\nQual prefere?`;

      return {
        result: JSON.stringify({
          success: false,
          recovery_message: recoveryMessage,
          error_code: errorCode,
          _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
        }),
        isRecovery: true,
      };
    } else {
      // No suggestions found — revert to collecting_data
      await updateConversationState(supabase, conversationId, 'collecting_data');
      console.log('[ConflictRecovery] No suggestions — reverted to collecting_data');

      return {
        result: JSON.stringify({
          success: false,
          recovery_message: 'O horário selecionado já não está disponível e não encontrei alternativas próximas. Pode indicar outra data e hora?',
          error_code: errorCode,
          _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
        }),
        isRecovery: true,
      };
    }
  }

  // === CASE B: Validation ===
  if (errorType === 'validation') {
    console.log('[ConflictRecovery] CASE B — validation recovery');
    await updateConversationState(supabase, conversationId, 'collecting_data');

    const recoveryMessage = bookingResult.recovery_message || bookingResult.message;
    return {
      result: JSON.stringify({
        success: false,
        recovery_message: recoveryMessage,
        error_code: errorCode,
        _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
      }),
      isRecovery: true,
    };
  }

  // === CASE C: System ===
  console.log('[ConflictRecovery] CASE C — system error recovery');

  // Attempt AvailabilityEngine once
  let suggestions: ConflictSuggestion[] = [];
  const serviceId = resolvedServiceId || (currentContext.service_id as string);

  if (serviceId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const suggestionsResponse = await fetch(
        `${supabaseUrl}/functions/v1/check-availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({
            company_id: empresaId,
            service_id: serviceId,
            requested_start: currentContext.preferred_date || (currentContext.selected_datetime && String(currentContext.selected_datetime).includes('T') ? currentContext.selected_datetime : null),
            max_suggestions: 5,
            search_days: 14,
          }),
        }
      );
      if (suggestionsResponse.ok) {
        const suggestionsData = await suggestionsResponse.json();
        suggestions = (suggestionsData.suggestions || []) as ConflictSuggestion[];
      }
    } catch (sugErr) {
      console.error('[ConflictRecovery] Failed to fetch suggestions for system error:', sugErr);
    }
  }

  if (suggestions.length > 0) {
    await mergeConversationContext(supabase, conversationId, {
      conflict_suggestions: suggestions,
      conflict_origin: errorCode,
    });
    await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');
    console.log('[ConflictRecovery] System error — suggestions found, transitioned to awaiting_slot_selection');

    const formatted = formatSuggestionSlots(suggestions);
    return {
      result: JSON.stringify({
        success: false,
        recovery_message: `Ocorreu um problema temporário ao confirmar o seu agendamento. Aqui estão horários disponíveis:\n${formatted}\n\nQual prefere?`,
        error_code: errorCode,
        _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
      }),
      isRecovery: true,
    };
  } else {
    await updateConversationState(supabase, conversationId, 'collecting_data');
    console.log('[ConflictRecovery] System error — no suggestions, reverted to collecting_data');

    return {
      result: JSON.stringify({
        success: false,
        recovery_message: 'Estamos com uma dificuldade temporária para confirmar o seu agendamento. Por favor, tente novamente em breve.',
        error_code: errorCode,
        _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
      }),
      isRecovery: true,
    };
  }
}

// =============================================
// Tool Definitions for AI
// =============================================

const BOOKING_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'create_appointment_real',
    description: `Criar um agendamento real e CONFIRMADO para o cliente.
REGRA OBRIGATÓRIA — Chama APENAS quando conversation_state === 'booking_processing'.
NUNCA chames esta tool se conversation_state !== 'booking_processing'.
IMPORTANTE: Usa service_name com o nome do serviço em linguagem natural (ex: "Tratamento de Cárie"). O backend resolve automaticamente para o ID correto.`,
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Nome completo do cliente' },
        customer_email: { type: 'string', description: 'Email do cliente' },
        customer_phone: { type: 'string', description: 'Telefone do cliente (opcional)' },
        start_datetime: { type: 'string', description: 'Data e hora de início no formato ISO 8601 com timezone Europe/Lisbon. Exemplo: 2026-02-18T09:30:00+00:00.' },
        end_datetime: { type: 'string', description: 'Data e hora de fim no formato ISO 8601 (opcional)' },
        reason: { type: 'string', description: 'Motivo do agendamento (ex: "Dor de dentes", "Consulta de rotina")' },
        resource_id: { type: 'string', description: 'ID do recurso (opcional)' },
        service_name: { type: 'string', description: 'Nome do serviço em linguagem natural (ex: "Tratamento de Cárie", "Consulta Geral"). O backend resolve automaticamente.' },
        service_id: { type: 'string', description: 'UUID do serviço (opcional, preferir service_name)' },
      },
      required: ['customer_name', 'customer_email', 'start_datetime'],
    },
  },
};

// =============================================
// Unified Service Resolution Pipeline
// =============================================

/**
 * Single entry point for service resolution.
 * Tier 1: Deterministic keyword matching
 * Tier 2: Semantic LLM fallback (if deterministic fails)
 * (Tier 3 fallback removed — pipeline returns null if both tiers fail)
 * 
 * Called ONCE before awaiting_confirmation. No other code resolves services.
 */
// deno-lint-ignore no-explicit-any
async function runServiceResolutionPipeline(
  supabase: any,
  empresaId: string,
  reasonOriginal?: string,
): Promise<{ service_id: string; reason_normalized: string } | null> {
  if (!reasonOriginal) {
    console.log('[ServicePipeline] No reason provided — skipping');
    return null;
  }

  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/s\b/g, '') // strip trailing 's' for singular/plural matching
      .trim();

  const input = normalize(reasonOriginal);

  // Fetch only bookable services that have at least one linked resource
  const { data: services } = await supabase
    .from('scheduling_services')
    .select('id, name, description, priority, scheduling_service_resources!inner(resource_id)')
    .eq('empresa_id', empresaId)
    .eq('status', 'active')
    .eq('bookable', true);

  if (!services?.length) {
    console.log('[ServicePipeline] No bookable services with resources found');
    return null;
  }

  // === TIER 1: Deterministic keyword matching ===
  // deno-lint-ignore no-explicit-any
  let best: any = null;
  let bestScore = 0;

  for (const svc of services) {
    let score = 0;
    const nameNorm = normalize(svc.name);
    const descNorm = normalize(svc.description || '');

    if (input.includes(nameNorm)) score += 100;
    else if (nameNorm.includes(input)) score += 60;

    if (descNorm.includes(input)) score += 40;

    score += (svc.priority || 0) * 5;

    if (score > bestScore) {
      bestScore = score;
      best = svc;
    }
  }

  if (best && bestScore >= 50) {
    console.log(`[ServicePipeline] Tier 1 (deterministic): ${best.name} (score=${bestScore})`);
    return { service_id: best.id, reason_normalized: best.name };
  }

  console.log(`[ServicePipeline] Tier 1 failed (bestScore=${bestScore}) — trying semantic`);

  // === TIER 2: Semantic LLM fallback ===
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (lovableKey) {
    try {
      const semanticId = await resolveServiceSemantically(
        reasonOriginal,
        services as ServiceCandidate[],
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        `Bearer ${lovableKey}`,
        'google/gemini-2.5-flash',
      );
      if (semanticId) {
        const matchedSvc = services.find((s: { id: string }) => s.id === semanticId);
        console.log(`[ServicePipeline] Tier 2 (semantic): ${matchedSvc?.name || semanticId}`);
        return { service_id: semanticId, reason_normalized: matchedSvc?.name || '' };
      }
    } catch (semErr) {
      console.warn('[ServicePipeline] Semantic resolver error:', semErr);
    }
  }

  console.log('[ServicePipeline] All tiers failed — no service resolved');
  return null;
}

// =============================================
// Helpers
// =============================================

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// =============================================
// Tool Execution Handler
// =============================================

// deno-lint-ignore no-explicit-any
async function handleToolCall(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  toolName: string,
  // deno-lint-ignore no-explicit-any
  toolArgs: any,
  empresaId: string,
  agentId: string | null,
  conversationId: string,
  // deno-lint-ignore no-explicit-any
  currentContext: Record<string, any>,
  aiConfig?: { endpoint: string; authHeader: string; model: string },
): Promise<{ result: string; isRecovery: boolean }> {
  // Defensive guard: ensure currentContext is always a valid object
  if (!currentContext || typeof currentContext !== 'object') {
    console.warn('[handleToolCall] currentContext missing or invalid — defaulting to {}');
    currentContext = {};
  }

  if (toolName === 'create_appointment_real') {
    // === EXECUTION PREVENTION GUARD ===
    // This tool is globally disabled and must never execute
    if (true) {
      console.log('[EXECUTION_BLOCKED] create_appointment_real is disabled');
      return {
        result: JSON.stringify({
          success: false,
          error_code: 'TOOL_DISABLED',
          message: 'This booking tool is currently disabled and cannot be executed.',
        }),
        isRecovery: true,
      };
    }

    // === RESCHEDULE GUARD: Skip ServiceResolver/ReasonRefinement if reschedule ===
    const isRescheduleToolCall = !!currentContext.appointment_id || !!currentContext._reschedule_pending;

    // =============================================
    // HARD LOCK — SINGLE EXECUTION GUARANTEE
    // =============================================
    console.log('[BOOKING_EXECUTION] LOCK_CHECK_START');

    // GUARD 1: booking_finalized === true
    if (currentContext.booking_finalized === true) {
      console.log('[BOOKING BLOCKED - ALREADY FINALIZED] booking_finalized=true');
      const existingAppointmentId = currentContext.appointment_id || currentContext.booking_id;
      const existingStart = currentContext.confirmed_start;
      return {
        result: JSON.stringify({
          success: true,
          appointment_id: existingAppointmentId,
          start: existingStart,
          message: 'O agendamento já foi confirmado com sucesso.',
          _duplicate_blocked: true,
        }),
        isRecovery: false,
      };
    }

    // GUARD 2: appointment_id exists (active booking)
    if (currentContext.appointment_id) {
      console.log('[BOOKING BLOCKED - ALREADY FINALIZED] appointment_id exists');
      return {
        result: JSON.stringify({
          success: true,
          appointment_id: currentContext.appointment_id,
          start: currentContext.confirmed_start,
          message: 'O agendamento já foi confirmado com sucesso.',
          _duplicate_blocked: true,
        }),
        isRecovery: false,
      };
    }

    // GUARD 3: confirmed_snapshot exists (booking was committed)
    if (currentContext.confirmed_snapshot) {
      console.log('[BOOKING BLOCKED - ALREADY FINALIZED] confirmed_snapshot exists');
      const snapshot = currentContext.confirmed_snapshot as Record<string, unknown>;
      return {
        result: JSON.stringify({
          success: true,
          appointment_id: currentContext.booking_id || snapshot?.appointment_id,
          start: currentContext.confirmed_start,
          message: 'O agendamento já foi confirmado com sucesso.',
          _duplicate_blocked: true,
        }),
        isRecovery: false,
      };
    }

    // GUARD 4: confirmed_start + slot_confirmed (booking completed via another path)
    if (currentContext.confirmed_start && currentContext.slot_confirmed === true) {
      console.log('[BOOKING BLOCKED - ALREADY FINALIZED] confirmed_start + slot_confirmed');
      return {
        result: JSON.stringify({
          success: true,
          appointment_id: currentContext.booking_id,
          start: currentContext.confirmed_start,
          message: 'O agendamento já foi confirmado com sucesso.',
          _duplicate_blocked: true,
        }),
        isRecovery: false,
      };
    }

    // GUARD 5: ATOMIC LOCK — booking_in_progress already true (another execution in flight)
    if (currentContext.booking_in_progress === true) {
      // Re-fetch from DB to confirm it's not stale
      const freshLockCtx = await getConversationContext(supabase, conversationId);
      const freshCtx = (freshLockCtx?.conversation_context ?? {}) as Record<string, unknown>;
      if (freshCtx.booking_in_progress === true && !freshCtx.booking_finalized) {
        console.log('[BOOKING BLOCKED - IN PROGRESS] booking_in_progress=true (concurrent execution detected)');
        return {
          result: JSON.stringify({
            success: false,
            error_code: 'BOOKING_IN_PROGRESS',
            message: 'O agendamento está a ser processado. Aguarde um momento.',
            _duplicate_blocked: true,
          }),
          isRecovery: true,
        };
      }
      // If booking_finalized became true between reads, block as finalized
      if (freshCtx.booking_finalized === true) {
        console.log('[BOOKING BLOCKED - ALREADY FINALIZED] booking_finalized detected on re-check');
        return {
          result: JSON.stringify({
            success: true,
            appointment_id: freshCtx.appointment_id || freshCtx.booking_id,
            start: freshCtx.confirmed_start,
            message: 'O agendamento já foi confirmado com sucesso.',
            _duplicate_blocked: true,
          }),
          isRecovery: false,
        };
      }
    }

    // GUARD 6: State must be booking_processing
    const currentConvStatePreLock = await getConversationContext(supabase, conversationId);
    const preLockState = currentConvStatePreLock?.conversation_state || 'idle';
    if (preLockState !== 'booking_processing') {
      console.log(`[BOOKING BLOCKED - INVALID STATE] state="${preLockState}" — must be "booking_processing"`);
      return {
        result: JSON.stringify({
          success: false,
          error_code: 'INVALID_STATE_FOR_BOOKING',
          recovery_message: 'O agendamento precisa de confirmação antes de ser processado.',
        }),
        isRecovery: true,
      };
    }

    // === ALL GUARDS PASSED — SET ATOMIC LOCK ===
    console.log('[BOOKING_EXECUTION] START — all guards passed, setting booking_in_progress=true');
    await mergeConversationContext(supabase, conversationId, { booking_in_progress: true });

    console.log('[Scheduling] Tool call received — booking_processing state');

    // === SERVICE RESOLUTION: Use ONLY pre-resolved service_id from context ===
    // Service MUST be resolved by runServiceResolutionPipeline before awaiting_confirmation.
    // Tool handler does NOT resolve services — it only reads from context.
    let resolvedServiceId: string | undefined = undefined;

    const preResolvedServiceId = (currentContext.service_id as string);
    if (preResolvedServiceId && isValidUUID(preResolvedServiceId)) {
      resolvedServiceId = preResolvedServiceId;
      console.log(`[ServiceResolver] Using pre-resolved service from context: ${resolvedServiceId}`);
    }

    if (isRescheduleToolCall) {
      console.log('[ServiceResolver] Reschedule flow — service locked from confirmed_snapshot');
      resolvedServiceId = resolvedServiceId || 
                          (currentContext.confirmed_snapshot as Record<string, unknown>)?.service_id as string || undefined;
    }

    if (!resolvedServiceId) {
      console.error('[ServiceResolver] STRUCTURAL ERROR: service_id not pre-resolved before booking');
      await updateConversationState(supabase, conversationId, 'collecting_data');
      return {
        result: JSON.stringify({
          success: false,
          recovery_message: 'Não consegui identificar o serviço pretendido. Pode indicar o motivo da consulta?',
          error_code: 'SERVICE_NOT_RESOLVED',
        }),
        isRecovery: true,
      };
    }

    if (!empresaId) {
      console.error('[ChatAI] BLOCKED: Missing empresa_id before booking');
      return {
        result: JSON.stringify({
          success: false,
          recovery_message: 'Erro interno: empresa não identificada. Tente novamente.',
          error_code: 'MISSING_EMPRESA_ID',
        }),
        isRecovery: true,
      };
    }

    console.log(`[ChatAI] empresa_id: ${empresaId}`);

    // State + lock already validated above in HARD LOCK section
    console.log('[Scheduling] Delegating to BookingEngine');

    const bookingResult: BookingResult = await createInternalBooking({
      supabase,
      company_id: empresaId,
      agent_id: agentId || undefined,
      conversation_id: conversationId,
      customer_name: toolArgs.customer_name || '',
      customer_email: toolArgs.customer_email || '',
      customer_phone: toolArgs.customer_phone,
      start_datetime: toolArgs.start_datetime,
      reason: toolArgs.reason || (currentContext?.reason as string) || undefined,
      resource_id: toolArgs.resource_id,
      service_id: resolvedServiceId,
      conversation_context: currentContext,
    });

    // === REASON REFINEMENT: Update reason + reason_normalized to official service name after resolution ===
    // RESCHEDULE GUARD: Skip reason refinement during reschedule — reason is locked
    if (resolvedServiceId && !isRescheduleToolCall) {
      try {
        const { data: resolvedSvc } = await supabase
          .from('scheduling_services')
          .select('name')
          .eq('id', resolvedServiceId)
          .single();
        if (resolvedSvc?.name) {
          const currentReason = (currentContext?.reason as string) || '';
          const updateFields: Record<string, unknown> = {};
          if (currentReason !== resolvedSvc.name) {
            updateFields.reason = resolvedSvc.name;
          }
          // Always set reason_normalized to the official service name
          updateFields.reason_normalized = resolvedSvc.name;
          if (Object.keys(updateFields).length > 0) {
            await mergeConversationContext(supabase, conversationId, updateFields);
            console.log(`[ReasonRefinement] Updated reason_normalized to: "${resolvedSvc.name}"`);
          }
        }
      } catch (e) {
        console.warn('[ReasonRefinement] Non-blocking error:', e);
      }
    } else if (isRescheduleToolCall) {
      console.log('[ReasonRefinement] SKIPPED — reschedule flow (reason locked from confirmed_snapshot)');
    }

    if (bookingResult.success) {
      console.log('[BOOKING_EXECUTION] SUCCESS');
      console.log(`[BOOKING_EXECUTION] Final decision: SUCCESS_CONFIRMED`);
      // === RUNTIME LOG: Booking success ===
      runtimeLog(supabase, empresaId, conversationId, 'booking_result', 'Booking succeeded', { appointment_id: bookingResult.appointment_id, success: true });

      // Re-fetch context from DB to capture ReasonRefinement updates
      const postBookingCtx = await getConversationContext(supabase, conversationId);
      const finalContext = postBookingCtx?.conversation_context || currentContext;
      const finalReason = (finalContext.reason as string) || (currentContext?.reason as string) || toolArgs.reason || null;

      // === COMMIT GUARD: DB row verification before commit ===
      // Step 0: Verify the appointment actually exists in agendamentos
      const { data: dbAppointment, error: dbVerifyError } = await supabase
        .from('agendamentos')
        .select('id')
        .eq('id', bookingResult.appointment_id)
        .maybeSingle();

      if (dbVerifyError || !dbAppointment) {
        console.error(`[CommitGuard] CRITICAL — appointment not found in DB: ${bookingResult.appointment_id}`);
        console.log('[CommitGuard] Atomic rollback executed');
        await updateConversationState(supabase, conversationId, 'collecting_data');
        await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });
        return {
          result: JSON.stringify({
            success: false,
            message: 'Ocorreu um erro ao confirmar o agendamento. Vamos tentar novamente.',
          }),
          isRecovery: true,
        };
      }
      console.log(`[CommitGuard] DB verification passed: ${bookingResult.appointment_id}`);

      // === COMMIT GUARD: Atomic commit order ===
      // Step 1: Persist appointment_id + confirmed_snapshot FIRST
      const snapshotData = {
        appointment_id: bookingResult.appointment_id,
        confirmed_start: bookingResult.start,
        confirmed_end: bookingResult.end,
        booking_in_progress: false,
        booking_id: bookingResult.appointment_id,
        confirmed_snapshot: {
          service_id: resolvedServiceId || (finalContext.service_id as string) || null,
          reason_original: (finalContext.reason_original as string) || finalReason || null,
          reason_normalized: (finalContext.reason_normalized as string) || finalReason || null,
          reason: finalReason,
          customer_name: (finalContext.customer_name as string) || toolArgs.customer_name || null,
          customer_email: (finalContext.customer_email as string) || toolArgs.customer_email || null,
          customer_phone: (finalContext.customer_phone as string) || toolArgs.customer_phone || null,
        },
      };

      const snapshotPersisted = await mergeConversationContext(supabase, conversationId, snapshotData);

      if (!snapshotPersisted) {
        // Snapshot persistence failed → atomic rollback
        console.error('[CommitGuard] Snapshot persistence failed');
        console.log('[CommitGuard] Atomic rollback executed');
        await updateConversationState(supabase, conversationId, 'collecting_data');
        await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });
        return {
          result: JSON.stringify({
            success: false,
            message: 'Ocorreu um erro ao confirmar o agendamento. Vamos tentar novamente.',
          }),
          isRecovery: true,
        };
      }

      // Step 2: Verify appointment_id and confirmed_snapshot are persisted before transitioning
      const verifyCtx = await getConversationContext(supabase, conversationId);
      const verifiedContext = verifyCtx?.conversation_context || {};
      if (!verifiedContext.appointment_id || !verifiedContext.confirmed_snapshot) {
        console.error('[CommitGuard] Blocked invalid booking_active transition — missing appointment_id or confirmed_snapshot after persist');
        console.log('[CommitGuard] Atomic rollback executed');
        await updateConversationState(supabase, conversationId, 'collecting_data');
        await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });
        return {
          result: JSON.stringify({
            success: false,
            message: 'Ocorreu um erro ao confirmar o agendamento. Vamos tentar novamente.',
          }),
          isRecovery: true,
        };
      }

      // Step 3: Hard guard — appointment_id MUST exist before booking_active
      if (!verifiedContext.appointment_id) {
        console.error('[CommitGuard] BLOCKED — booking_active without appointment_id');
        throw new Error('Invalid state transition: missing appointment_id');
      }

      // Step 4: Only NOW transition to booking_active
      await updateConversationState(supabase, conversationId, 'booking_active');
      console.log('[CommitGuard] Commit successful');

      // --- POST BOOKING CLEANUP (STRUCTURAL HARDENING) ---
      // Remove transient scheduling signals to prevent false reschedule triggers
      const postBookingCleanup: Record<string, unknown> = {
        booking_finalized: true,
        booking_in_progress: false,
      };
      // Fetch current full context to perform cleanup
      const cleanupCtx = await getConversationContext(supabase, conversationId);
      const cleanedContext = { ...(cleanupCtx?.conversation_context || {}) };
      const TRANSIENT_FIELDS = [
        'preferred_date',
        'reschedule_pending_datetime',
        'reschedule_new_start',
        'reschedule_new_end',
        'reschedule_new_date',
        '_reschedule_pending',
        '_reschedule_conflict',
        'conflict_suggestions',
        'conflict_origin',
      ];
      for (const field of TRANSIENT_FIELDS) {
        delete cleanedContext[field];
      }
      cleanedContext.booking_finalized = true;
      cleanedContext.booking_in_progress = false;

      // Write cleaned context directly (full replace, not merge)
      await supabase
        .from('conversations')
        .update({ conversation_context: cleanedContext })
        .eq('id', conversationId);
      console.log('[PostBookingCleanup] Transient fields removed, booking_finalized=true');

      // === POST-BOOKING: Mark conversation as completed (NOT closed immediately) ===
      // Conversation will auto-close after 60 minutes of inactivity via closeIdleConversations
      try {
        await supabase
          .from('conversations')
          .update({ status: 'completed' })
          .eq('id', conversationId);
        console.log('[PostBooking] Conversation marked as completed (will auto-close after 60min inactivity)');
        
        // Emit booking_confirmed event for follow-up rules (non-blocking)
        const { emitPlatformEvent } = await import('../_shared/platform-events.ts');
        emitPlatformEvent({
          type: 'booking_confirmed',
          empresa_id: empresaId,
          conversation_id: conversationId,
          payload: {
            appointment_id: bookingResult.appointment_id,
            summary: `Agendamento confirmado`,
          },
          supabase,
        }).catch(e => console.warn('[PostBooking] Platform event failed (non-blocking):', e));
      } catch (postBookingErr) {
        console.error('[PostBooking] Non-blocking error:', postBookingErr);
      }

      return {
        result: JSON.stringify({
          success: true,
          appointment_id: bookingResult.appointment_id,
          start: bookingResult.start,
          end: bookingResult.end,
          message: bookingResult.message,
        }),
        isRecovery: false,
      };
    }

    // === BOOKING FAILED — Deterministic Conflict Recovery Engine ===
    console.log(`[Scheduling] Final decision: FAILED_${bookingResult.error_code || bookingResult.state}`);
    // === RUNTIME LOG: Booking failure ===
    runtimeLog(supabase, empresaId, conversationId, 'booking_result', `Booking failed: ${bookingResult.error_code || 'unknown'}`, { success: false, error_code: bookingResult.error_code, error_message: bookingResult.message });
    console.log('[CommitGuard] Atomic rollback executed');

    return await handleBookingFailure(
      supabase,
      conversationId,
      empresaId,
      bookingResult,
      currentContext,
      resolvedServiceId,
    );
  }

  return { result: JSON.stringify({ error: 'Unknown tool' }), isRecovery: false };
}

// Get the default chat agent for a company with fallback logic
// deno-lint-ignore no-explicit-any
async function getDefaultChatAgent(supabase: any, empresaId: string): Promise<Agent | null> {
  const { data: defaultAgent } = await supabase
    .from('agentes')
    .select('id, nome, prompt_base, personalidade, contexto_negocio, is_default_chat_agent, response_style')
    .eq('empresa_id', empresaId)
    .eq('is_default_chat_agent', true)
    .eq('status', 'ativo')
    .limit(1)
    .maybeSingle();

  if (defaultAgent) return defaultAgent as Agent;

  const { data: anyAgent } = await supabase
    .from('agentes')
    .select('id, nome, prompt_base, personalidade, contexto_negocio, is_default_chat_agent, response_style')
    .eq('empresa_id', empresaId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return anyAgent as Agent | null;
}

/**
 * Register credit usage for an action.
 */
// deno-lint-ignore no-explicit-any
async function registerCreditUsage(
  supabase: any,
  empresaId: string,
  eventType: string,
  referenceId: string
) {
  const CREDIT_VALUES: Record<string, number> = {
    message: 1,
    call_completed: 30,
    call_short: 5,
    agent_test: 1,
  };

  const creditsConsumed = CREDIT_VALUES[eventType] || 0;
  if (creditsConsumed === 0) return;
  if (!empresaId || !referenceId) {
    console.error('[Credits] BLOCKED: Missing empresa_id or reference_id');
    return;
  }

  const { data: existing } = await supabase
    .from('credits_events')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('event_type', eventType)
    .eq('reference_id', referenceId)
    .maybeSingle();

  if (existing) {
    console.log(`[Credits] Already registered ${eventType} for ${referenceId}`);
    return;
  }

  await supabase.from('credits_events').insert({
    empresa_id: empresaId,
    event_type: eventType,
    credits_consumed: creditsConsumed,
    reference_id: referenceId,
    metadata: { registered_at: new Date().toISOString() },
  });

  const currentMonth = new Date().toISOString().substring(0, 7);
  
  const { data: usage } = await supabase
    .from('credits_usage')
    .select('id, credits_used')
    .eq('empresa_id', empresaId)
    .eq('month', currentMonth)
    .maybeSingle();

  if (usage) {
    await supabase
      .from('credits_usage')
      .update({ credits_used: usage.credits_used + creditsConsumed })
      .eq('id', usage.id);
  } else {
    await supabase.from('credits_usage').insert({
      empresa_id: empresaId,
      month: currentMonth,
      credits_used: creditsConsumed,
      credits_limit: 1000,
    });
  }

  console.log(`[Credits] ✓ Registered: ${eventType} = ${creditsConsumed} for empresa ${empresaId}`);
}

// =============================================
// State Machine Prompt Injection
// =============================================

function generateStateMachinePrompt(
  currentState: ConversationState,
  context: Record<string, unknown>,
): string {
  const collectedFields: string[] = [];
  if (context.customer_name) collectedFields.push(`Nome: ${context.customer_name}`);
  if (context.customer_email) collectedFields.push(`Email: ${context.customer_email}`);
  if (context.customer_phone) collectedFields.push(`Telefone: ${context.customer_phone}`);
  if (context.reason) collectedFields.push(`Motivo: ${context.reason}`);
  if (context.booking_intent) collectedFields.push(`Intenção de marcação: ${context.booking_intent}`);
  if (context.preferred_date) collectedFields.push(`Data preferida: ${context.preferred_date}`);
  if (context.selected_datetime) collectedFields.push(`Data/Hora selecionada: ${context.selected_datetime}`);

  const contextSummary = collectedFields.length > 0
    ? `\nDados já recolhidos:\n${collectedFields.join('\n')}`
    : '\nNenhum dado recolhido ainda.';

  return `
=== CONVERSATION STATE MACHINE (OBRIGATÓRIO) ===

ESTADO ATUAL: ${currentState}
${contextSummary}

REGRA ABSOLUTA: Segue APENAS as instruções do estado atual. NUNCA saltes estados.
REGRA DE TOM: Sê natural, breve e guia o utilizador passo a passo. Evita linguagem robótica ou repetitiva.

--- ESTADO: idle ---
Se o utilizador expressar intenção de marcação, consulta, tratamento ou qualquer serviço:
→ Reconhece com empatia ("Claro, posso ajudar com isso!")
→ O sistema transita automaticamente para collecting_data
→ Não repitas o que o utilizador já disse — avança naturalmente

--- ESTADO: collecting_data ---
Recolhe os dados em falta de forma conversacional:
- customer_name, customer_email, customer_phone, reason, preferred_date

REGRAS:
- Pergunta 1-2 campos de cada vez, como faria uma recepcionista simpática
- NUNCA repitas campos que já existem no contexto
- Se o utilizador der vários dados numa mensagem, aceita todos
- Usa frases curtas e diretas: "Qual o seu nome?" em vez de "Para prosseguir com o agendamento, preciso do seu nome completo."
- Quando tudo estiver preenchido → o sistema avança automaticamente

--- ESTADO: awaiting_confirmation ---
O resumo já foi mostrado pelo sistema. Tu NÃO geras resumos.
PROIBIDO gerar blocos com 📅 🕐 🧾 👤 📧 📱 ou listas de dados.
A tua função é APENAS:
- Responder a dúvidas do utilizador de forma natural
- Manter o contexto intacto
Confirmações aceites: "Sim", "Ok", "Confirmo", "Pode ser", "Perfeito", "Tudo bem", "Avança", "Certo", etc.
Se o utilizador mudar data/hora → o sistema gera novo resumo automaticamente.
NUNCA chames create_appointment_real neste estado.

--- ESTADO: booking_processing ---
O utilizador confirmou. Chama create_appointment_real com os dados do contexto.
Se sucesso → confirma com data e hora.
Se conflito → sugere alternativas.
NUNCA produzas respostas vazias.

--- ESTADO: booking_active ---
Existe um agendamento confirmado. NÃO cries novos.
Se pedir alteração de data/hora → o sistema inicia reagendamento.
Responde normalmente a dúvidas.

--- ESTADO: rescheduling ---
Se a mensagem contém nova data, o sistema valida automaticamente.
Se não, pergunta de forma simples: "Para que dia e hora prefere reagendar?"
Se disponível → confirmação. Se não → mostra alternativas.

--- ESTADO: awaiting_slot_selection ---
O sistema apresentou opções de horário numeradas.
Aceita respostas como:
- Número: "1", "2", "3"
- Hora: "10h", "10:00"
- Confirmação curta (se 1 opção): "ok", "sim", "esse"
- Referência: "o primeiro", "a próxima", "o último", "mais cedo", "mais tarde"
- Ordinal: "a segunda", "o terceiro"
Se a resposta não corresponder → re-apresenta as opções com paciência.
Se o utilizador fizer uma pergunta → responde e re-apresenta.
NUNCA saltes para booking_processing. NUNCA trates perguntas como erros.

=== FIM DA STATE MACHINE ===
`;
}

/**
 * Build the system prompt with available actions based on service permissions
 */
function buildActionAwarePrompt(
  basePrompt: string,
  permissions: ServicePermissions,
  empresaName: string,
  userMessage: string,
  currentState: ConversationState,
  conversationContext: Record<string, unknown>,
): string {
  const availableActions: string[] = [];
  const disabledServices: string[] = [];
  
  if (permissions.service_chat_enabled) {
    availableActions.push(
      '- Responder a perguntas com informação da base de conhecimento',
      '- Recolher dados de contacto (nome, email obrigatório, telefone)',
      '- Enviar links relevantes',
      '- Transferir para operador humano quando necessário'
    );
  } else {
    disabledServices.push('Chat');
  }
  
  if (permissions.service_scheduling_enabled) {
    availableActions.push(
      '- Criar agendamentos usando a tool create_appointment_real (APENAS quando conversation_state === booking_processing)',
      '- Reagendar ou cancelar marcações existentes'
    );
  } else {
    disabledServices.push('Agendamentos');
  }
  
  if (permissions.service_email_enabled) {
    availableActions.push('- Enviar emails de follow-up');
  } else {
    disabledServices.push('Email automático');
  }

  const actionsSection = availableActions.length > 0 
    ? `\n\nAções que podes executar:\n${availableActions.join('\n')}`
    : '\n\nNeste momento estás limitado a responder a perguntas. Outras ações não estão disponíveis.';

  const productionRules = `

=== ESTILO CONVERSACIONAL ===

Tom: Como uma recepcionista simpática e profissional — acolhedora, eficiente, nunca robótica.

REGRAS DE OURO:
- Respostas curtas e diretas (máximo 2-3 frases por mensagem)
- Reconhece o que o utilizador disse antes de pedir mais dados
- Pergunta UMA coisa de cada vez (excepto quando precisa de nome + email juntos)
- Usa linguagem coloquial mas profissional
- Guia o utilizador ao próximo passo com sugestões claras
- NUNCA repitas informação que o utilizador já deu
- NUNCA uses frases longas e formais como "Para prosseguir com o agendamento, necessito..."
- Prefere: "Qual o seu nome?" em vez de "Para concluir o processo de agendamento, preciso do seu nome completo, por favor."

Se o utilizador mencionar sintomas ou descrições informais (ex: "dente a doer", "acho que é uma cárie", "preciso ver um dente", "tenho dor"):
- Interpreta como intenção de serviço
- Dá uma breve reassurance
- Continua naturalmente para o agendamento
- NÃO peças o nome exato do serviço

=== REGRAS CRÍTICAS ===

1. CONFIRMAÇÃO DE AÇÕES:
   - NUNCA confirmes uma ação sem resposta de SUCESSO do sistema
   - Se o sistema falhar: usa APENAS o recovery_message fornecido
   - Usa linguagem cautelosa até receberes confirmação técnica

2. INTERPRETAÇÃO DE DATAS (CRÍTICO):
    - "18/02/2026" → 2026-02-18
    - "dia 18 às 9h30" → assume mês atual ou seguinte
    - "segunda às 10h" → próxima segunda-feira
    - "amanhã" → data de AMANHÃ no fuso Europe/Lisbon
    - "hoje" → data de HOJE no fuso Europe/Lisbon
    - NUNCA perguntes mês/ano se a data é inferível
    - Converte SEMPRE para ISO 8601

3. RESOLUÇÃO DE SERVIÇO:
    - Podes enviar service_name (texto livre) — o backend resolve automaticamente
    - NÃO inventes UUIDs

4. SERVIÇOS NÃO DISPONÍVEIS:
${disabledServices.length > 0 
    ? `   Os seguintes serviços NÃO estão ativos: ${disabledServices.join(', ')}`
    : '   Todos os serviços estão ativos.'}

5. LINGUAGEM:
   - Deteta o idioma do utilizador e responde no mesmo
   - Default: Português (PT-PT)

6. PREÇOS (REGRA ABSOLUTA):
   - NUNCA inventes, estimes ou sugiras valores numéricos de preços
   - NUNCA menciones valores de mercado, valores típicos ou intervalos de preço
   - Os preços são geridos pelo motor determinístico do sistema — NÃO tens acesso a dados de preço
   - Se o utilizador perguntar sobre preços, o sistema responde automaticamente com dados reais
   - NÃO geres respostas sobre preços — o motor do backend trata isso
   - Esta regra sobrepõe-se a toda a criatividade do modelo

7. BLOCOS DE CONFIRMAÇÃO (REGRA ABSOLUTA):
   - NUNCA geres blocos de confirmação estruturados com dados do agendamento
   - NUNCA uses emojis 📅 🕐 🧾 👤 📧 📱 para listar dados de marcação
   - NUNCA recapitules data, hora, nome, email, telefone ou motivo em formato de resumo/lista
   - Os blocos de confirmação são gerados EXCLUSIVAMENTE pelo backend (sistema)
   - Se o estado for awaiting_confirmation, responde APENAS de forma conversacional
    - Esta regra sobrepõe-se a QUALQUER instrução anterior sobre confirmação

 8. DISPONIBILIDADE ANTES DE CONFIRMAÇÃO (REGRA ABSOLUTA):
    - NUNCA digas "vou agendar", "vamos marcar", "I will schedule" ou qualquer frase de compromisso ANTES de a disponibilidade ter sido verificada
    - A ordem OBRIGATÓRIA é: detetar data/hora → verificar disponibilidade → apresentar slots → utilizador seleciona → confirmação → criar agendamento
    - Antes da verificação de disponibilidade, usa linguagem como "vou verificar a disponibilidade" ou "deixe-me ver os horários"
    - NUNCA assumes que um horário está disponível — o motor de disponibilidade é a única fonte de verdade

8. RESPOSTAS COMPLETAS (REGRA ABSOLUTA):
   - NUNCA produzes respostas incompletas como "vou verificar", "a verificar disponibilidade", "aguarde um momento"
   - TODAS as respostas devem ser uma de: resposta final, pergunta clara, ou lista de slots disponíveis
   - O utilizador NUNCA deve ficar a esperar uma segunda mensagem
   - Se precisares de dados do backend, o sistema já os forneceu no contexto — usa-os diretamente

9. DADOS COMERCIAIS EXTERNOS (REGRA ABSOLUTA):
   - NUNCA inventes informação comercial: produtos, propriedades, inventário, preços, disponibilidade de imóveis, stock, etc.
   - Se o utilizador pedir informação que depende de dados externos (catálogos, listagens, inventário) e NÃO existirem dados no contexto, NÃO fabrica respostas.
   - Se o sistema de agendamento estiver disponível, propõe SEMPRE agendar uma reunião ou visita: "Podemos agendar uma visita ou reunião para tratar disso. Qual o dia que prefere?"
   - NUNCA digas "um consultor irá contactar", "vamos encaminhar o seu pedido", "a nossa equipa entrará em contacto" — a menos que exista um sistema real de escalação ativo.
   - Se NÃO existir agendamento disponível, oferece recolha de dados: "Posso registar o seu contacto para que a equipa entre em contacto consigo."
   - Esta regra aplica-se a QUALQUER vertical de negócio (imobiliário, clínicas, ginásios, restaurantes, etc.)
   - NUNCA assumes que tens acesso a dados de negócio que não foram explicitamente fornecidos no contexto da conversa.

10. PROTEÇÃO DE FLUXO DE AGENDAMENTO (REGRA ABSOLUTA):
    - Se o fluxo de agendamento estiver ativo, NUNCA retornes ao menu de serviços.
    - Continua o fluxo de recolha de dados ou confirmação em curso.
    - Só podes reiniciar o fluxo se o utilizador cancelar explicitamente.

11. VALIDAÇÃO DE EMAIL:
    - Antes de aceitar um email, verifica se o formato parece válido (contém @ e domínio).
    - Se o email parecer inválido, pede ao utilizador para corrigir antes de avançar.`;

// =============================================
// Action-Based LLM Response Generator (Phase 2)
// Uses structured actions from booking-v2 to generate natural responses.
// Falls back to the legacy response string if LLM fails.
// =============================================

const ACTION_PROMPT_MAP: Record<string, string> = {
  ask_datetime: 'Ask the customer for their preferred date and time for the appointment. Be friendly and give an example format.',
  ask_time: 'The customer provided a date but not a time. Ask them what time they prefer. The date is already confirmed.',
  ask_confirmation: 'Present the appointment details and ask the customer to confirm. Include the date/time from payload.datetime.',
  booking_confirmed: 'Confirm that the appointment has been successfully created. Include the date/time. Be enthusiastic.',
  show_alternatives: 'The requested slot is unavailable. Present the alternative slots from payload.alternatives. Ask which one they prefer.',
  ask_contact: 'Ask the customer for their missing contact information (name and/or email/phone) to finalize the booking.',
  booking_denied: 'The customer cancelled. Acknowledge and ask if they want to book a different time.',
  interruption: 'Answer the side question briefly, then redirect back to the booking flow.',
  already_done: 'The booking is already confirmed. Let the customer know and ask if they need anything else.',
  reschedule_ask_datetime: 'The customer wants to reschedule. Ask for the new preferred date and time.',
  reschedule_ask_time: 'The customer wants to reschedule and provided a date. Ask for the preferred time.',
  reschedule_ask_confirmation: 'Present the reschedule change (from original to proposed datetime) and ask for confirmation.',
  reschedule_confirmed: 'Confirm the reschedule was successful. Show the new date/time.',
  reschedule_denied: 'The customer decided not to reschedule. Keep the original appointment.',
  reschedule_show_alternatives: 'The requested reschedule slot is unavailable. Show alternatives.',
  reschedule_race_condition: 'The slot was taken. Ask for another time.',
  race_condition: 'The slot was taken between confirmation and creation. Ask to choose another time.',
  booking_error: 'There was an error creating the booking. Ask the customer to try again.',
  reschedule_error: 'There was an error updating the appointment. Ask the customer to try again.',
  reschedule_not_found: 'Could not find the appointment to reschedule. Suggest contacting support.',
  contact_received: 'Contact information received. Processing the booking.',
  fallback: 'Ask if the customer needs help with anything.',
};

async function generateActionBasedResponse(
  action: string,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
  userMessage: string,
  fallbackResponse: string,
  // deno-lint-ignore no-explicit-any
  bookingContext?: Record<string, any>,
  lastMessages?: Array<{ sender_type: string; content: string }>,
): Promise<string | null> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) {
    console.log('[BookingV2-LLM] No LOVABLE_API_KEY — skipping LLM generation');
    return null;
  }

  const instruction = ACTION_PROMPT_MAP[action];
  if (!instruction) {
    console.log(`[BookingV2-LLM] Unknown action "${action}" — skipping LLM generation`);
    return null;
  }

  // Build recent conversation summary
  const conversationSummary = (lastMessages || [])
    .slice(-6)
    .map(m => `${m.sender_type === 'client' ? 'Cliente' : 'Assistente'}: ${m.content}`)
    .join('\n');

  const systemPrompt = `You are a professional virtual assistant representing a real company.

Your role is to communicate naturally with customers and guide them clearly through the booking process.

---

CONTEXT:

Action: ${action}
Booking state: ${JSON.stringify(bookingContext || {})}
Payload: ${JSON.stringify(payload)}

Recent conversation:
${conversationSummary || '(first message)'}

Fallback response (reference only):
${fallbackResponse}

---

OBJECTIVE:

Generate a natural, human response that:
- helps the user move forward in the booking process
- sounds like a real assistant (not a bot)
- adapts tone to the situation

---

BEHAVIOR RULES:

1. Be natural and human
- Write like a real person working at the company
- Avoid robotic or repetitive phrases
- Do NOT sound like a system or template

2. Be helpful and proactive
- Always guide the user to the next step
- Reduce friction in the conversation

3. Adapt tone dynamically:
- Confirmation → confident and clear
- Alternatives → helpful and solution-oriented
- Missing info → polite but direct
- Errors → calm and reassuring

4. Use payload data correctly:
- Include date/time when relevant
- If alternatives exist, present them naturally (not as raw lists)

5. Keep it concise but not robotic
- 1–3 sentences normally
- Can expand slightly if needed for clarity

6. NEVER:
- invent information
- output JSON or labels
- repeat the fallback response literally

---

OUTPUT:

Return ONLY the final message text. Respond in Portuguese (European).`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 300,
        temperature: 0.65,
      }),
    });

    if (!resp.ok) {
      console.warn(`[BookingV2-LLM] Gateway returned ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === 'string' && content.trim().length > 0) {
      return content.trim();
    }
    return null;
  } catch (err) {
    console.warn('[BookingV2-LLM] Error:', err);
    return null;
  }
}


  // State machine prompt injection
  const stateMachinePrompt = generateStateMachinePrompt(currentState, conversationContext);

  // Scheduling decision engine
  const providers: SchedulingProvider[] = [
    getInternalSchedulingProvider(permissions.service_scheduling_enabled)
  ];
  
  const schedulingState: SchedulingState = determineSchedulingState(
    {
      service_scheduling_enabled: permissions.service_scheduling_enabled,
      service_email_enabled: permissions.service_email_enabled,
    },
    providers
  );
  
  const detectedLang = detectLanguageSimple(userMessage);
  const schedulingInstructions = generateSchedulingPromptInstructions(schedulingState, detectedLang);
  
  const contractLang = mapToContractLanguage(userMessage);
  const behavioralContract = generateBehavioralContractPrompt(contractLang);

  const bookingOrchestrationRules = `
=== REGRAS DE ORQUESTRAÇÃO DE AGENDAMENTO (OBRIGATÓRIAS) ===

1. REGRA DE BLOQUEIO DE SERVIÇO:
   - Se "service_id" já existe no conversation_context, NUNCA perguntes novamente por:
     • motivo da consulta / marcação
     • serviço pretendido
     • assunto do agendamento
   - O serviço já é conhecido e deve ser reutilizado automaticamente.
   - Exemplo CORRETO: "Vou verificar a disponibilidade para [nome do serviço]."
   - Exemplo INCORRETO: "Qual o motivo da consulta?"

2. REGRA DE RECOLHA DE DADOS:
   - Pergunta APENAS por campos que estão em falta no contexto.
   - Campos possíveis: name, email, phone, preferred_date, preferred_time
   - Se um campo já existe no conversation_context, NÃO o peças novamente.
   - Exemplo: Se name, email e phone já existem → pergunta apenas pela data preferida.

3. FORMATO DE RESPOSTA DE DISPONIBILIDADE:
   - Ao apresentar horários disponíveis, inclui SEMPRE o dia da semana e a data.
   - Formato CORRETO:
     "Tenho disponibilidade na segunda-feira, 16 de março:
     • 09:00
     • 09:30
     • 10:00
     • 10:30
     • 11:00
     Qual prefere?"
   - Formato INCORRETO: listar horários sem mencionar o dia e data.

4. REGRA DE DISPONIBILIDADE ANTES DE CONFIRMAÇÃO:
   - NUNCA digas "vou agendar", "vou marcar", "já marquei" ANTES de o motor de disponibilidade confirmar um slot válido.
   - Fluxo OBRIGATÓRIO: pedido de disponibilidade → sugestão de slots → utilizador seleciona slot → resumo de confirmação → criação do agendamento.

5. REGRA DE RESUMO PRÉ-CONFIRMAÇÃO:
   - Antes de criar o agendamento, apresenta SEMPRE um resumo com:
     📅 Data
     🕐 Hora
     🧾 Serviço
     👤 Nome
     📧 Email
     📱 Telefone
   - Depois pede confirmação com: "Se estiver tudo correto, escreva apenas 'Sim' ou 'Confirmo'."

6. REGRA ANTI-PERGUNTAS REDUNDANTES:
   - Prefere SEMPRE usar dados existentes no conversation_context em vez de perguntar novamente.
   - Se o utilizador já mencionou o serviço, nome ou data preferida, reutiliza automaticamente.

7. REGRA DE CONSULTA DE DISPONIBILIDADE:
   - Se o utilizador perguntar sobre disponibilidade para um dia ou semana, executa primeiro o motor de disponibilidade e depois apresenta os slots válidos.
   - Exemplo CORRETO:
     "Na segunda-feira, 16 de março, tenho estes horários disponíveis:
     • 09:00
     • 09:30
     • 10:00
     • 10:30
     Qual prefere?"

=== FIM DAS REGRAS DE ORQUESTRAÇÃO ===
`;

  return `${basePrompt}${actionsSection}${productionRules}\n\n${stateMachinePrompt}\n\n${schedulingInstructions}\n\n${behavioralContract}\n\n${bookingOrchestrationRules}`;
}

function detectLanguageSimple(text: string): 'pt' | 'en' | 'es' {
  const lowerText = text.toLowerCase().trim();
  if (/\b(hello|hi|hey|please|thank|schedule|book|appointment)\b/i.test(lowerText)) return 'en';
  if (/\b(hola|buenos|gracias|cita|reservar|agendar)\b/i.test(lowerText) || /[ñ¿¡]/.test(lowerText)) return 'es';
  return 'pt';
}

// =============================================
// Deterministic Price Response Engine
// =============================================

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', BRL: 'R$',
};
const BOOKING_SUGGESTION = '\n\nSe quiser, posso verificar já os próximos horários disponíveis para marcar.';

// deno-lint-ignore no-explicit-any
async function generatePriceResponse(supabase: any, serviceId: string): Promise<string> {
  const { data: service, error } = await supabase
    .from('scheduling_services')
    .select('name, price, currency, promo_price, promo_start, promo_end')
    .eq('id', serviceId)
    .single();

  if (error || !service || service.price === null || service.price === undefined) {
    return 'O valor deste serviço é definido após avaliação inicial.';
  }

  const currency = service.currency || 'EUR';
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const now = new Date();

  // Check active promotion
  if (
    service.promo_price !== null &&
    service.promo_price !== undefined &&
    service.promo_start &&
    service.promo_end
  ) {
    const promoStart = new Date(service.promo_start);
    const promoEnd = new Date(service.promo_end);
    if (now >= promoStart && now <= promoEnd) {
      return `O serviço ${service.name} tem atualmente o preço promocional de ${service.promo_price}${symbol}. O preço normal é ${service.price}${symbol}.${BOOKING_SUGGESTION}`;
    }
  }

  return `O serviço ${service.name} tem o valor de ${service.price}${symbol}.${BOOKING_SUGGESTION}`;
}

/**
 * Detects if the user is asking about available services.
 * Read-only informational interrupt — no state/context mutation.
 */
function detectServiceInquiry(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(que servicos|quais os servicos|servicos disponiveis|lista de servicos|o que fazem|que tipos de servicos)\b/.test(normalized);
}

// =============================================
// Intent Classification — imported from _shared/intent-router.ts
// =============================================
// Intent enum, classifyIntent, classifyIntentDeterministic, BOOKING_INTENT_FAMILY
// are all imported from the shared module above.

/**
 * Conversation Stability Layer — handles intent transitions safely.
 * Clears transient scheduling fields on intent change (unless booking finalized).
 * Preserves identity fields (name, email, phone).
 */
async function applyConversationStabilityLayer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
  currentIntent: Intent,
  previousIntent: Intent | undefined,
  currentState: ConversationState,
  context: Record<string, unknown>,
): Promise<{ updatedContext: Record<string, unknown>; updatedState: ConversationState; skipScheduling: boolean }> {
  const isBookingIntentCurrent = isBookingIntent(currentIntent);
  const wasBookingIntentPrev = previousIntent ? isBookingIntent(previousIntent) : false;
  const bookingFinalized = context.booking_finalized === true;

  // Always store current_intent
  await mergeConversationContext(supabase, conversationId, { current_intent: currentIntent });
  const updatedContext = { ...context, current_intent: currentIntent };

  // If intent hasn't changed, no stability action needed
  if (previousIntent === currentIntent) {
    return { updatedContext, updatedState: currentState, skipScheduling: !isBookingIntentCurrent };
  }

  console.log(`[StabilityLayer] Intent transition: ${previousIntent || 'none'} → ${currentIntent}`);

  // Preserve COMMERCIAL intent on ambiguous follow-ups (emails, "ok", "??", etc.)
  if (previousIntent === Intent.COMMERCIAL_INFO && currentIntent === Intent.OTHER) {
    console.log('[StabilityLayer] Preserving COMMERCIAL intent — follow-up message detected');
    updatedContext.current_intent = Intent.COMMERCIAL_INFO;
    await mergeConversationContext(supabase, conversationId, { current_intent: Intent.COMMERCIAL_INFO });
    return { updatedContext, updatedState: currentState, skipScheduling: true };
  }

  // Case C: Booking already finalized — don't reset anything
  if (bookingFinalized) {
    console.log('[StabilityLayer] Booking finalized — preserving state');
    return { updatedContext, updatedState: currentState, skipScheduling: !isBookingIntentCurrent };
  }

  // Case A: Only exit booking flow on explicit cancellation
  if (wasBookingIntentPrev && currentIntent === Intent.BOOKING_CANCEL) {
    console.log('[StabilityLayer] Explicit cancellation detected — clearing booking flow');
    const SCHEDULING_TRANSIENT = [
      'service_id', 'preferred_date', 'booking_in_progress',
      'selected_datetime', 'reason_normalized', 'conflict_suggestions', 'conflict_origin',
    ];
    for (const field of SCHEDULING_TRANSIENT) {
      delete updatedContext[field];
    }
    const cleanCtx = { ...updatedContext };
    await supabase
      .from('conversations')
      .update({ conversation_context: cleanCtx, conversation_state: 'idle' })
      .eq('id', conversationId);

    return { updatedContext: cleanCtx, updatedState: 'idle' as ConversationState, skipScheduling: true };
  }

  // Case B: Coming from COMMERCIAL to BOOKING_NEW — state-based only, no flags
  if (previousIntent === Intent.COMMERCIAL_INFO && currentIntent === Intent.BOOKING_NEW) {
    console.log('[StabilityLayer] COMMERCIAL → BOOKING_NEW — flow continues via state machine');
  }

  return { updatedContext, updatedState: currentState, skipScheduling: !isBookingIntentCurrent };
}

// =============================================
// Deterministic Required Fields Validation
// =============================================

interface FieldValidationResult {
  valid: boolean;
  missingFields: string[];
}

// deno-lint-ignore no-explicit-any
async function validateRequiredFields(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  empresaId: string,
  context: Record<string, unknown>,
): Promise<FieldValidationResult> {
  // Fetch booking_configuration for this empresa
  const { data: bookingConfig } = await supabase
    .from('booking_configuration')
    .select('require_name, require_email, require_phone, require_reason')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  const requireName = bookingConfig?.require_name ?? true;
  const requireEmail = bookingConfig?.require_email ?? true;
  const requirePhone = bookingConfig?.require_phone ?? false;
  const requireReason = bookingConfig?.require_reason ?? true;

  // Build required fields dynamically from company configuration
  const requiredFields: Array<{ key: string; label: string }> = [];

  if (requireName) requiredFields.push({ key: 'customer_name', label: 'name' });
  if (requireEmail) requiredFields.push({ key: 'customer_email', label: 'email' });
  if (requirePhone) requiredFields.push({ key: 'customer_phone', label: 'phone' });
  if (requireReason) requiredFields.push({ key: 'reason', label: 'reason' });
  // Date is always required
  requiredFields.push({ key: '_date', label: 'date' });

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (field.key === '_date') {
      const hasPreferredDate = !!context.preferred_date;
      const hasSelectedDatetime = !!context.selected_datetime;
      const preferredDateHasTime = hasPreferredDate && String(context.preferred_date).includes('T');
      console.log(`[FieldValidation] _date check: preferred_date=${hasPreferredDate} (hasTime=${preferredDateHasTime}), selected_datetime=${hasSelectedDatetime}`);
      if (!hasPreferredDate && !hasSelectedDatetime) {
        missingFields.push(field.label);
      }
    } else if (field.key === 'reason') {
      const reasonValue = (context.reason as string) || (context.reason_normalized as string) || '';
      console.log(`[FieldValidation] reason check: reason="${context.reason || ''}", reason_normalized="${context.reason_normalized || ''}", valid=${!!reasonValue.trim()}`);
      if (!reasonValue.trim()) {
        missingFields.push(field.label);
      }
    } else if (!context[field.key]) {
      console.log(`[FieldValidation] ${field.key} check: value="${context[field.key] || ''}", valid=false`);
      missingFields.push(field.label);
    } else {
      console.log(`[FieldValidation] ${field.key} check: present=true`);
    }
  }

  if (missingFields.length > 0) {
    console.log(`[StateMachine] Missing required fields: [${missingFields.join(', ')}]`);
  } else {
    console.log('[DeterministicGuard] All required fields present');
  }

  return { valid: missingFields.length === 0, missingFields };
}

// =============================================
// Unified Booking Summary Generator
// =============================================

/**
 * Single source of truth for confirmation summaries.
 * Both initial bookings and reschedules use this function.
 * During reschedule, reads from confirmed_snapshot for immutable fields.
 */
function generateBookingSummary(
  context: Record<string, unknown>,
  options: { mode: 'initial' | 'reschedule' },
): string | null {
  const isReschedule = options.mode === 'reschedule';

  // === V2 ISOLATION GUARD ===
  if (context._bv2_step || context._bv2_booking_datetime) {
    console.log('[BookingIsolation] Skipping legacy summary — V2 active');
    return null;
  }

  const snapshot = (context.confirmed_snapshot || {}) as Record<string, unknown>;

  // Date/time: Build canonical datetime from all possible sources
  // Priority: preferred_date > selected_datetime (preferred_date is the user's explicit input)
  const isValidSelected = context.selected_datetime && String(context.selected_datetime).includes('T');
  const canonicalDatetime = isReschedule
    ? ((context.reschedule_new_date || context.reschedule_pending_datetime || context.preferred_date || (isValidSelected ? context.selected_datetime : '') || '') as string)
    : ((context.preferred_date || (isValidSelected ? context.selected_datetime : '') || '') as string);

  const canonicalHasTime = canonicalDatetime.includes('T');
  console.log(`[BookingSummary] mode=${options.mode}, canonicalDatetime="${canonicalDatetime}", hasTime=${canonicalHasTime}, selected_datetime="${context.selected_datetime || 'none'}", preferred_date="${context.preferred_date || 'none'}"`);

  let formattedDate = '—';
  let formattedTime = '—';

  if (canonicalDatetime) {
    try {
      const dateObj = canonicalHasTime ? new Date(canonicalDatetime) : new Date(`${canonicalDatetime}T12:00:00`);
      if (!isNaN(dateObj.getTime())) {
        const lisbonDateStr = dateObj.toLocaleDateString('pt-PT', {
          timeZone: 'Europe/Lisbon',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        formattedDate = lisbonDateStr.charAt(0).toUpperCase() + lisbonDateStr.slice(1);
        if (canonicalHasTime) {
          formattedTime = dateObj.toLocaleTimeString('pt-PT', {
            timeZone: 'Europe/Lisbon',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }
    } catch {}
  }

  // === CONFIRMATION INTEGRITY GUARD ===
  // Only block when time is truly missing from the canonical datetime
  if (formattedTime === '—') {
    console.log(`[ConfirmationGuard] Blocking summary — time truly missing. canonicalDatetime="${canonicalDatetime}", hasTime=${canonicalHasTime}`);
    console.log(`[ConfirmationGuard] Confirmation BLOCKED`);
    return null as unknown as string; // Caller must handle null
  }
  console.log(`[ConfirmationGuard] Confirmation ALLOWED — canonicalDatetime="${canonicalDatetime}", formattedTime="${formattedTime}"`);

  // Immutable fields: read from snapshot during reschedule, from context during initial
  const customerName = (isReschedule && snapshot.customer_name ? snapshot.customer_name : context.customer_name) as string || '—';
  const customerEmail = (isReschedule && snapshot.customer_email ? snapshot.customer_email : context.customer_email) as string || '—';
  const customerPhone = (isReschedule && snapshot.customer_phone ? snapshot.customer_phone : context.customer_phone) as string || '—';
  const reason = (isReschedule && snapshot.reason ? snapshot.reason : (context.reason_normalized || context.reason)) as string || '—';

  const dateLabel = isReschedule ? 'Nova data' : 'Data';
  const timeLabel = isReschedule ? 'Nova hora' : 'Hora';
  const actionText = isReschedule
    ? 'Se estiver tudo correto, escreva apenas "Sim" ou "Confirmo" para confirmar a alteração.'
    : 'Se estiver tudo correto, escreva apenas "Sim" ou "Confirmo" para finalizar o agendamento.';

  return `📅 ${dateLabel}: ${formattedDate}\n🕐 ${timeLabel}: ${formattedTime}\n🧾 Motivo: ${reason}\n👤 Nome: ${customerName}\n📧 Email: ${customerEmail}\n📱 Telefone: ${customerPhone}\n\n${actionText}`;
}

// =============================================
// Deterministic Missing Fields Response Builder
// =============================================

const FIELD_LABELS: Record<string, string> = {
  name: 'nome completo',
  email: 'email',
  phone: 'numero de telefone',
  reason: 'assunto do agendamento',
  date: 'data pretendida',
};

/**
 * Build a deterministic, structured response for missing fields.
 * Uses emoji-prefixed prompts for better UX.
 */
function buildMissingFieldsResponse(missingFields: string[]): string {
  const FIELD_QUESTIONS: Record<string, string> = {
    name: 'Qual o seu nome?',
    email: 'E o seu email?',
    phone: 'Pode indicar o seu número de telefone?',
    reason: 'Qual o motivo da consulta?',
    date: 'Para que dia prefere marcar?',
  };

  if (missingFields.length === 1) {
    return FIELD_QUESTIONS[missingFields[0]] || `Preciso do seu ${FIELD_LABELS[missingFields[0]] || missingFields[0]}.`;
  }

  if (missingFields.length === 2) {
    const q1 = FIELD_LABELS[missingFields[0]] || missingFields[0];
    const q2 = FIELD_LABELS[missingFields[1]] || missingFields[1];
    return `Preciso do seu ${q1} e ${q2}.`;
  }

  // 3+ fields — still keep it conversational
  const labels = missingFields.map(f => FIELD_LABELS[f] || f);
  const last = labels.pop()!;
  return `Preciso do seu ${labels.join(', ')} e ${last}. Pode enviar tudo junto!`;
}

// =============================================
// Deterministic Confirmation Detection
// =============================================

/**
 * Confirmation Guard v1.1 — Strict deterministic confirmation detection.
 * 
 * HARD BLOCKS: If ANY is true, message CANNOT be confirmation.
 * WHITELIST: Exact match only, trimmed, lowercased, ≤20 chars.
 * 
 * No LLM. No semantic interpretation. No softening.
 */
function isUserConfirmation(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // === HARD BLOCKS (ABSOLUTE BLOCK) ===

  // 1) Contains any digit
  if (/\d/.test(normalized)) {
    console.log(`[ConfirmationGuard] BLOCKED (contains digit): "${normalized}"`);
    return false;
  }

  // 2) Contains question mark
  if (normalized.includes('?')) {
    console.log(`[ConfirmationGuard] BLOCKED (contains question mark): "${normalized}"`);
    return false;
  }

  // 3) Contains time pattern (11h, 11:00, 14h30, 9:15)
  if (/\d{1,2}\s*[h:]\s*\d{0,2}/.test(message.toLowerCase())) {
    console.log(`[ConfirmationGuard] BLOCKED (contains time pattern): "${normalized}"`);
    return false;
  }

  // 4) Contains ANY temporal/change words
  const temporalBlockWords = /\b(as|as|amanha|amanha|hoje|dia|data|hora|horas|mudar|alterar|trocar|em vez|antes|depois)\b/;
  if (temporalBlockWords.test(normalized)) {
    console.log(`[ConfirmationGuard] BLOCKED (contains temporal/change word): "${normalized}"`);
    return false;
  }

  // === WHITELIST (EXACT MATCH ONLY) ===

  // Must be ≤20 characters
  if (normalized.length > 20) {
    console.log(`[ConfirmationGuard] BLOCKED (too long: ${normalized.length} chars): "${normalized}"`);
    return false;
  }

  const WHITELIST = new Set([
    'sim',
    'confirmo',
    'confirmar',
    'esta confirmado',
    'pode avancar',
    'pode avançar',
    'ok confirmar',
    'sim confirmo',
    'sim confirmar',
    'ok',
    'tudo bem',
    'pode ser',
    'esta bem',
    'avanca',
    'avancar',
    'exato',
    'certo',
    'ok sim',
    'sim ok',
    'perfeito',
    'vamos la',
    'bora',
    'isso',
    'isso mesmo',
    'correto',
    'tudo certo',
    'sim pode ser',
    'ok pode ser',
  ]);

  if (WHITELIST.has(normalized)) {
    console.log(`[ConfirmationGuard] CONFIRMED (whitelist match): "${normalized}"`);
    return true;
  }

  console.log(`[ConfirmationGuard] NOT confirmed (no whitelist match): "${normalized}"`);
  return false;
}

// =============================================
// State Transition Logic
// =============================================

/**
 * Determine if we should transition state based on the user message and current context.
 * This runs BEFORE the AI generates a response, so the AI sees the correct state.
 */
// deno-lint-ignore no-explicit-any
async function handlePreResponseStateTransition(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
  empresaId: string,
  currentState: ConversationState,
  context: Record<string, unknown>,
  userMessage: string,
): Promise<{ newState: ConversationState; newContext: Record<string, unknown>; missingFields?: string[]; justTransitioned?: boolean; preValidationMessage?: string }> {
  const lowerMessage = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // === BOOKING FLOW PROTECTION (state-based only) ===
  // If we're in an active booking state, don't allow reset to idle
  const ACTIVE_BOOKING_STATES: ConversationState[] = ['collecting_data', 'awaiting_confirmation', 'booking_processing', 'awaiting_slot_selection'];
  if (ACTIVE_BOOKING_STATES.includes(currentState)) {
    console.log(`[BookingFlowGuard] state=${currentState} — protected from reset (state-based)`);
  }

  // === idle → collecting_data ===
  if (currentState === 'idle') {
    // Rule 1: Explicit booking intent keywords
    const intentPatterns = /\b(dor|doi|doer|consulta|marcacao|marcar|agendar|agendamento|appointment|schedule|book|tratamento|dente|carie|limpeza|check.?up|exame|urgencia|urgente)\b/i;
    let shouldActivate = intentPatterns.test(lowerMessage);

    // Rule 2: Universal fallback — auto-activate if sufficient structured data exists
    if (!shouldActivate && context.customer_name && context.customer_email && context.preferred_date) {
      // Verify company has at least one active bookable service before activating
      const { data: activeServices } = await supabase
        .from('scheduling_services')
        .select('id, scheduling_service_resources!inner(resource_id)')
        .eq('empresa_id', empresaId)
        .eq('status', 'active')
        .eq('bookable', true)
        .limit(1);
      if (activeServices && activeServices.length > 0) {
        console.log('[StateMachine] idle → collecting_data (universal fallback: name+email+date present, active services exist)');
        shouldActivate = true;
      }
    }

    if (shouldActivate) {
      const mergeData: Record<string, unknown> = { booking_intent: (context.booking_intent as string) || 'schedule' };
      if (context.reason) mergeData.reason = context.reason;

      // === BOOKING GUARD — SERVICE REQUIRED ===
      // If booking intent exists but no service_id AND no reason_normalized, route to collecting_service first
      // SERVICE LOCK GUARD: If service_id or reason_normalized exist, skip service re-selection
      if (!context.service_id) {
        // === SERVICE FALLBACK: If reason_normalized exists, resolve service_id automatically ===
        if (context.reason_normalized) {
          console.log(`[BookingGuard] service_id missing but reason_normalized exists ("${context.reason_normalized}") — attempting auto-resolve`);
          const fallbackResolved = await runServiceResolutionPipeline(supabase, empresaId, context.reason_normalized as string);
          if (fallbackResolved) {
            mergeData.service_id = fallbackResolved.service_id;
            mergeData.reason_normalized = fallbackResolved.reason_normalized;
            console.log(`[BookingGuard] Service fallback resolved: ${fallbackResolved.reason_normalized} (${fallbackResolved.service_id})`);
            await updateConversationState(supabase, conversationId, 'collecting_data');
            await mergeConversationContext(supabase, conversationId, mergeData);
            return { newState: 'collecting_data', newContext: { ...context, ...mergeData } };
          }
          console.log('[BookingGuard] Service fallback failed — will try combined input');
        }

        // Try to resolve from reason + message before asking
        const combinedInput = [(context.reason_original as string) || (context.reason as string) || '', userMessage].filter(Boolean).join(' ').trim();
        const resolved = combinedInput ? await runServiceResolutionPipeline(supabase, empresaId, combinedInput) : null;

        if (resolved) {
          mergeData.service_id = resolved.service_id;
          mergeData.reason_normalized = resolved.reason_normalized;
          console.log(`[BookingGuard] Service auto-resolved: ${resolved.reason_normalized}`);
          await updateConversationState(supabase, conversationId, 'collecting_data');
          await mergeConversationContext(supabase, conversationId, mergeData);
          return { newState: 'collecting_data', newContext: { ...context, ...mergeData } };
        }

        // No resolution — go to collecting_service
        console.log('[BookingGuard] Missing service_id — routing to collecting_service');
        const { data: activeServices } = await supabase
          .from('scheduling_services')
          .select('name, scheduling_service_resources!inner(resource_id)')
          .eq('empresa_id', empresaId)
          .eq('status', 'active')
          .eq('bookable', true)
          .order('priority', { ascending: true });

        const serviceList = activeServices?.map((s: { name: string }) => `• ${s.name}`).join('\n') || '';
        const svcMessage = serviceList
          ? `Para prosseguir, preciso saber qual serviço pretende.\n\nServiços disponíveis:\n${serviceList}\n\nQual pretende marcar?`
          : 'De momento não existem serviços disponíveis para agendamento.';

        await updateConversationState(supabase, conversationId, 'collecting_service');
        await mergeConversationContext(supabase, conversationId, mergeData);
        return {
          newState: 'collecting_service' as ConversationState,
          newContext: { ...context, ...mergeData },
          preValidationMessage: svcMessage,
        };
      }

      console.log('[StateMachine] idle → collecting_data (booking intent detected, service present)');
      await updateConversationState(supabase, conversationId, 'collecting_data');
      await mergeConversationContext(supabase, conversationId, mergeData);
      return { newState: 'collecting_data', newContext: { ...context, ...mergeData } };
    }
  }

  // === collecting_service — Service Selection Handler ===
  if (currentState === 'collecting_service') {
    // === SKIP GUARD: If service_id already resolved, transition directly to collecting_data ===
    if (context.service_id) {
      console.log(`[ServiceSelection] service_id already in context (${context.service_id}) — skipping to collecting_data`);
      await updateConversationState(supabase, conversationId, 'collecting_data');
      return {
        newState: 'collecting_data' as ConversationState,
        newContext: context,
      };
    }

    // Attempt to resolve from the user's latest message + any existing reason
    const combinedInput = [(context.reason_original as string) || (context.reason as string) || '', userMessage].filter(Boolean).join(' ').trim();
    const resolved = await runServiceResolutionPipeline(supabase, empresaId, combinedInput);

    if (resolved) {
      console.log(`[ServiceSelection] Service resolved: ${resolved.reason_normalized} (${resolved.service_id})`);
      await mergeConversationContext(supabase, conversationId, {
        service_id: resolved.service_id,
        reason_normalized: resolved.reason_normalized,
        reason: userMessage.trim(),
        reason_original: context.reason_original || userMessage.trim(),
      });
      await updateConversationState(supabase, conversationId, 'collecting_data');
      return {
        newState: 'collecting_data' as ConversationState,
        newContext: {
          ...context,
          service_id: resolved.service_id,
          reason_normalized: resolved.reason_normalized,
          reason: userMessage.trim(),
        },
      };
    }

    // Not resolved — check if only one service exists (auto-select)
    console.log('[ServiceSelection] Could not resolve service — checking for single-service fallback');
    const { data: activeServices } = await supabase
      .from('scheduling_services')
      .select('id, name, scheduling_service_resources!inner(resource_id)')
      .eq('empresa_id', empresaId)
      .eq('status', 'active')
      .eq('bookable', true)
      .order('priority', { ascending: true });

    // Single service fallback: auto-select if only one bookable service exists
    if (activeServices && activeServices.length === 1) {
      const singleService = activeServices[0];
      console.log(`[ServiceSelection] Single service fallback — auto-selecting: ${singleService.name}`);
      await mergeConversationContext(supabase, conversationId, {
        service_id: singleService.id,
        reason_normalized: singleService.name,
        reason: userMessage.trim(),
        reason_original: context.reason_original || userMessage.trim(),
      });
      await updateConversationState(supabase, conversationId, 'collecting_data');
      return {
        newState: 'collecting_data' as ConversationState,
        newContext: {
          ...context,
          service_id: singleService.id,
          reason_normalized: singleService.name,
          reason: userMessage.trim(),
        },
      };
    }

    const serviceList = activeServices?.map((s: { name: string }) => `• ${s.name}`).join('\n') || '';
    const svcMessage = serviceList
      ? `Posso ajudá-lo com isso! Para marcar, preciso saber qual serviço pretende.\n\nServiços disponíveis:\n${serviceList}\n\nQual pretende?`
      : 'De momento não existem serviços disponíveis para agendamento.';

    return {
      newState: 'collecting_service' as ConversationState,
      newContext: context,
      preValidationMessage: svcMessage,
    };
  }

  // === AVAILABILITY ENGINE v2.0 — AUTHORITATIVE DETERMINISTIC LAYER ===
  // When availability is detected, this engine CONTROLS the response. LLM is NEVER called.
  if (currentState === 'collecting_data' || currentState === 'idle') {
    const availabilityPatterns = /\b(disponibilidade|disponivel|quando posso|quando podem|horarios disponiveis|vagas|proxima vaga|proximo horario|quando tem|quando ha|que horas|horas existem|horas disponiveis|dia \d+|de manha|da manha|a manha|de tarde|a tarde|da tarde|pela manha|pela tarde|manha|tarde)\b/i;
    const normalizedForAvail = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Trigger: pattern match OR intent-based with context
    const intentBasedAvailability = (context.current_intent === Intent.AVAILABILITY_REQUEST || context.current_intent === 'AVAILABILITY_REQUEST')
      && context.preferred_date && context.service_id;
    
    // Also trigger if we have service_id + preferred_date and booking_in_progress
    const contextBasedAvailability = context.service_id && context.preferred_date
      && !context.selected_datetime;

    // === CONVERSATION PHASE GUARD (simplified) ===
    // Availability runs when booking context signals exist or scheduling keywords detected
    const normalizedUserMessage = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Always allow availability when service + date exist (orchestrator should handle, this is safety net)
    const schedulingIntentDetected =
      context.preferred_date ||
      (context.service_id && context.preferred_date) ||
      /\b(agendar|marcar|disponibilidade|disponivel|horario|horarios|hora|horas|amanha|amanha|hoje|segunda|terca|terca|quarta|quinta|sexta|sabado|sabado|domingo|quando|proxima|proximo)\b/.test(normalizedUserMessage);

    if (!schedulingIntentDetected) {
      console.log('[ConversationPhaseGuard] No scheduling signals — availability engine skipped');
    }
    
    if (schedulingIntentDetected && (availabilityPatterns.test(normalizedForAvail) || intentBasedAvailability || contextBasedAvailability)) {
      console.log(`[AvailabilityEngine] Availability request detected (pattern=${availabilityPatterns.test(normalizedForAvail)}, intentBased=${!!intentBasedAvailability}, contextBased=${!!contextBasedAvailability})`);

      // === SERVICE LOCK GUARD: If service already resolved, NEVER re-ask ===
      if (!context.service_id && !context.reason_normalized) {
        console.log('[AvailabilityEngine] No service resolved yet — routing to collecting_service');
        const { data: activeServices } = await supabase
          .from('scheduling_services')
          .select('name, scheduling_service_resources!inner(resource_id)')
          .eq('empresa_id', empresaId)
          .eq('status', 'active')
          .eq('bookable', true)
          .order('priority', { ascending: true });

        const serviceList = activeServices?.map((s: { name: string }) => `• ${s.name}`).join('\n') || '';
        const availMessage = serviceList
          ? `Para verificar disponibilidade, primeiro preciso saber qual serviço pretende.\n\nServiços disponíveis:\n${serviceList}\n\nQual pretende marcar?`
          : 'De momento não existem serviços disponíveis para agendamento.';

        await updateConversationState(supabase, conversationId, 'collecting_service');
        return {
          newState: 'collecting_service' as ConversationState,
          newContext: context,
          preValidationMessage: availMessage,
        };
      } else if (context.reason_normalized && !context.service_id) {
        const autoResolved = await runServiceResolutionPipeline(supabase, empresaId, context.reason_normalized as string);
        if (autoResolved) {
          console.log(`[ServiceLockGuard] Auto-resolved service from reason_normalized: ${autoResolved.reason_normalized}`);
          await mergeConversationContext(supabase, conversationId, { service_id: autoResolved.service_id, reason_normalized: autoResolved.reason_normalized });
          context.service_id = autoResolved.service_id;
          context.reason_normalized = autoResolved.reason_normalized;
        }
      }

      // Service exists — fetch slots deterministically
      if (context.service_id) {
        console.log('[AvailabilityEngine] Service resolved — fetching available slots (authoritative mode)');
        // === RUNTIME LOG: Availability request ===
        runtimeLog(supabase, empresaId, conversationId, 'availability_request', 'Availability engine triggered', { preferred_date: context.preferred_date, service_id: context.service_id });
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
          const requestedStart = (context.preferred_date as string) || undefined;
          const slotsResp = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
            body: JSON.stringify({
              company_id: empresaId,
              service_id: context.service_id,
              requested_start: requestedStart,
              max_suggestions: 5,
              search_days: 7,
            }),
          });

          if (slotsResp.ok) {
            const slotsData = await slotsResp.json();
            console.log(`[AvailabilityDebug] check-availability response: requested_available=${slotsData.requested_available}, suggestions=${(slotsData.suggestions || []).length}, requestedStart=${requestedStart}`);
            runtimeLog(supabase, empresaId, conversationId, 'availability_response', 'check-availability result', { requested_available: slotsData.requested_available, suggestions_count: (slotsData.suggestions || []).length, requestedStart });

            // === CASE A: Requested slot IS available — auto-select it ===
            if (slotsData.requested_available === true && requestedStart) {
              console.log(`[AvailabilityEngine] ✓ CASE A — Requested slot available: ${requestedStart}`);
              // Compute end_datetime from service duration
              const startDt = new Date(requestedStart);
              const { data: svcDuration } = await supabase
                .from('scheduling_services')
                .select('duration_minutes')
                .eq('id', context.service_id)
                .single();
              const dur = svcDuration?.duration_minutes || 60;
              const endDt = new Date(startDt.getTime() + dur * 60000);

              await mergeConversationContext(supabase, conversationId, {
                selected_datetime: requestedStart,
                selected_end_datetime: endDt.toISOString(),
              });

              // Check if customer data is missing → collect it
              const hasName = !!context.customer_name;
              const hasEmail = !!context.customer_email;
              const hasPhone = !!context.customer_phone;

              if (!hasName || !hasEmail) {
                console.log('[AvailabilityEngine] CASE A — slot selected, collecting customer data');
                await updateConversationState(supabase, conversationId, 'collecting_data');
                const timeFmt = startDt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                const missingFields: string[] = [];
                if (!hasName) missingFields.push('nome completo');
                if (!hasEmail) missingFields.push('email');
                if (!hasPhone) missingFields.push('telefone');
                return {
                  newState: 'collecting_data' as ConversationState,
                  newContext: { ...context, selected_datetime: requestedStart, selected_end_datetime: endDt.toISOString() },
                  preValidationMessage: `Perfeito, tenho disponibilidade às ${timeFmt}! 🎉\n\nPara confirmar o agendamento, preciso do seu ${missingFields.join(', ')}.`,
                };
              }

              // All data present → go to confirmation
              console.log('[AvailabilityEngine] CASE A — all data present, proceeding to confirmation');
              await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
              const timeFmt = startDt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
              const dateFmt = `${String(startDt.getDate()).padStart(2, '0')}/${String(startDt.getMonth() + 1).padStart(2, '0')}`;
              return {
                newState: 'awaiting_confirmation' as ConversationState,
                newContext: { ...context, selected_datetime: requestedStart, selected_end_datetime: endDt.toISOString() },
                preValidationMessage: `Perfeito! Encontrei disponibilidade.\n\n📋 **Resumo do agendamento:**\n• Serviço: ${context.reason_normalized || 'Consulta'}\n• Data: ${dateFmt}\n• Hora: ${timeFmt}\n• Nome: ${context.customer_name}\n• Email: ${context.customer_email}\n\nDeseja confirmar?`,
              };
            }

            // === CASE B: Requested slot NOT available — show suggestions ===
            let slots = (slotsData.suggestions || []) as ConflictSuggestion[];

            // === TIME-OF-DAY FILTER ===
            const normalizedMsg = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const isMorning = /\b(manha|de manha|da manha|pela manha|a manha)\b/.test(normalizedMsg);
            const isAfternoon = /\b(tarde|de tarde|da tarde|pela tarde|a tarde)\b/.test(normalizedMsg);

            if (isMorning || isAfternoon) {
              const minHour = isMorning ? 8 : 13;
              const maxHour = isMorning ? 12 : 18;
              console.log(`[AvailabilityEngine] Time-of-day filter: ${isMorning ? 'morning' : 'afternoon'} (${minHour}:00-${maxHour}:00)`);
              slots = slots.filter((s: ConflictSuggestion) => {
                const dt = new Date(s.start_datetime);
                const hour = dt.getHours();
                return hour >= minHour && hour < maxHour;
              });
            }

            if (slots.length > 0) {
              // Take first 5 for display, store all for pagination
              const displaySlots = slots.slice(0, 5);
              const allSlots = slots;
              
              console.log(`[AvailabilityEngine] Deterministic slot suggestions returned (${displaySlots.length} of ${allSlots.length})`);
              await mergeConversationContext(supabase, conversationId, {
                conflict_suggestions: displaySlots,
                _all_available_slots: allSlots,
                _slot_page: 0,
                conflict_origin: 'availability_request',
              });
              await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');

              // Format as time-only bullets
              const formatted = displaySlots.map((s: ConflictSuggestion, i: number) => {
                const dt = new Date(s.start_datetime);
                const lisbonStr = dt.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
                const [datePart, timePart] = lisbonStr.split(', ');
                const [day, month] = datePart.split('/');
                const time = timePart ? timePart.slice(0, 5) : '00:00';
                const lisbonDate = new Date(`${datePart.split('/').reverse().join('-')}T12:00:00`);
                const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                return `${i + 1}. ${dayNames[lisbonDate.getDay()]} ${day}/${month} às ${time}`;
              }).join('\n');

              return {
                newState: 'awaiting_slot_selection' as ConversationState,
                newContext: { ...context, conflict_suggestions: displaySlots, _all_available_slots: allSlots, _slot_page: 0 },
                preValidationMessage: `Esse horário não está disponível, mas tenho estas opções:\n\n${formatted}\n\nQual prefere? Pode responder com o número ou a hora.`,
              };
            }
          }
        } catch (availErr) {
          console.error('[AvailabilityEngine] Failed to fetch slots:', availErr);
        }

        // === AVAILABILITY FALLBACK (v2.0) ===
        // When no slots exist for the requested day, auto-search next 30 days
        // to suggest alternatives instead of ending the flow.
        console.log('[AvailabilityEngine] No slots for requested day — triggering fallback search across next 30 days');
        
        let fallbackSlots: ConflictSuggestion[] = [];
        try {
          const fallbackSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const fallbackAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
          const fallbackResp = await fetch(`${fallbackSupabaseUrl}/functions/v1/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fallbackAnonKey}` },
            body: JSON.stringify({
              company_id: empresaId,
              service_id: context.service_id as string,
              max_suggestions: 5,
              search_days: 7,
            }),
          });
          if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            fallbackSlots = (fallbackData.suggestions || []) as ConflictSuggestion[];
          }
        } catch (fallbackErr) {
          console.error('[AvailabilityEngine] Fallback search failed:', fallbackErr);
        }

        if (fallbackSlots.length > 0) {
          console.log(`[AvailabilityEngine] Fallback found ${fallbackSlots.length} slots across next 30 days`);
          await mergeConversationContext(supabase, conversationId, {
            conflict_suggestions: fallbackSlots.slice(0, 5),
            _all_available_slots: fallbackSlots,
            _slot_page: 0,
            conflict_origin: 'availability_fallback',
          });
          await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');

          const formatted = fallbackSlots.slice(0, 5).map((s: ConflictSuggestion) => {
            const dt = new Date(s.start_datetime);
            const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            const dayNum = String(dt.getDate()).padStart(2, '0');
            const monthNum = String(dt.getMonth() + 1).padStart(2, '0');
            const time = dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
            return `• ${dayNames[dt.getDay()]} ${dayNum}/${monthNum} às ${time}`;
          }).join('\n');

          return {
            newState: 'awaiting_slot_selection' as ConversationState,
            newContext: { ...context, conflict_suggestions: fallbackSlots.slice(0, 5), _all_available_slots: fallbackSlots, _slot_page: 0 },
            preValidationMessage: `Para esse dia não tenho horários disponíveis.\n\nMas tenho estes horários disponíveis:\n\n${formatted}\n\nAlgum destes funciona?`,
          };
        }

        // No slots anywhere in next 30 days
        console.log('[AvailabilityEngine] No slots available in next 30 days');
        return {
          newState: 'collecting_data' as ConversationState,
          newContext: context,
          preValidationMessage: 'De momento não tenho horários disponíveis nos próximos dias.\n\nSe quiser, posso verificar noutra altura para si.',
        };
      }
    }
  }

  // === collecting_data → awaiting_confirmation (deterministic validation) ===
  if (currentState === 'collecting_data') {
    // =============================================
    // Controlled Reason Overwrite (Collecting Data Only)
    // =============================================
    const bookingKeywords = /\b(marcar|agendar|reuniao|consulta|casamento|matrimonio|visita|appointment|schedule|book)\b/i;
    if (
      bookingKeywords.test(lowerMessage) &&
      context.reason_original &&
      lowerMessage.trim().length > 8 &&
      lowerMessage.trim() !== (context.reason_original as string).toLowerCase().trim()
    ) {
      console.log('[ReasonOverwrite] New booking reason detected — overwriting previous reason');
      const updatedReason = userMessage.trim();
      await mergeConversationContext(supabase, conversationId, {
        reason: updatedReason,
        reason_original: updatedReason,
        service_id: null
      });
      context.reason = updatedReason;
      context.reason_original = updatedReason;
      delete context.service_id;
    }

    // === SERVICE RESOLVER SMART MATCH ===
    // If reason_normalized/reason_original exists but service_id is null,
    // attempt automatic resolution before asking the user.
    if (!context.service_id && (context.reason_normalized || context.reason_original || context.reason)) {
      const smartMatchInput = ((context.reason_normalized as string) || (context.reason_original as string) || (context.reason as string) || '').trim();
      if (smartMatchInput) {
        console.log(`[SmartMatch] reason exists but no service_id — attempting auto-resolve: "${smartMatchInput}"`);
        const smartResolved = await runServiceResolutionPipeline(supabase, empresaId, smartMatchInput);
        if (smartResolved) {
          console.log(`[SmartMatch] Auto-resolved service: ${smartResolved.reason_normalized} (${smartResolved.service_id})`);
          await mergeConversationContext(supabase, conversationId, {
            service_id: smartResolved.service_id,
            reason_normalized: smartResolved.reason_normalized,
          });
          context.service_id = smartResolved.service_id;
          context.reason_normalized = smartResolved.reason_normalized;
        } else {
          console.log('[SmartMatch] Auto-resolve failed — will proceed to normal flow');
        }
      }
    }

    const updatedContext = { ...context };

    // === HARD BLOCK: Past date validation ===
    if (context.preferred_date) {
      const selectedDate = new Date(context.preferred_date as string);
      const now = new Date();

      if (selectedDate.getTime() < now.getTime()) {
        console.log('[DateGuard] BLOCKED — Past date detected');

        return {
          newState: 'collecting_data' as ConversationState,
          newContext: context,
          preValidationMessage:
            'A data indicada já passou. Por favor indique uma data futura disponível.',
        };
      }
    }

    const validation = await validateRequiredFields(supabase, empresaId, updatedContext);

    if (validation.valid) {
      // === UNIFIED SERVICE RESOLUTION PIPELINE (before confirmation) ===
      const ailReschedulePending = updatedContext._reschedule_pending as boolean | undefined;

      if (!ailReschedulePending && !updatedContext.service_id) {
        console.log('[ServicePipeline] Running unified resolution before awaiting_confirmation');
        const combinedReasonInput = [(updatedContext.reason_original as string) || (updatedContext.reason as string) || '', userMessage].filter(Boolean).join(' ').trim();
        const resolved = await runServiceResolutionPipeline(
          supabase,
          empresaId,
          combinedReasonInput,
        );

        if (resolved) {
          await mergeConversationContext(supabase, conversationId, {
            service_id: resolved.service_id,
            reason_normalized: resolved.reason_normalized,
          });
          updatedContext.service_id = resolved.service_id;
          updatedContext.reason_normalized = resolved.reason_normalized;
          console.log(`[ServicePipeline] Resolved: ${resolved.reason_normalized} (${resolved.service_id})`);
        } else if (updatedContext.reason) {
          // Invalid service match — reason exists but no service resolved
          console.log('[ServiceResolution] Invalid service requested — showing available services');
          const { data: services } = await supabase
            .from('scheduling_services')
            .select('name')
            .eq('empresa_id', empresaId)
            .eq('status', 'active')
            .order('priority', { ascending: true });

          if (services && services.length > 0) {
            const serviceList = services.map((s: any) => `• ${s.name}`).join('\n');
            const svcMessage =
              `Não reconheço esse serviço.\n\nEstes são os serviços disponíveis:\n${serviceList}\n\nQual pretende marcar?`;

            console.log('[ServiceResolution] Invalid service — returning deterministic message via state machine');

            return {
              newState: 'collecting_data' as ConversationState,
              newContext: updatedContext,
              preValidationMessage: svcMessage,
            };
          }

          // Fallback if no active services found
          console.log('[ServicePipeline] All tiers failed — blocking confirmation');
          return {
            newState: 'collecting_data' as ConversationState,
            newContext: updatedContext,
            missingFields: ['reason'],
          };
        } else {
          console.log('[ServicePipeline] All tiers failed — blocking confirmation');
          return {
            newState: 'collecting_data' as ConversationState,
            newContext: updatedContext,
            missingFields: ['reason'],
          };
        }
      }

      // === SERVICE RESOLVER GUARD: Hard block ===
      if (!updatedContext.service_id && !ailReschedulePending) {
        console.error('[ServiceResolverGuard] Missing service resolution — blocking awaiting_confirmation');
        return {
          newState: 'collecting_data' as ConversationState,
          newContext: updatedContext,
          missingFields: ['reason'],
        };
      }

      // === AVAILABILITY PRE-VALIDATION LAYER (AIL) ===
      const ailPreferredDate = updatedContext.preferred_date as string | undefined;
      const ailServiceId = (updatedContext.service_id as string);

      if (ailPreferredDate && !ailReschedulePending && ailServiceId) {
        console.log('[AIL] Pre-validation triggered');
        try {
          const ailResult: InternalAvailabilityResult = await checkInternalAvailability(
            supabase, empresaId, ailServiceId, ailPreferredDate
          );

          if (ailResult.available) {
            console.log('[AIL] Slot available — proceeding to awaiting_confirmation');
          } else {
            console.log('[AIL] Slot unavailable — redirecting to awaiting_slot_selection');
            // Fetch alternative suggestions
            let ailSuggestions: ConflictSuggestion[] = [];
            try {
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
              const sugResp = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify({
                  company_id: empresaId,
                  service_id: ailServiceId,
                  requested_start: ailPreferredDate,
                  max_suggestions: 3,
                  search_days: 7,
                }),
              });
              if (sugResp.ok) {
                const sugData = await sugResp.json();
                ailSuggestions = (sugData.suggestions || []) as ConflictSuggestion[];
              }
            } catch (sugErr) {
              console.error('[AIL] Failed to fetch suggestions:', sugErr);
            }

            if (ailSuggestions.length > 0) {
              await mergeConversationContext(supabase, conversationId, {
                conflict_suggestions: ailSuggestions,
                conflict_origin: 'pre_validation',
              });
              await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');
              const formatted = formatSuggestionSlots(ailSuggestions);
              return {
                newState: 'awaiting_slot_selection' as ConversationState,
                newContext: { ...updatedContext, conflict_suggestions: ailSuggestions },
                justTransitioned: true,
                preValidationMessage: `O horário selecionado já não está disponível.\nAqui estão as opções mais próximas:\n${formatted}\n\nQual prefere?`,
              };
            } else {
              // No suggestions — stay in collecting_data, ask for new date
              return {
                newState: 'collecting_data' as ConversationState,
                newContext: updatedContext,
                missingFields: ['preferred_date'],
                preValidationMessage: 'O horário selecionado não está disponível e não encontrei alternativas próximas. Pode indicar outra data e hora?',
              };
            }
          }
        } catch (ailErr) {
          console.error('[AIL] Pre-validation error (non-blocking):', ailErr);
          // On error, proceed normally to avoid blocking the flow
        }
      }

      console.log('[StateMachine] collecting_data → awaiting_confirmation (all required fields present)');
      await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
      return { newState: 'awaiting_confirmation', newContext: updatedContext, justTransitioned: true };
    }

    console.log(`[DeterministicGuard] Blocking state transition — missing: [${validation.missingFields.join(', ')}]`);
    return { newState: 'collecting_data', newContext: updatedContext, missingFields: validation.missingFields };
  }

  // === awaiting_confirmation — Confirmation Guard ===
  if (currentState === 'awaiting_confirmation') {
    const isReschedule = !!context.appointment_id;

    // STEP 1: Date-change detection — ONLY for reschedule flows
    // First bookings must NEVER trigger date-change logic (prevents infinite confirmation loop)
    if (isReschedule) {
      const currentPreferredDate = context.preferred_date as string | undefined;
      const previousPendingDate = context.reschedule_pending_datetime as string | undefined;
      const hadDateChangeFromExtractor = currentPreferredDate && currentPreferredDate !== previousPendingDate;

      if (hadDateChangeFromExtractor) {
        console.log(`[ConfirmationGuard] New date during reschedule confirmation: ${currentPreferredDate}`);
        const bookingId = (context.booking_id || context.appointment_id) as string;
        let effectiveServiceId = (context.service_id as string) || '';
        if (!effectiveServiceId && bookingId) {
          const { data: appt } = await supabase.from('agendamentos').select('service_id').eq('id', bookingId).single();
          effectiveServiceId = appt?.service_id || '';
        }
        if (effectiveServiceId) {
          const validation = await validateRescheduleAvailability(
            supabase, empresaId, bookingId, effectiveServiceId, currentPreferredDate,
          );
          if (!validation.available) {
            await mergeConversationContext(supabase, conversationId, {
              preferred_date: currentPreferredDate,
              reschedule_suggestions: validation.suggestions || [],
              _reschedule_conflict: true,
              _reschedule_pending: null,
              reschedule_pending_datetime: null,
            });
            await updateConversationState(supabase, conversationId, 'rescheduling');
            return {
              newState: 'rescheduling' as ConversationState,
              newContext: { ...context, preferred_date: currentPreferredDate, _reschedule_conflict: true },
            };
          }
          // Available — update pending datetime and re-show confirmation
          await mergeConversationContext(supabase, conversationId, {
            preferred_date: currentPreferredDate,
            reschedule_pending_datetime: currentPreferredDate,
            reschedule_new_start: validation.new_start,
            reschedule_new_end: validation.new_end,
            reschedule_new_date: currentPreferredDate,
          });
          return {
            newState: 'awaiting_confirmation' as ConversationState,
            newContext: { ...context, preferred_date: currentPreferredDate, reschedule_pending_datetime: currentPreferredDate, reschedule_new_date: currentPreferredDate },
            justTransitioned: true,
          };
        }
      }
    }

    // STEP 2: Validate required fields (skip for reschedule — data already collected)
    if (!isReschedule) {
      const validation = await validateRequiredFields(supabase, empresaId, context);
      if (!validation.valid) {
        console.log(`[ConfirmationGuard] Blocking — missing: [${validation.missingFields.join(', ')}]`);
        await updateConversationState(supabase, conversationId, 'collecting_data');
        return { newState: 'collecting_data', newContext: context, missingFields: validation.missingFields };
      }
    }

    // STEP 3: Confirmation Guard
    if (isUserConfirmation(userMessage)) {
      // PATCH 2: Structural Guard — block booking_processing without service_id
      if (!isReschedule && !context.service_id) {
        console.error('[StructuralGuard] BLOCKED: Missing service_id before booking_processing');
        await updateConversationState(supabase, conversationId, 'collecting_data');
        return { newState: 'collecting_data', newContext: context, missingFields: ['service_id'] };
      }
      console.log(`[ConfirmationGuard] awaiting_confirmation → booking_processing (confirmed, isReschedule=${isReschedule})`);
      // State transition only — booking_in_progress lock is set by handleToolCall
      await updateConversationState(supabase, conversationId, 'booking_processing');
      return { newState: 'booking_processing', newContext: context, justTransitioned: true };
    }

    // STEP 4: DATE MUTATION GUARD — user wants to change date/time (not a confirmation)
    // CRITICAL: For reschedule flows, pass confirmed date so time-only inputs preserve it.
    // For initial bookings, pass existing preferred_date.
    {
      const baseDate = isReschedule
        ? (context.reschedule_pending_datetime || context.confirmed_start || context.preferred_date) as string | undefined
        : context.preferred_date as string | undefined;
      const dateMutationExtractCtx = baseDate ? { preferred_date: baseDate } : {};
      const dateMutationCheck = extractDeterministicFields(userMessage, dateMutationExtractCtx);
      if (dateMutationCheck.preferred_date) {
        const newDate = String(dateMutationCheck.preferred_date);
        const oldDate = context.preferred_date as string | undefined;
        const oldSelected = context.selected_datetime as string | undefined;
        console.log(`[DateGuard] Date/time change during awaiting_confirmation:`);
        console.log(`[DateGuard]   base date for extraction: ${baseDate || 'none'}`);
        console.log(`[DateGuard]   old preferred_date: ${oldDate || 'none'}`);
        console.log(`[DateGuard]   old selected_datetime: ${oldSelected || 'none'}`);
        console.log(`[DateGuard]   new preferred_date: ${newDate}`);
        console.log(`[DateGuard]   service_id preserved: ${context.service_id || 'none'}`);
        console.log(`[DateGuard]   reason_normalized preserved: ${context.reason_normalized || 'none'}`);

        // For reschedule flows, route back through the reschedule validation pipeline
        if (isReschedule) {
          console.log('[DateGuard] Reschedule date/time change — re-validating via reschedule pipeline');
          await mergeConversationContext(supabase, conversationId, {
            preferred_date: newDate,
            reschedule_pending_datetime: null,
            reschedule_new_start: null,
            reschedule_new_end: null,
            reschedule_new_date: null,
            _reschedule_pending: null,
          });
          // Let the rescheduling state handler validate the new datetime
          await updateConversationState(supabase, conversationId, 'rescheduling');
          return {
            newState: 'rescheduling' as ConversationState,
            newContext: { ...context, preferred_date: newDate, reschedule_pending_datetime: null },
          };
        }

        // For initial bookings: clear stale slot context and re-run availability
        await mergeConversationContext(supabase, conversationId, {
          preferred_date: newDate,
          conflict_suggestions: null,
          _all_available_slots: null,
          _slot_page: null,
          selected_datetime: null,
          slot_confirmed: null,
          slot_changed: true,
        });

        await updateConversationState(supabase, conversationId, 'collecting_data');
        console.log('[DateGuard] Stale slot context cleared — state set to collecting_data for fresh availability check');
        return {
          newState: 'collecting_data' as ConversationState,
          newContext: { ...context, preferred_date: newDate, selected_datetime: null, conflict_suggestions: null },
        };
      }
    }

    // No confirmation and no date change — stay and wait
    return { newState: 'awaiting_confirmation', newContext: context, justTransitioned: false };
  }

  // === booking_active → rescheduling (deterministic date trigger with validation) ===
  if (currentState === 'booking_active') {
    if (context.appointment_id || context.booking_id) {
      // STRUCTURAL HARDENING: Only trigger reschedule if a NEW date is detected
      // in the CURRENT user message — never from persisted context fields.
      // This prevents neutral messages (e.g. "ok obrigado") from triggering reschedule.
      // CRITICAL: Pass confirmed date so time-only inputs preserve it (not fallback to today).
      const confirmedStart = context.confirmed_start as string | undefined;
      const confirmedDateStr = confirmedStart ? confirmedStart.substring(0, 10) : undefined;
      const extractionContext = confirmedDateStr ? { preferred_date: confirmedStart } : {};
      const deterministicDateCheck = extractDeterministicFields(userMessage, extractionContext);
      const explicitDateDetected = !!deterministicDateCheck.preferred_date;
      const contextPreferredDate = explicitDateDetected
        ? deterministicDateCheck.preferred_date as string
        : undefined;
      // Compare DATE portions only — time-only changes keep the same date
      const newDatePortion = contextPreferredDate ? contextPreferredDate.substring(0, 10) : undefined;
      const hasNewDate = contextPreferredDate && newDatePortion !== confirmedDateStr;
      const hasTimeOnlyChange = contextPreferredDate && !hasNewDate && contextPreferredDate !== confirmedStart;

      console.log(`[RescheduleTrigger] confirmed_start: ${confirmedStart || 'none'}`);
      console.log(`[RescheduleTrigger] extracted preferred_date: ${contextPreferredDate || 'none'}`);
      console.log(`[RescheduleTrigger] date portion changed: ${hasNewDate}, time-only change: ${hasTimeOnlyChange}`);

      if (hasTimeOnlyChange || hasNewDate) {
        console.log(`[RescheduleTrigger] Reschedule detected in booking_active: ${contextPreferredDate} (dateChanged=${hasNewDate}, timeOnly=${hasTimeOnlyChange})`);

        const rescheduleAllowed = await checkRescheduleAllowed(supabase, empresaId);
        if (!rescheduleAllowed) {
          console.log('[RescheduleEngine] Reschedule NOT allowed — staying in booking_active');
          return {
            newState: 'booking_active' as ConversationState,
            newContext: { ...context, _reschedule_blocked: true },
          };
        }

        // Resolve service ID for validation
        const bookingId = (context.booking_id || context.appointment_id) as string;
        let effectiveServiceId = (context.service_id as string) || '';
        if (!effectiveServiceId && bookingId) {
          const { data: appt } = await supabase
            .from('agendamentos')
            .select('service_id')
            .eq('id', bookingId)
            .single();
          effectiveServiceId = appt?.service_id || '';
        }

        if (effectiveServiceId) {
          // Validate availability FIRST (no update yet)
          const validation = await validateRescheduleAvailability(
            supabase, empresaId, bookingId, effectiveServiceId, contextPreferredDate,
          );

          if (!validation.available) {
            // Conflict → go to rescheduling with suggestions
            console.log('[RescheduleTrigger] Conflict detected — showing suggestions');
            await mergeConversationContext(supabase, conversationId, {
              preferred_date: contextPreferredDate,
              reschedule_suggestions: validation.suggestions || [],
              _reschedule_conflict: true,
            });
            await updateConversationState(supabase, conversationId, 'rescheduling');
            return {
              newState: 'rescheduling' as ConversationState,
              newContext: {
                ...context,
                preferred_date: contextPreferredDate,
                reschedule_suggestions: validation.suggestions || [],
                _reschedule_conflict: true,
              },
            };
          }

          // Available → store pending datetime and go to awaiting_confirmation
          console.log('[RescheduleTrigger] Slot available → awaiting_confirmation');
          await mergeConversationContext(supabase, conversationId, {
            preferred_date: contextPreferredDate,
            reschedule_pending_datetime: contextPreferredDate,
            reschedule_new_start: validation.new_start,
            reschedule_new_end: validation.new_end,
            reschedule_new_date: contextPreferredDate,
            _reschedule_pending: true,
          });
          await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
          return {
            newState: 'awaiting_confirmation' as ConversationState,
            newContext: {
              ...context,
              preferred_date: contextPreferredDate,
              reschedule_pending_datetime: contextPreferredDate,
              reschedule_new_date: contextPreferredDate,
              _reschedule_pending: true,
              
            },
            justTransitioned: true,
          };
        }
      }
    }

    return { newState: 'booking_active' as ConversationState, newContext: context };
  }

   // === rescheduling — validate new date, route to confirmation or suggest alternatives ===
  if (currentState === 'rescheduling') {
    // Re-extract from user message with confirmed date as base for time-only preservation
    const confirmedStartForResched = (context.confirmed_start || context.reschedule_pending_datetime || context.preferred_date) as string | undefined;
    const reschedulExtractionCtx = confirmedStartForResched ? { preferred_date: confirmedStartForResched } : {};
    const reschedDateCheck = extractDeterministicFields(userMessage, reschedulExtractionCtx);
    // Use freshly extracted date if available, otherwise fall back to context
    const rescheduleDateFromContext = reschedDateCheck.preferred_date
      ? (reschedDateCheck.preferred_date as string)
      : (context.preferred_date as string | undefined);
    // Detect if the extractor found a new date by comparing with previous reschedule_pending_datetime
    const prevReschedulePending = context.reschedule_pending_datetime as string | undefined;
    const hasNewRescheduleDate = rescheduleDateFromContext && rescheduleDateFromContext !== prevReschedulePending;
    console.log(`[RescheduleState] confirmed base: ${confirmedStartForResched || 'none'}, extracted: ${reschedDateCheck.preferred_date || 'none'}, context: ${rescheduleDateFromContext || 'none'}, prev pending: ${prevReschedulePending || 'none'}, hasNew: ${hasNewRescheduleDate}`);
    if (hasNewRescheduleDate) {
      console.log(`[RescheduleEngine] New date provided in rescheduling: ${rescheduleDateFromContext}`);
      
      const bookingId = (context.booking_id || context.appointment_id) as string;
      let effectiveServiceId = (context.service_id as string) || '';
      
      if (!effectiveServiceId && bookingId) {
        const { data: appt } = await supabase
          .from('agendamentos')
          .select('service_id')
          .eq('id', bookingId)
          .single();
        effectiveServiceId = appt?.service_id || '';
      }

      if (effectiveServiceId) {
        // Validate availability FIRST (no update)
        const validation = await validateRescheduleAvailability(
          supabase, empresaId, bookingId, effectiveServiceId, rescheduleDateFromContext,
        );

        if (!validation.available) {
          // Conflict — store suggestions and stay in rescheduling
          await mergeConversationContext(supabase, conversationId, {
            preferred_date: rescheduleDateFromContext,
            reschedule_suggestions: validation.suggestions || [],
            _reschedule_conflict: true,
          });
          return {
            newState: 'rescheduling' as ConversationState,
            newContext: {
              ...context,
              preferred_date: rescheduleDateFromContext,
              reschedule_suggestions: validation.suggestions || [],
              _reschedule_conflict: true,
            },
          };
        }

        // Available → store pending and transition to awaiting_confirmation
        console.log('[RescheduleEngine] Slot available → awaiting_confirmation');
        await mergeConversationContext(supabase, conversationId, {
          preferred_date: rescheduleDateFromContext,
          reschedule_pending_datetime: rescheduleDateFromContext,
          reschedule_new_start: validation.new_start,
          reschedule_new_end: validation.new_end,
          reschedule_new_date: rescheduleDateFromContext,
          _reschedule_pending: true,
        });
        await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
        return {
          newState: 'awaiting_confirmation' as ConversationState,
          newContext: {
            ...context,
            preferred_date: rescheduleDateFromContext,
            reschedule_pending_datetime: rescheduleDateFromContext,
            reschedule_new_date: rescheduleDateFromContext,
            _reschedule_pending: true,
          },
          justTransitioned: true,
        };
      }
    }

    // No date yet — stay in rescheduling
    return { newState: 'rescheduling' as ConversationState, newContext: context };
  }

  // === awaiting_slot_selection — validate slot selection against conflict_suggestions ===
  if (currentState === 'awaiting_slot_selection') {
    const suggestions = (context.conflict_suggestions || []) as Array<{ start_datetime: string; end_datetime: string }>;
    const normalizedMsg = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // --- commitSlotSelection: deterministic slot commit helper ---
    async function commitSlotSelection(slot: { start_datetime: string; end_datetime: string }) {
      const commitData: Record<string, unknown> = {
        preferred_date: slot.start_datetime,
        selected_datetime: slot.start_datetime,
        slot_confirmed: true,
        slot_changed: true,
        conflict_suggestions: null,
        conflict_origin: null,
        _all_available_slots: null,
        _slot_page: null,
      };
      await mergeConversationContext(supabase, conversationId, commitData);

      const hasCustomerData = !!context.customer_name && !!context.customer_email && !!context.customer_phone;
      if (!hasCustomerData) {
        console.log(`[SlotCommit] Committed slot: ${slot.start_datetime} → collecting_data (customer data missing)`);
        await updateConversationState(supabase, conversationId, 'collecting_data');
        runtimeLog(supabase, empresaId, conversationId, 'slot_selected', `Slot selected: ${slot.start_datetime}`, { slot_datetime: slot.start_datetime });
        return {
          newState: 'collecting_data' as ConversationState,
          newContext: { ...context, ...commitData },
          justTransitioned: true,
        };
      }

      await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
      console.log(`[SlotCommit] Committed slot: ${slot.start_datetime} → awaiting_confirmation`);
      runtimeLog(supabase, empresaId, conversationId, 'slot_selected', `Slot selected: ${slot.start_datetime}`, { slot_datetime: slot.start_datetime });
      return {
        newState: 'awaiting_confirmation' as ConversationState,
        newContext: { ...context, ...commitData },
        justTransitioned: true,
      };
    }

    // Helper: format current suggestions for display (Lisbon timezone)
    function formatCurrentSuggestions(slots: Array<{ start_datetime: string }>) {
      return slots.map((s, i) => {
        const dt = new Date(s.start_datetime);
        const lisbonStr = dt.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
        const [datePart, timePart] = lisbonStr.split(', ');
        const [day, month] = datePart.split('/');
        const time = timePart ? timePart.slice(0, 5) : '00:00';
        const lisbonDate = new Date(`${datePart.split('/').reverse().join('-')}T12:00:00`);
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        return `${i + 1}. ${dayNames[lisbonDate.getDay()]} ${day}/${month} às ${time}`;
      }).join('\n');
    }

    // Helper: clear stale slot context and trigger fresh availability
    async function clearStaleAndSearchFresh(newPreferredDate: string | unknown) {
      console.log(`[SlotSelection] Clearing stale slot context for fresh search — new preferred_date: ${newPreferredDate}`);
      console.log(`[SlotSelection] Stale context discarded: conflict_suggestions=${suggestions.length} items, selected_datetime=${context.selected_datetime}`);
      await mergeConversationContext(supabase, conversationId, {
        preferred_date: newPreferredDate,
        conflict_suggestions: null,
        _all_available_slots: null,
        _slot_page: null,
        selected_datetime: null,
        slot_confirmed: null,
        slot_changed: true,
      });
      await updateConversationState(supabase, conversationId, 'collecting_data');
      console.log('[SlotSelection] Stale slot context cleared — state set to collecting_data for fresh availability');
      console.log(`[SlotSelection] Preserved: service_id=${context.service_id}, reason_normalized=${context.reason_normalized}`);
      return {
        newState: 'collecting_data' as ConversationState,
        newContext: { ...context, preferred_date: newPreferredDate, conflict_suggestions: null, selected_datetime: null },
      };
    }

    // Helper: get the date string (YYYY-MM-DD) of current suggestions in Lisbon timezone
    function getSuggestionsDate(): string | null {
      if (suggestions.length === 0) return null;
      try {
        const dt = new Date(suggestions[0].start_datetime);
        // MUST use Lisbon timezone — preferred_date from extractor is Lisbon-local
        const lisbonStr = dt.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
        const [day, month, year] = lisbonStr.split(', ')[0].split('/');
        const result = `${year}-${month}-${day}`;
        console.log(`[getSuggestionsDate] First suggestion ${suggestions[0].start_datetime} → Lisbon date: ${result}`);
        return result;
      } catch { return null; }
    }

    // ──────────────────────────────────────────────
    // STEP 0: QUESTION / CLARIFICATION DETECTION
    // ──────────────────────────────────────────────
    const questionPatterns = /\b(sao datas|sao horarios|essas datas|esses horarios|para que dia|para quando|que disponibilidade|quais os horarios|qual a disponibilidade|ha vaga|tem vaga|existe disponibilidade|quando existe|quando ha|esses sao|esses horarios sao|essas sao|sao para|sao os unicos|que dias|que datas|que opcoes|tem mais opcoes|sao esses|esses horarios|estas datas|estes horarios)\b/;
    const isQuestion = normalizedMsg.includes('?') || questionPatterns.test(normalizedMsg);

    if (isQuestion) {
      console.log(`[SlotSelection] Question detected: "${normalizedMsg}"`);

      // Check if the question mentions a specific day (e.g. "São datas para amanhã?")
      const questionDateCheck = extractDeterministicFields(userMessage, {});
      if (questionDateCheck.preferred_date) {
        const newDateStr = String(questionDateCheck.preferred_date);
        const suggestionsDate = getSuggestionsDate();
        // If the referenced date matches current suggestions, just re-display
        if (suggestionsDate && newDateStr.startsWith(suggestionsDate)) {
          console.log(`[SlotSelection] Question references same date as suggestions (${suggestionsDate}) — re-displaying`);
          if (suggestions.length > 0) {
            const formatted = formatCurrentSuggestions(suggestions);
            return {
              newState: 'awaiting_slot_selection' as ConversationState,
              newContext: context,
              preValidationMessage: `Sim, estes são os horários disponíveis para esse dia:\n\n${formatted}\n\nQual prefere? Pode indicar o número ou a hora.`,
            };
          }
        }
        // Different date — trigger fresh availability
        console.log(`[SlotSelection] Question references new date: ${newDateStr} (suggestions are for ${suggestionsDate}) — fresh availability`);
        return await clearStaleAndSearchFresh(questionDateCheck.preferred_date);
      }

      // Pure question without date reference — re-display current suggestions
      console.log('[SlotSelection] Pure question (no new date) — re-displaying current suggestions');
      if (suggestions.length > 0) {
        const formatted = formatCurrentSuggestions(suggestions);
        return {
          newState: 'awaiting_slot_selection' as ConversationState,
          newContext: context,
          preValidationMessage: `Estes são os horários disponíveis:\n\n${formatted}\n\nQual prefere? Pode indicar o número ou a hora.`,
        };
      }
      console.log('[SlotSelection] State preserved (no suggestions to display)');
      return { newState: 'awaiting_slot_selection' as ConversationState, newContext: context };
    }

    // ──────────────────────────────────────────────
    // STEP 0b: AVAILABILITY REQUEST (no question mark)
    // ──────────────────────────────────────────────
    const availabilityRequestInSlot = /\b(disponibilidade|disponivel|quais os horarios|que horarios|ha vaga|tem vaga|horarios disponiveis|quando posso|quando podem|horas disponiveis|ver horarios|ver disponibilidade)\b/.test(normalizedMsg);
    if (availabilityRequestInSlot) {
      console.log(`[SlotSelection] Availability request detected: "${normalizedMsg}"`);
      const availDateCheck = extractDeterministicFields(userMessage, {});
      if (availDateCheck.preferred_date) {
        const newDateStr = String(availDateCheck.preferred_date);
        const suggestionsDate = getSuggestionsDate();
        if (suggestionsDate && newDateStr.startsWith(suggestionsDate)) {
          console.log(`[SlotSelection] Availability request for same date — re-displaying`);
          if (suggestions.length > 0) {
            const formatted = formatCurrentSuggestions(suggestions);
            return {
              newState: 'awaiting_slot_selection' as ConversationState,
              newContext: context,
              preValidationMessage: `Estes são os horários que tenho disponíveis:\n\n${formatted}\n\nQual prefere?`,
            };
          }
        }
        console.log(`[SlotSelection] Availability request for new date: ${newDateStr} — clearing stale context`);
        return await clearStaleAndSearchFresh(availDateCheck.preferred_date);
      }
      // No new date — re-display current suggestions
      console.log('[SlotSelection] Availability request (no new date) — re-displaying current suggestions');
      if (suggestions.length > 0) {
        const formatted = formatCurrentSuggestions(suggestions);
        return {
          newState: 'awaiting_slot_selection' as ConversationState,
          newContext: context,
          preValidationMessage: `Estes são os horários que tenho disponíveis:\n\n${formatted}\n\nQual prefere?`,
        };
      }
      await updateConversationState(supabase, conversationId, 'collecting_data');
      return {
        newState: 'collecting_data' as ConversationState,
        newContext: context,
        preValidationMessage: 'De momento não tenho horários guardados. Pode indicar outra data para verificar?',
      };
    }

    // ──────────────────────────────────────────────
    // STEP 0c: SLOT PAGINATION ("nenhum desses", "mais horários")
    // ──────────────────────────────────────────────
    const paginationPatterns = /\b(nenhum desses|nenhum destes|nao posso nesses|nao posso nestes|tem mais|mais horarios|outro horario|outros horarios|nao me serve|nenhum serve|nao da|nao posso|proximos|seguintes)\b/i;
    if (paginationPatterns.test(normalizedMsg)) {
      const allSlots = (context._all_available_slots || []) as Array<{ start_datetime: string; end_datetime: string }>;
      const currentPage = ((context._slot_page as number) || 0) + 1;
      const pageSize = 5;
      const nextBatch = allSlots.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

      if (nextBatch.length > 0) {
        console.log(`[AvailabilityEngine] Returning next slot batch (page ${currentPage}, ${nextBatch.length} slots)`);
        await mergeConversationContext(supabase, conversationId, {
          conflict_suggestions: nextBatch,
          _slot_page: currentPage,
        });

        const formatted = formatCurrentSuggestions(nextBatch);
        return {
          newState: 'awaiting_slot_selection' as ConversationState,
          newContext: { ...context, conflict_suggestions: nextBatch, _slot_page: currentPage },
          preValidationMessage: `Sem problema.\n\nTenho também estes horários:\n\n${formatted}\n\nAlgum destes funciona?`,
        };
      } else {
        console.log('[AvailabilityEngine] No more slots available for pagination');
        return {
          newState: 'collecting_data' as ConversationState,
          newContext: context,
          preValidationMessage: 'Não tenho mais horários disponíveis para esse dia.\n\nSe quiser, posso verificar outro dia para si.',
        };
      }
    }

    // ──────────────────────────────────────────────
    // STEP 1: DATE DETECTION (BEFORE time matching)
    // If user provides a date (with or without time), check if it
    // differs from current suggestions. If so → fresh search.
    // This MUST run before time matching to prevent stale slot commits.
    // NOTE: Bare "segunda/quarta/quinta/sexta" are excluded — they are
    // ambiguous with ordinals. Only match with "-feira" or "proxima" prefix.
    // ──────────────────────────────────────────────
    const hasDateComponent = /\b(amanha|hoje|dia\s+\d|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}[\/\-]\d{1,2}|proxima semana|semana que vem|proxima\s+(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)|(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)[- ]?feira)\b/.test(normalizedMsg);

    if (hasDateComponent) {
      const dateCheck = extractDeterministicFields(userMessage, {});
      if (dateCheck.preferred_date) {
        const newDateStr = String(dateCheck.preferred_date);
        const suggestionsDate = getSuggestionsDate();

        if (suggestionsDate && newDateStr.startsWith(suggestionsDate)) {
          // Same date as suggestions — check if there's also a time to match
          console.log(`[SlotSelection] Date matches suggestions (${suggestionsDate}) — will try time matching below`);
          // Fall through to time matching
        } else {
          // Different date — clear stale and search fresh
          console.log(`[SlotSelection] New date detected: ${newDateStr} (suggestions are for ${suggestionsDate}) — fresh availability`);
          return await clearStaleAndSearchFresh(dateCheck.preferred_date);
        }
      }
    }

    // ──────────────────────────────────────────────
    // STEP 2: EMPTY SUGGESTIONS GUARD
    // ──────────────────────────────────────────────
    if (suggestions.length === 0) {
      // If user provided a date, try fresh search
      if (hasDateComponent) {
        const dateCheck = extractDeterministicFields(userMessage, {});
        if (dateCheck.preferred_date) {
          console.log(`[SlotSelection] No suggestions + date detected — fresh search for ${dateCheck.preferred_date}`);
          return await clearStaleAndSearchFresh(dateCheck.preferred_date);
        }
      }
      console.warn('[SlotSelection] No conflict_suggestions in context — state preserved (booking orchestrator will handle)');
      return { newState: 'awaiting_slot_selection' as ConversationState, newContext: context };
    }

    // ──────────────────────────────────────────────
    // STEP 3: MATCH USER SELECTION AGAINST SUGGESTIONS
    // At this point: suggestions exist, no date change detected.
    // ──────────────────────────────────────────────
    let matchedSlot: { start_datetime: string; end_datetime: string } | null = null;

    // --- 3a: Time-based slot selection ---
    const timeMatch = normalizedMsg.match(/\b(\d{1,2})[:h](\d{2})\b/) || normalizedMsg.match(/\b(\d{1,2})h\b/);
    if (timeMatch && !matchedSlot) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const normalizedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      const timeMatchedSlot = suggestions.find((s: { start_datetime: string }) => {
        const dt = new Date(s.start_datetime);
        const lisbonStr = dt.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
        const timePart = lisbonStr.split(', ')[1];
        const slotTime = timePart ? timePart.slice(0, 5) : '';
        return slotTime === normalizedTime;
      });

      if (timeMatchedSlot) {
        matchedSlot = timeMatchedSlot;
        console.log(`[SlotSelection] Matched by time: ${normalizedTime} → ${timeMatchedSlot.start_datetime}`);
      } else {
        // Time not in suggestions — since we already handled date changes above,
        // this is purely a time that doesn't match any option
        console.log(`[SlotSelection] Time ${normalizedTime} not in current suggestions — informing user`);
        const formatted = formatCurrentSuggestions(suggestions);
        return {
          newState: 'awaiting_slot_selection' as ConversationState,
          newContext: context,
          preValidationMessage: `Esse horário não está nas opções disponíveis.\n\nEstes são os horários que tenho:\n\n${formatted}\n\nQual prefere?`,
        };
      }
    }

    // --- 3b: Ordinal slot selection (primeira, segunda, terceira) ---
    if (!matchedSlot) {
      const ordinalMap: Record<string, number> = { 'primeira': 0, 'primeiro': 0, 'segundo': 1, 'segunda': 1, 'terceira': 2, 'terceiro': 2, 'quarta': 3, 'quarto': 3, 'quinta': 4, 'quinto': 4 };
      for (const [ordinal, idx] of Object.entries(ordinalMap)) {
        if (normalizedMsg.includes(ordinal) && suggestions[idx]) {
          matchedSlot = suggestions[idx];
          console.log(`[SlotSelection] Matched by ordinal "${ordinal}" → suggestion ${idx + 1}: ${matchedSlot.start_datetime}`);
          break;
        }
      }
    }

    // --- 3b2: Short reply / deictic selection ---
    // Handle "esse", "a próxima", "ok", "sim", "pode ser", "o último" etc.
    // If there's only 1 suggestion, short affirmatives auto-select it.
    if (!matchedSlot) {
      const SHORT_AFFIRMATIVES = new Set([
        'ok', 'sim', 'pode ser', 'esse', 'essa', 'este', 'esta',
        'tudo bem', 'perfeito', 'isso', 'isso mesmo', 'bora',
        'vamos la', 'certo', 'exato', 'correto', 'ok sim',
      ]);
      const FIRST_SELECTORS = new Set([
        'o primeiro', 'a primeira', 'primeiro', 'primeira',
        'a proxima', 'o proximo', 'proxima', 'proximo',
        'o mais cedo', 'a mais cedo', 'mais cedo',
      ]);
      const LAST_SELECTORS = new Set([
        'o ultimo', 'a ultima', 'ultimo', 'ultima',
        'o mais tarde', 'a mais tarde', 'mais tarde',
      ]);

      if (suggestions.length === 1 && SHORT_AFFIRMATIVES.has(normalizedMsg)) {
        matchedSlot = suggestions[0];
        console.log(`[SlotSelection] Short affirmative "${normalizedMsg}" with single suggestion → auto-selected: ${matchedSlot.start_datetime}`);
      } else if (FIRST_SELECTORS.has(normalizedMsg) && suggestions.length > 0) {
        matchedSlot = suggestions[0];
        console.log(`[SlotSelection] First selector "${normalizedMsg}" → suggestion 1: ${matchedSlot.start_datetime}`);
      } else if (LAST_SELECTORS.has(normalizedMsg) && suggestions.length > 0) {
        matchedSlot = suggestions[suggestions.length - 1];
        console.log(`[SlotSelection] Last selector "${normalizedMsg}" → suggestion ${suggestions.length}: ${matchedSlot.start_datetime}`);
      }
    }

    // --- 3c: Numeric / keyword slot selection (Lisbon timezone) ---
    if (!matchedSlot) {
      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const dt = new Date(s.start_datetime);
        const lisbonStr = dt.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
        const [datePart, timePart] = lisbonStr.split(', ');
        const [lDay, lMonth] = datePart.split('/');
        const lisbonDate = new Date(`${datePart.split('/').reverse().join('-')}T12:00:00`);
        const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const dayName = dayNames[lisbonDate.getDay()];
        const dateStr = `${parseInt(lDay)}/${parseInt(lMonth)}`;
        const timeStr = timePart ? timePart.slice(0, 5) : '00:00';
        const lHour = parseInt(timeStr.split(':')[0]);
        const lMin = timeStr.split(':')[1] || '00';
        const timeStrH = `${lHour}h${lMin !== '00' ? lMin : ''}`;

        const optionNum = String(i + 1);
        if (
          normalizedMsg === optionNum ||
          normalizedMsg.includes(dayName) ||
          normalizedMsg.includes(dateStr) ||
          normalizedMsg.includes(timeStr) ||
          normalizedMsg.includes(timeStrH)
        ) {
          matchedSlot = s;
          console.log(`[SlotSelection] Matched suggestion ${i + 1}: ${s.start_datetime} (Lisbon: ${dateStr} ${timeStr})`);
          break;
        }
      }
    }

    // ──────────────────────────────────────────────
    // STEP 4: MATCHED SLOT → AIL pre-validation → commit
    // ──────────────────────────────────────────────
    if (matchedSlot) {
      const slotServiceId = (context.service_id as string);
      if (slotServiceId) {
        console.log('[AIL] Pre-validation triggered (slot selection)');
        try {
          const slotAvail: InternalAvailabilityResult = await checkInternalAvailability(
            supabase, empresaId, slotServiceId, matchedSlot.start_datetime
          );
          if (!slotAvail.available) {
            console.log('[AIL] Slot unavailable (slot selection) — staying in awaiting_slot_selection');
            const remainingSuggestions = suggestions.filter(
              (s: ConflictSuggestion) => s.start_datetime !== matchedSlot!.start_datetime
            );
            if (remainingSuggestions.length > 0) {
              await mergeConversationContext(supabase, conversationId, { conflict_suggestions: remainingSuggestions });
              const formatted = formatSuggestionSlots(remainingSuggestions);
              return {
                newState: 'awaiting_slot_selection' as ConversationState,
                newContext: { ...context, conflict_suggestions: remainingSuggestions },
                preValidationMessage: `Essa opção também já não está disponível.\nAqui estão as restantes:\n${formatted}\n\nQual prefere?`,
              };
            } else {
              try {
                const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
                const newSugResp = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                  body: JSON.stringify({
                    company_id: empresaId,
                    service_id: slotServiceId,
                    max_suggestions: 3,
                    search_days: 7,
                  }),
                });
                if (newSugResp.ok) {
                  const newSugData = await newSugResp.json();
                  const newSuggestions = (newSugData.suggestions || []) as ConflictSuggestion[];
                  if (newSuggestions.length > 0) {
                    await mergeConversationContext(supabase, conversationId, { conflict_suggestions: newSuggestions });
                    const formatted = formatSuggestionSlots(newSuggestions);
                    return {
                      newState: 'awaiting_slot_selection' as ConversationState,
                      newContext: { ...context, conflict_suggestions: newSuggestions },
                      preValidationMessage: `As opções anteriores já não estão disponíveis.\nAqui estão novas alternativas:\n${formatted}\n\nQual prefere?`,
                    };
                  }
                }
              } catch (_e) { /* fall through */ }
              await updateConversationState(supabase, conversationId, 'collecting_data');
              return {
                newState: 'collecting_data' as ConversationState,
                newContext: context,
                preValidationMessage: 'As opções disponíveis expiraram. Pode indicar outra data e hora?',
              };
            }
          }
          console.log('[AIL] Slot available (slot selection) — proceeding to commit');
        } catch (ailErr) {
          console.error('[AIL] Pre-validation error in slot selection (non-blocking):', ailErr);
        }
      }

      return await commitSlotSelection(matchedSlot);
    }

    // ──────────────────────────────────────────────
    // STEP 5: NO MATCH — re-display suggestions
    // ──────────────────────────────────────────────
    console.log(`[SlotSelection] No match for: "${normalizedMsg}" — state preserved in awaiting_slot_selection`);
    const formatted = formatCurrentSuggestions(suggestions);
    return {
      newState: 'awaiting_slot_selection' as ConversationState,
      newContext: context,
      preValidationMessage: `Não percebi a sua escolha. Estas são as opções:\n\n${formatted}\n\nPode responder com o número (1, 2, 3…) ou a hora.`,
    };
  }

  return { newState: currentState, newContext: context };
}

// extractFieldsFromMessage removed — replaced by deterministic-field-extractor + structured-field-extractor

// =============================================
// Main Handler
// =============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message } = await req.json();

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'conversationId and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing AI response for conversation: ${conversationId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch conversation to get empresa context (including AI config)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        empresas(id, nome, service_chat_enabled, service_voice_enabled, service_scheduling_enabled, service_email_enabled, chat_ai_real_enabled, chat_ai_provider, chat_ai_model, pricing_enabled)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const permissions: ServicePermissions = {
      service_chat_enabled: conversation.empresas?.service_chat_enabled ?? false,
      service_voice_enabled: conversation.empresas?.service_voice_enabled ?? false,
      service_scheduling_enabled: conversation.empresas?.service_scheduling_enabled ?? false,
      service_email_enabled: conversation.empresas?.service_email_enabled ?? false,
    };

    const chatPermission = checkActionPermission('answer_information', permissions);
    if (!chatPermission.allowed) {
      console.log('Chat service disabled for empresa, blocking response');
      await logActionExecution(supabase, {
        empresa_id: conversation.empresa_id,
        conversation_id: conversationId,
        action_type: 'answer_information',
        action_data: { message },
        actor_type: 'ai',
        outcome: 'blocked',
        outcome_message: chatPermission.blockedReason,
        credits_consumed: 0,
      });
      return new Response(
        JSON.stringify({ blocked: true, reason: chatPermission.blockedReason }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (conversation.owner !== 'ai') {
      console.log('Conversation is not AI-owned, skipping auto-response');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'not_ai_owned' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === STATE MACHINE: Read current state ===
    const convContext = await getConversationContext(supabase, conversationId);
    let currentState: ConversationState = (convContext?.conversation_state as ConversationState) || 'idle';
    let currentContext: Record<string, unknown> = convContext?.conversation_context || {};

    console.log(`[StateMachine] Current state: ${currentState}`);

    // =============================================
    // GLOBAL DONE-STATE GUARD — ABSOLUTE PRIORITY
    // If _bv2_step === 'done' && booking_finalized === true,
    // handle the message HERE and return IMMEDIATELY.
    // No intent router, no orchestrator, no price engine, no LLM.
    // =============================================
    if (
      currentContext._bv2_step === 'done' &&
      currentContext.booking_finalized === true
    ) {
      console.log('[DoneStateGuard] GLOBAL GUARD — done state with booking_finalized=true');
      const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      // --- Reschedule intent: the ONLY exit from done state ---
      const RESCHEDULE_RE = /\b(alterar|mudar|trocar|reagendar|em vez de|outro dia|outro hor[áa]rio|outra hora|outra data|pode ser antes|pode ser depois|afinal|queria (as|às|mudar|trocar)|queria às|pode ser [àa]s)\b/i;
      if (RESCHEDULE_RE.test(msg)) {
        console.log('[DoneStateGuard] Reschedule intent → passing through to booking-v2');
        // Fall through — let booking-v2 handle reschedule
      } else {
        // === DETERMINISTIC POST-BOOKING HANDLER ===
        // All responses are rule-based. No LLM. No generic fallbacks.

        // --- Helper: format booking datetime from context ---
        const formatBookingDetails = (): { datePart: string; timePart: string; serviceName: string | null } => {
          const bdt = currentContext._bv2_booking_datetime as string | null;
          let datePart = '';
          let timePart = '';
          if (bdt && bdt.includes('T')) {
            const dtObj = new Date(`${bdt.substring(0, 10)}T12:00:00`);
            const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
            const [_y, mo, da] = bdt.substring(0, 10).split('-').map(Number);
            const [hh, mm] = bdt.substring(11, 16).split(':');
            datePart = `${dayNames[dtObj.getDay()]}, ${da} de ${monthNames[mo - 1]}`;
            timePart = `${parseInt(hh)}h${mm !== '00' ? mm : ''}`;
          }
          const serviceName = (currentContext.reason_normalized || currentContext._bv2_service_name || null) as string | null;
          return { datePart, timePart, serviceName };
        };

        let doneResponse: string;

        // === A) Confirmation / status intent ===
        const confirmRe = /\b(confirm|confirmad[oa]|está confirmad|ficou confirmad|ficou marcad|está marcad|tenho marcacao|tenho marcação|tenho consulta|está agendad|ficou agendad|está tudo certo|tudo certo\?|pode confirmar)\b/i;
        if (confirmRe.test(msg)) {
          console.log('[DoneStateGuard] Confirmation question → reassure with details');
          const { datePart, timePart, serviceName } = formatBookingDetails();
          const serviceStr = serviceName ? `\n🏷️ ${serviceName}` : '';
          if (datePart && timePart) {
            doneResponse = `Sim 😊 O seu agendamento está confirmado:${serviceStr}\n📅 ${datePart}\n⏰ ${timePart}\n\nSe precisar de alterar ou cancelar, diga-me.`;
          } else {
            doneResponse = 'Sim 😊 O seu agendamento está confirmado. Se precisar de alterar ou cancelar, diga-me.';
          }

        // === B) Cancel intent ===
        } else if (/\b(cancelar|desmarcar|anular|nao quero|nao quero|desistir|cancel)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Cancel intent in done state');
          doneResponse = 'Para cancelar o seu agendamento, por favor contacte-nos diretamente. Posso ajudar com mais alguma questão? 😊';

        // === C) Price intent ===
        } else if (/\b(preco|quanto custa|valor|custo|price|quanto pago|mensalidade|€|euros|quanto fica|quanto e)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Price question in done state');
          const svcId = currentContext.service_id as string | null;
          if (svcId) {
            let priceText = await generatePriceResponse(supabase, svcId);
            // Strip ALL booking CTAs — booking is already done
            while (priceText.includes(BOOKING_SUGGESTION)) {
              priceText = priceText.replace(BOOKING_SUGGESTION, '');
            }
            priceText = priceText.replace(/\n*Se quiser,? posso verificar.*horários.*marcar\.?/gi, '');
            doneResponse = priceText.trim();
          } else {
            doneResponse = 'O valor deste serviço é definido após avaliação inicial. Posso ajudar com mais alguma questão sobre o seu agendamento?';
          }

        // === D) Availability / schedule intent ===
        } else if (/\b(disponibilidade|disponivel|quando posso|quando podem|horarios disponiveis|vagas|proxima vaga|proximo horario|que horarios|horarios livres)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Availability question in done state');
          doneResponse = 'O seu agendamento já está confirmado. Se precisar de alterar, é só dizer 😊';

        // === E) Location / address intent ===
        } else if (/\b(onde e|morada|endereco|endereco|localizacao|localizacao|como chego|direcoes|direcoes|maps|mapa)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Location question in done state');
          doneResponse = 'Para informações sobre a localização, por favor consulte o nosso website ou contacte-nos diretamente. Posso ajudar com mais alguma questão? 😊';

        // === F) Preparation / what-to-bring intent ===
        } else if (/\b(preparar|preparacao|levar|trazer|preciso de levar|preciso levar|documentos|o que devo|o que preciso)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Preparation question in done state');
          doneResponse = 'Para informações sobre como se preparar para a sua consulta, por favor contacte-nos diretamente. Teremos todo o gosto em ajudar! 😊';

        // === G) Email / notification intent ===
        } else if (/\b(email|e-mail|confirmacao por|receber confirmacao|vou receber|notificacao|notificacao|sms|mensagem)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Email/notification question in done state');
          doneResponse = 'Sim 😊 Vai receber um email com todos os detalhes do seu agendamento.';

        // === H) Duration intent ===
        } else if (/\b(quanto tempo|duracao|duracao|demora|dura quanto|quanto dura|minutos|tempo da)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Duration question in done state');
          const svcId = currentContext.service_id as string | null;
          if (svcId) {
            const { data: svcDur } = await supabase
              .from('scheduling_services')
              .select('name, duration_minutes')
              .eq('id', svcId)
              .single();
            if (svcDur?.duration_minutes) {
              doneResponse = `O serviço ${svcDur.name} tem uma duração estimada de ${svcDur.duration_minutes} minutos.`;
            } else {
              doneResponse = 'A duração da consulta pode variar. Para mais detalhes, por favor contacte-nos diretamente 😊';
            }
          } else {
            doneResponse = 'A duração da consulta pode variar. Para mais detalhes, por favor contacte-nos diretamente 😊';
          }

        // === I) Neutral / thank-you / greeting / farewell ===
        } else if (/^(ok[.!]?|obrigad[oa]|obg|perfeito|tudo bem|certo|fixe|otimo|excelente|valeu|thanks|thank you|de nada|tchau|adeus|ate logo|ate logo|bom dia|boa tarde|boa noite|bye)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Neutral/thank-you/farewell message');
          doneResponse = 'Perfeito! Se precisar de algo mais, estou por aqui 😊';

        // === J) Booking details request (generic) ===
        } else if (/\b(dados|detalhes|informacao|informacao|resumo|info da marcacao|info da marcacao|minha marcacao|minha marcacao|meu agendamento)\b/i.test(msg)) {
          console.log('[DoneStateGuard] Booking details request');
          const { datePart, timePart, serviceName } = formatBookingDetails();
          const serviceStr = serviceName ? `\n🏷️ ${serviceName}` : '';
          if (datePart && timePart) {
            doneResponse = `Aqui estão os detalhes do seu agendamento:${serviceStr}\n📅 ${datePart}\n⏰ ${timePart}\n\nSe precisar de alterar ou cancelar, diga-me.`;
          } else {
            doneResponse = 'O seu agendamento está confirmado. Se precisar de mais detalhes, por favor contacte-nos diretamente 😊';
          }

        // === K) Catch-all: helpful closing (NOT generic fallback) ===
        } else {
          console.log('[DoneStateGuard] General message in done state');
          doneResponse = 'O seu agendamento está confirmado! Posso ajudar com mais alguma questão? 😊';
        }

        // Insert response and return immediately
        const agent = await getDefaultChatAgent(supabase, conversation.empresa_id);
        const agentStyle = (agent?.response_style || 'neutral') as ResponseStyle;
        const styledDone = formatResponseByStyle(doneResponse, agentStyle);

        const { data: doneInserted, error: doneErr } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'ai',
          content: styledDone,
          is_internal: false,
        }).select('id').single();

        if (!doneErr && doneInserted?.id) {
          await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
          try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', doneInserted.id); } catch {}
        }

        console.log(`[DoneStateGuard] Response sent: "${styledDone.substring(0, 80)}..." — EARLY RETURN`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GUIDED FIRST INTERACTION ===
    // Guided greeting is now sent at conversation creation (public-chat).
    // This block only ensures the flag is set if somehow missing.
    if (currentState === 'idle' && !currentContext._guided_greeting_sent) {
      console.log('[GuidedInteraction] Flag not set — marking as sent (greeting handled by public-chat)');
      await mergeConversationContext(supabase, conversationId, { _guided_greeting_sent: true });
      currentContext._guided_greeting_sent = true;
    }

    // === GUIDED OPTION SELECTION MAPPING (Dynamic Services) ===
    if (currentState === 'idle' && currentContext._guided_greeting_sent === true) {
      const normalizedGuided = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const serviceMap = (currentContext._guided_service_map || {}) as Record<string, string>;
      
      // Check if user selected a numbered option
      let selectedServiceId: string | null = null;
      
      // Try exact number match first
      if (serviceMap[normalizedGuided]) {
        selectedServiceId = serviceMap[normalizedGuided];
      }
      
      // Try matching by service name from the map
      if (!selectedServiceId) {
        for (const [optNum, svcId] of Object.entries(serviceMap)) {
          if (svcId === '_human_escalation') continue;
          // Fetch service name and compare
          const { data: svc } = await supabase
            .from('scheduling_services')
            .select('name')
            .eq('id', svcId)
            .single();
          if (svc) {
            const svcNorm = svc.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (normalizedGuided.includes(svcNorm) || svcNorm.includes(normalizedGuided)) {
              selectedServiceId = svcId;
              break;
            }
          }
        }
      }

      // Also match legacy patterns for human escalation
      const HUMAN_PATTERNS = /^(falar com alguem|falar com alguém|humano|atendimento humano|falar com a equipa|ligar para alguem|ligar para alguém)$/;
      
      if (selectedServiceId === '_human_escalation' || HUMAN_PATTERNS.test(normalizedGuided)) {
        console.log('[GuidedInteraction] Human escalation selected');
        await mergeConversationContext(supabase, conversationId, { current_intent: Intent.HUMAN_ESCALATION });
        
        // Check operator availability before handoff
        const OPERATOR_ONLINE_THRESHOLD_MINUTES = 5;
        const operatorCutoff = new Date(Date.now() - OPERATOR_ONLINE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
        const { data: onlineOperators } = await supabase
          .from('profiles')
          .select('id')
          .eq('empresa_id', conversation.empresa_id)
          .gte('last_seen_at', operatorCutoff)
          .is('deleted_at', null)
          .limit(1);

        const operatorAvailable = onlineOperators && onlineOperators.length > 0;

        let handoffMessage: string;
        if (operatorAvailable) {
          handoffMessage = 'Vou encaminhar para a nossa equipa. Um momento, por favor.';
          await supabase.from('conversations').update({ owner: 'ai', status: 'waiting_human' }).eq('id', conversationId);
        } else {
          console.log('[GuidedInteraction] No operators online — skipping handoff');
          handoffMessage = 'Neste momento a nossa equipa não está disponível.\n\nPosso ajudar já aqui no chat ou registar o seu pedido para que entrem em contacto consigo.';
          // Do NOT change conversation owner/status — keep AI active
        }

        const { data: handoffMsg, error: handoffErr } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'ai',
          content: handoffMessage,
          is_internal: false,
        }).select('id').single();

        if (!handoffErr && handoffMsg?.id) {
          await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
          try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', handoffMsg.id); } catch {}
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (selectedServiceId && selectedServiceId !== '_human_escalation') {
        // User selected a specific service → set service_id and start booking
        console.log(`[GuidedInteraction] Service selected: ${selectedServiceId} → BOOKING_NEW`);
        const { data: selectedSvc } = await supabase
          .from('scheduling_services')
          .select('name')
          .eq('id', selectedServiceId)
          .single();
        
        await mergeConversationContext(supabase, conversationId, {
          current_intent: Intent.BOOKING_NEW,
          booking_intent: 'schedule',
          service_id: selectedServiceId,
          reason_normalized: selectedSvc?.name || '',
          reason_original: message.trim(),
        });
        currentContext = {
          ...currentContext,
          current_intent: Intent.BOOKING_NEW,
          booking_intent: 'schedule',
          service_id: selectedServiceId,
          reason_normalized: selectedSvc?.name || '',
          reason_original: message.trim(),
        };
      }
      // If no match, fall through to normal intent classification
    }

    // === IMMUTABILITY GUARD: Fields locked after first booking confirmation ===
    const IMMUTABLE_AFTER_BOOKING = ['reason', 'reason_original', 'reason_normalized', 'service_id', 'booking_intent', 'confirmed_snapshot', 'booking_id', 'appointment_id'];
    const hasActiveBooking = !!currentContext.appointment_id || currentState === 'booking_active';

    function stripImmutableFields(fields: Record<string, unknown>): Record<string, unknown> {
      if (!hasActiveBooking) return fields;
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (IMMUTABLE_AFTER_BOOKING.includes(key)) {
          console.log(`[ImmutabilityGuard] BLOCKED mutation of "${key}" (active booking exists)`);
          continue;
        }
        filtered[key] = value;
      }
      return filtered;
    }

    // === BOOKING V2 ISOLATION FLAG ===
    // If booking-v2 state exists, legacy booking logic is fully disabled.
    const bv2IsActive = !!(currentContext._bv2_step || currentContext._bv2_booking_datetime);
    if (bv2IsActive) {
      console.log(`[BookingIsolation] V2 active — legacy booking disabled (_bv2_step=${currentContext._bv2_step}, _bv2_booking_datetime=${currentContext._bv2_booking_datetime})`);
      // One-time cleanup of legacy booking fields
      if (currentContext.selected_datetime || currentContext.slot_confirmed || currentContext.conflict_suggestions || currentContext._all_available_slots) {
        console.log('[BookingIsolation] Clearing legacy booking fields');
        await mergeConversationContext(supabase, conversationId, {
          selected_datetime: null,
          slot_confirmed: false,
          conflict_suggestions: null,
          _all_available_slots: null,
        });
        currentContext.selected_datetime = null;
        currentContext.slot_confirmed = false;
        currentContext.conflict_suggestions = null;
        currentContext._all_available_slots = null;
      }
    }

    // === SANITIZE INVALID selected_datetime ===
    if (currentContext.selected_datetime && !String(currentContext.selected_datetime).includes('T')) {
      console.log(`[DatetimeFix] Clearing invalid selected_datetime (no time): "${currentContext.selected_datetime}"`);
      await mergeConversationContext(supabase, conversationId, { selected_datetime: null });
      currentContext.selected_datetime = null;
    }

    // === DETERMINISTIC FIELD EXTRACTOR (runs BEFORE state machine) ===
    const deterministicFields = extractDeterministicFields(message, currentContext);
    const safeDeterministicFields = stripImmutableFields(deterministicFields);
    if (Object.keys(safeDeterministicFields).length > 0) {
      await mergeConversationContext(supabase, conversationId, safeDeterministicFields);
      console.log(`[DeterministicExtractor] Merged into context: ${Object.keys(safeDeterministicFields).join(', ')}`);
    }

    // === SMART SLOT RESET v3.0 ===
    // If the user provides a new date/time expression, reset ALL previous slot context
    // and treat it as a new availability request. Works in any state.
    //
    // IMPORTANT: In awaiting_slot_selection, the state handler already handles
    // date changes (questions, new dates, slot selections). The SmartSlotReset here
    // is a safety net for states where the handler didn't catch it.
    //
    // In awaiting_confirmation, the DateGuard (STEP 4) already handles date changes.
    // SmartSlotReset here only fires if the DateGuard didn't trigger (e.g. collecting_data).
    if (safeDeterministicFields.preferred_date && !bv2IsActive) {
      // Skip reset for states that handle date changes in their own handlers
      const handledByStateHandler = currentState === 'awaiting_slot_selection' || currentState === 'awaiting_confirmation';

      if (handledByStateHandler) {
        console.log(`[SmartSlotReset] Skipped — state "${currentState}" handles date changes in its own handler`);
      } else {
        // === SAME-DATETIME GUARD: Don't clear selected_datetime if preferred_date hasn't actually changed ===
        const newPrefDate = String(safeDeterministicFields.preferred_date);
        const existingSelected = currentContext.selected_datetime as string | undefined;
        const existingPreferred = currentContext.preferred_date as string | undefined;

        // Check if the "new" date is actually the same as what we already have
        const isSameDateAsSelected = existingSelected && (
          newPrefDate === existingSelected ||
          newPrefDate.substring(0, 10) === existingSelected.substring(0, 10)
        );
        const isSameDateAsPreferred = existingPreferred && newPrefDate === existingPreferred;

        if (isSameDateAsSelected && !isSameDateAsPreferred) {
          // Date matches selected_datetime — this is NOT a new date, just a re-extraction
          console.log(`[SmartSlotReset] Skipped — new preferred_date matches selected_datetime (${newPrefDate.substring(0, 10)})`);
        } else if (isSameDateAsPreferred && existingSelected) {
          // Preferred date unchanged AND selected_datetime exists — preserve both
          console.log(`[SmartSlotReset] Skipped — preferred_date unchanged and selected_datetime exists`);
        } else {
          const SLOT_RESET_STATES: ConversationState[] = ['booking_processing', 'collecting_data'];
          const shouldResetSlots = SLOT_RESET_STATES.includes(currentState);

          if (shouldResetSlots) {
            console.log(`[SmartSlotReset] New date detected in state "${currentState}": ${newPrefDate} (was: ${existingPreferred || 'none'}) — resetting slot context`);
            await mergeConversationContext(supabase, conversationId, {
              preferred_date: safeDeterministicFields.preferred_date,
              conflict_suggestions: null,
              _all_available_slots: null,
              _slot_page: null,
              selected_datetime: null,
              slot_confirmed: null,
              slot_changed: true,
            });
          } else if (currentContext.selected_datetime) {
            // Fallback for other states: just clear selected_datetime
            console.log(`[SchedulingUpdate] Updating preferred_date from user correction: ${newPrefDate} — clearing selected_datetime`);
            await mergeConversationContext(supabase, conversationId, {
              preferred_date: safeDeterministicFields.preferred_date,
              selected_datetime: null,
              slot_changed: true,
            });
          }
        }
      }
    }

    // === RE-FETCH CONTEXT FROM DB (source of truth after deterministic merge) ===
    let freshConvContext = await getConversationContext(supabase, conversationId);
    currentContext = freshConvContext?.conversation_context || currentContext;

    // === LLM STRUCTURED FIELD EXTRACTOR (runs AFTER deterministic, BEFORE state machine) ===
    // Resolve AI credentials early for the structured extractor
    const empresa = conversation.empresas;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const extractorEndpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    const extractorAuthHeader = `Bearer ${lovableApiKey}`;
    const extractorModel = 'google/gemini-2.5-flash';

    if ((currentState === 'collecting_data' || currentState === 'idle') && !hasActiveBooking) {
      // Fetch company services for grounded reason extraction
      let companyServices: CompanyServiceSummary[] = [];
      try {
        const { data: services } = await supabase
          .from('scheduling_services')
          .select('name, description')
          .eq('empresa_id', conversation.empresa_id)
          .eq('status', 'active')
          .order('priority', { ascending: true });
        if (services) {
          companyServices = services as CompanyServiceSummary[];
        }
      } catch (svcErr) {
        console.error('[StructuredExtractor] Failed to fetch company services:', svcErr);
      }

      const llmFields = await extractStructuredFieldsViaLLM(
        message, currentContext, extractorEndpoint, extractorAuthHeader, extractorModel, companyServices
      );
      const safeLlmFields = stripImmutableFields(llmFields);

      // === REASON ARCHITECTURE: Preserve reason_original on first extraction ===
      if (safeLlmFields.reason && !currentContext.reason_original) {
        safeLlmFields.reason_original = safeLlmFields.reason;
        console.log(`[ReasonArchitecture] reason_original preserved`);
      }

      if (Object.keys(safeLlmFields).length > 0) {
        await mergeConversationContext(supabase, conversationId, safeLlmFields);
        console.log(`[StructuredExtractor] Merged into context: ${Object.keys(safeLlmFields).join(', ')}`);
      }

      // Re-fetch context after LLM merge
      freshConvContext = await getConversationContext(supabase, conversationId);
      currentContext = freshConvContext?.conversation_context || currentContext;
    }

    console.log('[ContextBeforeValidation]', JSON.stringify(currentContext));

    // === ORCHESTRATOR V2: Centralized conversation flow decision ===
    const confirmationDetected = isUserConfirmation(message);

    // Check if company has bookable services (cached per request)
    let hasBookableServicesFlag = false;
    {
      const { data: bkSvcs } = await supabase
        .from('scheduling_services')
        .select('id, scheduling_service_resources!inner(resource_id)')
        .eq('empresa_id', conversation.empresa_id)
        .eq('status', 'active')
        .eq('bookable', true)
        .limit(1);
      hasBookableServicesFlag = !!(bkSvcs && bkSvcs.length > 0);
    }

    const orchestratorDecision: OrchestratorDecision = orchestrate({
      message,
      currentState,
      currentContext,
      deterministicFields: safeDeterministicFields,
      hasActiveBooking,
      hasBookableServices: hasBookableServicesFlag,
    });

    // Log orchestrator decisions
    for (const log of orchestratorDecision.logs) {
      console.log(log);
    }

    // Apply flow reset if needed
    if (orchestratorDecision.resetFlow) {
      console.log(`[Orchestrator] Flow reset to ${orchestratorDecision.forcedState || 'idle'}`);
      if (orchestratorDecision.forcedState) {
        currentState = orchestratorDecision.forcedState;
        await updateConversationState(supabase, conversationId, orchestratorDecision.forcedState);
      }
      if (orchestratorDecision.fieldsToClear) {
        const clearData: Record<string, unknown> = {};
        for (const field of orchestratorDecision.fieldsToClear) {
          clearData[field] = null;
          delete currentContext[field];
        }
        await mergeConversationContext(supabase, conversationId, clearData);
      }
    }

    // Apply context updates from orchestrator
    if (Object.keys(orchestratorDecision.contextUpdates).length > 0) {
      await mergeConversationContext(supabase, conversationId, orchestratorDecision.contextUpdates);
      Object.assign(currentContext, orchestratorDecision.contextUpdates);
    }

    // Booking context cleanup (non-booking intent in idle)
    const cleanupDecision = shouldCleanBookingContext(
      orchestratorDecision.effectiveIntent,
      currentState,
      currentContext,
    );
    if (cleanupDecision.shouldClean) {
      console.log(`[ContextCleanup] Cleared booking context: ${cleanupDecision.fieldsToRemove.join(', ')}`);
      for (const field of cleanupDecision.fieldsToRemove) {
        delete currentContext[field];
      }
      await supabase
        .from('conversations')
        .update({ conversation_context: currentContext })
        .eq('id', conversationId);
    }

    // Early service resolution
    if (shouldResolveServiceEarly(orchestratorDecision.effectiveIntent, currentContext, message)) {
      console.log(`[EarlyServiceResolve] Intent ${orchestratorDecision.effectiveIntent} without service_id — attempting resolution`);
      const resolvedFromMsg = await runServiceResolutionPipeline(supabase, conversation.empresa_id, message);
      if (resolvedFromMsg) {
        console.log(`[EarlyServiceResolve] Resolved: ${resolvedFromMsg.reason_normalized} (${resolvedFromMsg.service_id})`);
        await mergeConversationContext(supabase, conversationId, {
          service_id: resolvedFromMsg.service_id,
          reason_original: message,
          reason_normalized: resolvedFromMsg.reason_normalized,
        });
        currentContext.service_id = resolvedFromMsg.service_id;
        currentContext.reason_original = message;
        currentContext.reason_normalized = resolvedFromMsg.reason_normalized;
      }
    }

    let skipSchedulingForIntent = !orchestratorDecision.runSchedulingPipeline;

    // Force scheduling if booking signals exist (safety net)
    if (skipSchedulingForIntent) {
      const bookingSignals =
        currentContext.service_id ||
        currentContext.reason_normalized ||
        currentContext.preferred_date ||
        currentContext.selected_datetime ||
        currentContext.booking_in_progress === true ||
        (Array.isArray(currentContext.conflict_suggestions) && (currentContext.conflict_suggestions as unknown[]).length > 0);
      if (bookingSignals) {
        console.log('[SchedulingPriority] Booking signals detected — forcing scheduling pipeline');
        skipSchedulingForIntent = false;
      }
    }

    // === SERVICE INQUIRY INTERRUPT (Deterministic, Non-Invasive) ===
    if (
      !skipSchedulingForIntent &&
      (currentState === 'collecting_data' || currentState === 'awaiting_confirmation') &&
      detectServiceInquiry(message)
    ) {
      console.log('[ServiceInquiry] Deterministic interrupt triggered');
      const { data: services } = await supabase
        .from('scheduling_services')
        .select('name')
        .eq('empresa_id', conversation.empresa_id)
        .eq('status', 'active')
        .order('priority', { ascending: true });

      if (services && services.length > 0) {
        const serviceList = services.map((s: any) => `• ${s.name}`).join('\n');
        const inquiryMessage =
          `Atualmente temos os seguintes serviços:\n${serviceList}\n\nQual pretende marcar?`;

        const { data: insertedMsg, error: msgErr } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_type: 'ai',
            content: inquiryMessage,
            is_internal: false,
          })
          .select('id')
          .single();

        if (!msgErr && insertedMsg?.id) {
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

          try {
            await registerCreditUsage(
              supabase,
              conversation.empresa_id,
              'message',
              insertedMsg.id
            );
          } catch (creditError) {
            console.error('[ServiceInquiry] Credit registration failed (non-blocking)', creditError);
          }
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === DETERMINISTIC PRICE REQUEST ENGINE ===
    // Intercept PRICE_REQUEST intent BEFORE LLM — fully deterministic response
    // PATCH: Allow price questions during awaiting_confirmation without changing state
    {
      const priceIntent = classifyIntentDeterministic(message);

      if (priceIntent === Intent.PRICE_REQUEST) {
        console.log(`[PriceEngine] PRICE_REQUEST detected (state=${currentState})`);

        // SAFETY: If booking already finalized, suppress scheduling CTA
        const bookingAlreadyFinalized = currentContext.booking_finalized === true;

        let priceResponseContent: string;

        if (!currentContext.service_id) {
          // === SMART SERVICE DETECTION FOR PRICE ===
          // Attempt to resolve service from the price query keywords
          const priceNorm = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
          const { data: priceServices } = await supabase
            .from('scheduling_services')
            .select('id, name, description, price, currency, promo_price, promo_start, promo_end')
            .eq('empresa_id', conversation.empresa_id)
            .eq('status', 'active');

          if (priceServices && priceServices.length > 0) {
            // Try keyword matching from the user message against service names/descriptions
            // PATCH: Improved matching — score-based to prefer exact service name matches
            const msgWords = priceNorm.split(/\s+/).filter((w: string) => w.length > 2);
            // deno-lint-ignore no-explicit-any
            const scoredServices = priceServices.map((svc: any) => {
              const svcNameNorm = svc.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '');
              const svcDescNorm = ((svc.description || '') as string).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '');
              const svcFullNorm = svcNameNorm + ' ' + svcDescNorm;
              let score = 0;
              // High score: service name words appear in the message
              const svcNameWords = svcNameNorm.split(/\s+/).filter((w: string) => w.length > 2);
              for (const w of svcNameWords) {
                if (priceNorm.includes(w)) score += 10;
              }
              // Medium score: message words appear in service name/description
              for (const w of msgWords) {
                if (w.length > 3 && svcFullNorm.includes(w)) score += 5;
              }
              return { svc, score };
            });
            const bestScore = Math.max(...scoredServices.map(s => s.score));
            // Only consider matches with score >= 5 (at least one meaningful word match)
            const matched = bestScore >= 5
              ? scoredServices.filter(s => s.score === bestScore).map(s => s.svc)
              : [];

            if (matched.length === 1) {
              // Exact single match — generate price response
              console.log(`[PriceEngine] Smart match: resolved to "${matched[0].name}"`);
              priceResponseContent = await generatePriceResponse(supabase, matched[0].id);
            } else if (matched.length > 1) {
              // Multiple matches — list all with prices
              console.log(`[PriceEngine] Smart match: ${matched.length} services matched — listing all`);
              // deno-lint-ignore no-explicit-any
              const priceLines = matched.map((svc: any) => {
                const sym = CURRENCY_SYMBOLS[svc.currency || 'EUR'] || (svc.currency || '€');
                if (svc.price !== null && svc.price !== undefined) {
                  const now = new Date();
                  if (svc.promo_price !== null && svc.promo_start && svc.promo_end) {
                    const ps = new Date(svc.promo_start);
                    const pe = new Date(svc.promo_end);
                    if (now >= ps && now <= pe) {
                      return `• ${svc.name}: ${svc.promo_price}${sym} (promoção, normal: ${svc.price}${sym})`;
                    }
                  }
                  return `• ${svc.name}: ${svc.price}${sym}`;
                }
                return `• ${svc.name}: valor sob consulta`;
              }).join('\n');
              priceResponseContent = `Aqui estão os valores dos nossos serviços:\n${priceLines}${BOOKING_SUGGESTION}`;
            } else if (priceServices.length === 1) {
              // Only one service exists — use it
              console.log(`[PriceEngine] Smart match: only 1 service exists — using it`);
              priceResponseContent = await generatePriceResponse(supabase, priceServices[0].id);
            } else {
              // No match — list all services with prices
              console.log(`[PriceEngine] Smart match: no keyword match — listing all services`);
              // deno-lint-ignore no-explicit-any
              const allPriceLines = priceServices.map((svc: any) => {
                const sym = CURRENCY_SYMBOLS[svc.currency || 'EUR'] || (svc.currency || '€');
                if (svc.price !== null && svc.price !== undefined) {
                  const now = new Date();
                  if (svc.promo_price !== null && svc.promo_start && svc.promo_end) {
                    const ps = new Date(svc.promo_start);
                    const pe = new Date(svc.promo_end);
                    if (now >= ps && now <= pe) {
                      return `• ${svc.name}: ${svc.promo_price}${sym} (promoção, normal: ${svc.price}${sym})`;
                    }
                  }
                  return `• ${svc.name}: ${svc.price}${sym}`;
                }
                return `• ${svc.name}: valor sob consulta`;
              }).join('\n');
              priceResponseContent = `Aqui estão os valores dos nossos serviços:\n${allPriceLines}${BOOKING_SUGGESTION}`;
            }
          } else {
            priceResponseContent = 'Pode indicar qual serviço pretende? Assim consigo informar o valor correto.';
          }
        } else {
          priceResponseContent = await generatePriceResponse(supabase, currentContext.service_id as string);
        }

        // SAFETY: Strip scheduling CTA if booking already finalized
        if (bookingAlreadyFinalized) {
          // Replace all occurrences (generatePriceResponse and inline both append it)
          while (priceResponseContent.includes(BOOKING_SUGGESTION)) {
            priceResponseContent = priceResponseContent.replace(BOOKING_SUGGESTION, '');
          }
          // Also strip any partial CTA variations
          priceResponseContent = priceResponseContent.replace(/\n*Se quiser,? posso verificar.*horários.*marcar\.?/gi, '');
          if (priceResponseContent !== priceResponseContent) {
            console.log('[PriceEngine] Stripped scheduling CTA (booking_finalized=true)');
          }
          console.log('[PriceEngine] CTA suppression applied (booking_finalized=true)');
        }

        const { data: priceMsg, error: priceErr } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_type: 'ai',
            content: priceResponseContent,
            is_internal: false,
          })
          .select('id')
          .single();

        if (!priceErr && priceMsg?.id) {
          await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
          try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', priceMsg.id); } catch {}
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // =============================================
    // BOOKING V2 TAKEOVER — authoritative handler for booking flows
    // =============================================
    {
      const bv2Intent = currentContext.current_intent as string | undefined;
      const bv2BookingIntent = currentContext.booking_intent as string | undefined;
      const bv2HasServiceAndDate = !!(currentContext.service_id && (currentContext.preferred_date || currentContext.selected_datetime));
      const bv2ActiveStep = currentContext._bv2_step as string | undefined;

      // Detect reschedule intent when step=done (post-booking changes)
      const RESCHEDULE_INTENT_RE = /\b(alterar|mudar|trocar|reagendar|em vez de|outro dia|outro hor[áa]rio|outra hora|outra data|pode ser antes|pode ser depois|afinal|queria (as|às|mudar|trocar)|queria às|pode ser [àa]s)\b/i;
      const msgNorm = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isPostBookingReschedule = (bv2ActiveStep === 'done' || currentContext.booking_finalized === true) && RESCHEDULE_INTENT_RE.test(msgNorm);

      if (isPostBookingReschedule) {
        console.log(`[BookingV2] Post-booking reschedule intent detected in chat-ai-response`);
      }

      // PATCH: Flow continuity — include booking_in_progress flag
      const bv2BookingInProgress = currentContext.booking_in_progress === true;

      const isBookingFlow =
        bv2Intent === 'BOOKING_NEW' ||
        bv2BookingIntent === 'schedule' ||
        bv2HasServiceAndDate ||
        (bv2ActiveStep && bv2ActiveStep !== 'done') ||
        bv2BookingInProgress ||
        isPostBookingReschedule;

      if (isBookingFlow) {
        console.log(`[BookingV2] Takeover attempt — intent=${bv2Intent}, booking_intent=${bv2BookingIntent}, hasServiceAndDate=${bv2HasServiceAndDate}, bv2_step=${bv2ActiveStep || 'none'}`);

        try {
          // Build booking-v2 context from conversation context
          // CANONICAL DATETIME RULE: _bv2_booking_datetime is the single source of truth.
          // Only fall back to preferred_date if it contains full datetime (with T).
          // NEVER use selected_datetime or date-only values as booking_datetime.
          const rawBv2Dt = (currentContext._bv2_booking_datetime as string) ?? null;
          const fallbackDt = (() => {
            // RULE: _bv2_booking_datetime is the ONLY source of truth.
            // preferred_date is auxiliary and must NEVER override a full datetime.
            if (rawBv2Dt) {
              console.log(`[DatetimeFix] Using _bv2_booking_datetime: ${rawBv2Dt}`);
              return rawBv2Dt;
            }
            // Only use preferred_date as initial seed if no bv2 datetime exists yet
            const pref = currentContext.preferred_date as string | undefined;
            if (pref) {
              console.log(`[DatetimeFix] Seeding from preferred_date (no bv2 datetime yet): ${pref}`);
              return pref;
            }
            // selected_datetime only if it has time component
            const sel = currentContext.selected_datetime as string | undefined;
            if (sel && sel.includes('T')) {
              console.log(`[DatetimeFix] Seeding from selected_datetime: ${sel}`);
              return sel;
            }
            if (sel && !sel.includes('T')) {
              console.log(`[DatetimeFix] Ignoring selected_datetime (no time): ${sel}`);
            }
            return null;
          })();
          console.log(`[BookingDatetime] Context build: bv2_dt=${rawBv2Dt}, fallback=${fallbackDt}, preferred=${currentContext.preferred_date}, selected=${currentContext.selected_datetime}`);

          const bv2Context = {
            booking_datetime: fallbackDt,
            customer_name: (currentContext.customer_name as string) ?? null,
            customer_email: (currentContext.customer_email as string) ?? null,
            customer_phone: (currentContext.customer_phone as string) ?? null,
            service_id: (currentContext.service_id as string) ?? null,
            step: (bv2ActiveStep as string) ?? 'ask_datetime',
            pending_contact: (currentContext._bv2_pending_contact as boolean) ?? false,
            reschedule_target: (currentContext._bv2_reschedule_target as string) ?? null,
            appointment_id: (currentContext._bv2_appointment_id as string) ?? null,
          };

          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

          await fetch(`${SUPABASE_URL}/functions/v1/booking-v2`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
  },
  body: JSON.stringify(payload),
});

          if (bv2Resp.ok) {
            const bv2Data = await bv2Resp.json();
            const bv2ResponseText = bv2Data.response as string | undefined;
            const bv2ReturnedCtx = bv2Data.context || {};
            const bv2BookingCreated = bv2Data.booking_created === true;
            const bv2Action = bv2Data.action as string | null;
            const bv2Payload = bv2Data.payload || {};

            // Validate response
            if (bv2ResponseText && bv2ResponseText.trim().length > 0) {
              console.log(`[BookingV2] Success — response used (booking_created=${bv2BookingCreated}, step=${bv2ReturnedCtx.step}, action=${bv2Action})`);

              // ── LLM enhancement DISABLED for stability ──
              // Always use deterministic booking-v2 response directly.
              const finalResponseText = bv2ResponseText;
              console.log(`[BookingV2] Deterministic response used (LLM disabled) | action=${bv2Action} | step=${bv2ReturnedCtx.step}`);

              // Persist booking-v2 state back into conversation context
              // NEVER downgrade booking_datetime: if returned value lacks time but current has it, keep current
              const returnedDt = bv2ReturnedCtx.booking_datetime as string | null;
              const currentBv2Dt = currentContext._bv2_booking_datetime as string | null;
              let persistedDt = returnedDt;
              if (returnedDt && !returnedDt.includes('T') && currentBv2Dt?.includes('T')) {
                console.log(`[BookingDatetime] Ignored invalid overwrite: "${returnedDt}" would downgrade "${currentBv2Dt}"`);
                persistedDt = currentBv2Dt;
              }
              console.log(`[BookingDatetime] Persisted across steps: ${persistedDt}`);

              await mergeConversationContext(supabase, conversationId, {
                _bv2_step: bv2ReturnedCtx.step ?? 'ask_datetime',
                _bv2_booking_datetime: persistedDt,
                _bv2_pending_contact: bv2ReturnedCtx.pending_contact ?? false,
                _bv2_reschedule_target: bv2ReturnedCtx.reschedule_target ?? null,
                _bv2_appointment_id: bv2ReturnedCtx.appointment_id ?? null,
                // Sync identity fields back
                customer_name: bv2ReturnedCtx.customer_name ?? currentContext.customer_name ?? null,
                customer_email: bv2ReturnedCtx.customer_email ?? currentContext.customer_email ?? null,
                customer_phone: bv2ReturnedCtx.customer_phone ?? currentContext.customer_phone ?? null,
              });

              // If booking was created, mark as finalized
              if (bv2BookingCreated) {
                await mergeConversationContext(supabase, conversationId, {
                  booking_finalized: true,
                  booking_in_progress: false,
                });
                await updateConversationState(supabase, conversationId, 'booking_active');
              }

              // Insert the response message
              const agent = await getDefaultChatAgent(supabase, conversation.empresa_id);
              const agentStyle = (agent?.response_style || 'neutral') as ResponseStyle;
              const styledBv2 = formatResponseByStyle(finalResponseText, agentStyle);

              const { data: bv2Msg, error: bv2MsgErr } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_type: 'ai',
                content: styledBv2,
                is_internal: false,
              }).select('id').single();

              if (!bv2MsgErr && bv2Msg?.id) {
                await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', bv2Msg.id); } catch {}
              }

              // BLOCK legacy — return immediately
              return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            } else {
              console.log('[BookingV2] Fallback — empty response, proceeding to legacy');
            }
          } else {
            console.error(`[BookingV2] Fallback — HTTP ${bv2Resp.status}, proceeding to legacy`);
          }
        } catch (bv2Err) {
          console.error('[BookingV2] Fallback — error:', bv2Err);
        }
      } else {
        console.log('[BookingV2] Not a booking flow — legacy path');
      }
    }

    // === STATE RECONCILIATION: Fix state/context drift before booking pipeline ===
    if (orchestratorDecision.runStateMachine && !bv2IsActive) {
      const reconciliation = reconcileState(currentState, currentContext);
      if (reconciliation.changed) {
        console.log(`[StateReconciliation] ${reconciliation.reason}`);
        currentState = reconciliation.reconciledState;
        await updateConversationState(supabase, conversationId, reconciliation.reconciledState);
      } else {
        console.log(`[StateReconciliation] No drift — ${reconciliation.reason}`);
      }
    } else if (bv2IsActive) {
      console.log('[StateReconciliation] Skipped — V2 active');
    }

    // === BOOKING ORCHESTRATOR: Deterministic booking pipeline ===
    // Runs BEFORE state machine to decide if availability check is needed
    let bookingPipelineHandled = false;
    if (orchestratorDecision.runStateMachine && !skipSchedulingForIntent && !bv2IsActive) {
      const bookingDecision: BookingOrchestratorResult = bookingOrchestrator(currentContext);
      console.log(`[BookingOrchestrator] action=${bookingDecision.action}, reason=${bookingDecision.reason}`);

      // If the orchestrator says we need an availability check AND we're not already in awaiting_slot_selection
      if (bookingDecision.action === 'check_availability' && currentState !== 'awaiting_slot_selection') {
        console.log('[BookingOrchestrator] Triggering deterministic availability check');
        const ailServiceId = currentContext.service_id as string;
        const ailPreferredDate = currentContext.preferred_date as string;

        if (ailServiceId && ailPreferredDate) {
          try {
            const ailResult: InternalAvailabilityResult = await checkInternalAvailability(
              supabase, conversation.empresa_id, ailServiceId, ailPreferredDate
            );

            if (ailResult.available) {
              // CASE A: Slot available → set selected_datetime
              console.log('[BookingOrchestrator] CASE A — slot available');
              await mergeConversationContext(supabase, conversationId, {
                selected_datetime: ailPreferredDate,
                slot_confirmed: true,
              });
              currentContext.selected_datetime = ailPreferredDate;
              currentContext.slot_confirmed = true;

              // Check if customer data is present
              const hasCustomerData = !!currentContext.customer_name && !!currentContext.customer_email && !!currentContext.customer_phone;

              if (hasCustomerData) {
                // All data present → show confirmation summary
                await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
                currentState = 'awaiting_confirmation' as ConversationState;

                const summaryContent = generateBookingSummary(currentContext, { mode: 'initial' });
                if (summaryContent) {
                  const { data: sumMsg, error: sumErr } = await supabase.from('messages').insert({
                    conversation_id: conversationId,
                    sender_type: 'ai',
                    content: summaryContent,
                    is_internal: false,
                  }).select('id').single();
                  if (!sumErr && sumMsg?.id) {
                    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                    try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', sumMsg.id); } catch {}
                  }
                  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
              } else {
                // Customer data missing → ask for it
                await updateConversationState(supabase, conversationId, 'collecting_data');
                currentState = 'collecting_data' as ConversationState;

                const missingFields: string[] = [];
                if (!currentContext.customer_name) missingFields.push('name');
                if (!currentContext.customer_email) missingFields.push('email');
                if (!currentContext.customer_phone) missingFields.push('phone');

                const dt = new Date(ailPreferredDate);
                const timeStr = dt.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
                const dateStr = dt.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long' });

                const dataRequestMsg = `Tenho disponibilidade! ✅\n📅 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} às ${timeStr}\n\nPara finalizar o agendamento, preciso dos seguintes dados:\n\n${missingFields.map(f => {
                  const emojis: Record<string, string> = { name: '👤', email: '📧', phone: '📱' };
                  const labels: Record<string, string> = { name: 'Nome completo', email: 'Email', phone: 'Número de telefone' };
                  return `${emojis[f] || '•'} ${labels[f] || f}`;
                }).join('\n')}\n\nPode enviar todos na mesma mensagem.`;

                const { data: dataMsg, error: dataErr } = await supabase.from('messages').insert({
                  conversation_id: conversationId, sender_type: 'ai', content: dataRequestMsg, is_internal: false,
                }).select('id').single();
                if (!dataErr && dataMsg?.id) {
                  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                  try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', dataMsg.id); } catch {}
                }
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            } else {
              // CASE B: Not available → fetch suggestions → awaiting_slot_selection
              console.log('[BookingOrchestrator] CASE B — slot unavailable → fetching suggestions');
              let suggestions: ConflictSuggestion[] = [];
              try {
                const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
                const sugResp = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                  body: JSON.stringify({
                    company_id: conversation.empresa_id,
                    service_id: ailServiceId,
                    requested_start: ailPreferredDate,
                    max_suggestions: 5,
                    search_days: 7,
                  }),
                });
                if (sugResp.ok) {
                  const sugData = await sugResp.json();
                  suggestions = (sugData.suggestions || []) as ConflictSuggestion[];
                }
              } catch (sugErr) {
                console.error('[BookingOrchestrator] Suggestion fetch failed:', sugErr);
              }

              if (suggestions.length > 0) {
                const displaySlots = suggestions.slice(0, 5);
                await mergeConversationContext(supabase, conversationId, {
                  conflict_suggestions: displaySlots,
                  _all_available_slots: suggestions,
                  _slot_page: 0,
                });
                await updateConversationState(supabase, conversationId, 'awaiting_slot_selection');
                currentState = 'awaiting_slot_selection' as ConversationState;

                const formatted = displaySlots.map((s: ConflictSuggestion) => {
                  const dt = new Date(s.start_datetime);
                  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                  const dayNum = String(dt.getDate()).padStart(2, '0');
                  const monthNum = String(dt.getMonth() + 1).padStart(2, '0');
                  const time = dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                  return `• ${dayNames[dt.getDay()]} ${dayNum}/${monthNum} às ${time}`;
                }).join('\n');

                const slotMsg = `O horário solicitado não está disponível.\n\nTenho estes horários:\n\n${formatted}\n\nQual prefere?`;
                const { data: sMsg, error: sErr } = await supabase.from('messages').insert({
                  conversation_id: conversationId, sender_type: 'ai', content: slotMsg, is_internal: false,
                }).select('id').single();
                if (!sErr && sMsg?.id) {
                  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                  try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', sMsg.id); } catch {}
                }
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              } else {
                // No slots anywhere
                const noSlotMsg = 'De momento não tenho horários disponíveis nos próximos dias.\n\nSe quiser, posso verificar noutra altura para si.';
                const { data: nsMsg, error: nsErr } = await supabase.from('messages').insert({
                  conversation_id: conversationId, sender_type: 'ai', content: noSlotMsg, is_internal: false,
                }).select('id').single();
                if (!nsErr && nsMsg?.id) {
                  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                  try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', nsMsg.id); } catch {}
                }
                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            }
          } catch (availErr) {
            console.error('[BookingOrchestrator] Availability check failed (non-blocking):', availErr);
          }
        }
      }

      // Sync state with orchestrator's derived state if it differs and we haven't handled it
      if (!bookingPipelineHandled && bookingDecision.derivedState !== currentState) {
        const stateOrder: Record<string, number> = {
          'idle': 0, 'collecting_service': 1, 'collecting_data': 2,
          'awaiting_slot_selection': 3, 'awaiting_confirmation': 4,
          'booking_processing': 5, 'booking_active': 6, 'rescheduling': 3,
        };
        const currentOrd = stateOrder[currentState] ?? 0;
        const derivedOrd = stateOrder[bookingDecision.derivedState] ?? 0;
        // Only advance forward (prevent backward regression)
        if (derivedOrd > currentOrd) {
          console.log(`[BookingOrchestrator] State advance: ${currentState} → ${bookingDecision.derivedState}`);
          currentState = bookingDecision.derivedState;
          await updateConversationState(supabase, conversationId, bookingDecision.derivedState);
        }
      }
    }

    // === STATE MACHINE: Pre-response transition (Orchestrator V2 routing) ===
    let transition: { newState: ConversationState; newContext: Record<string, unknown>; missingFields?: string[]; justTransitioned?: boolean; preValidationMessage?: string };

    if (bv2IsActive) {
      // V2 is authoritative — skip legacy state machine entirely
      console.log('[BookingIsolation] State machine skipped — V2 active');
      transition = { newState: currentState, newContext: currentContext };
    } else if (orchestratorDecision.runStateMachine && !skipSchedulingForIntent) {
      transition = await handlePreResponseStateTransition(
        supabase, conversationId, conversation.empresa_id, currentState, currentContext, message
      );
    } else if (!orchestratorDecision.runStateMachine) {
      console.log('[Orchestrator] State machine bypassed — non-booking flow');
      transition = { newState: currentState, newContext: currentContext };
    } else {
      console.log('[Orchestrator] Scheduling pipeline skipped but state machine active');
      transition = await handlePreResponseStateTransition(
        supabase, conversationId, conversation.empresa_id, currentState, currentContext, message
      );
    }

    // === UNDEFINED STATE PROTECTION ===
    if (!transition.newState) {
      console.error(`[StateMachine] UNDEFINED STATE after transition — keeping previous state: ${currentState}`);
    } else {
      currentState = transition.newState;
    }
    currentContext = transition.newContext;

    console.log(`[StateMachine] State after transition: ${currentState}`);

    // === RUNTIME LOG: State transition ===
    runtimeLog(supabase, conversation.empresa_id, conversationId, 'state_transition', `State changed to ${currentState}`, { previous_state: convContext?.conversation_state, new_state: currentState });

    // === EARLY RETURN: Deterministic response when fields are missing ===
    if (currentState === 'collecting_data' && transition.missingFields && transition.missingFields.length > 0) {
      // Special message when slot was just selected and we need customer data
      const slotJustSelected = currentContext.selected_datetime && currentContext.slot_confirmed && transition.justTransitioned;
      const customerFieldsMissing = transition.missingFields.filter(f => ['name', 'email', 'phone'].includes(f));
      const onlyCustomerDataMissing = customerFieldsMissing.length === transition.missingFields.length && customerFieldsMissing.length > 0;

      let deterministicMessage: string;
      if (slotJustSelected && onlyCustomerDataMissing) {
        // After slot selection — ask for customer data naturally
        const labels: Record<string, string> = { name: 'nome', email: 'email', phone: 'telefone' };
        const fieldList = customerFieldsMissing.map(f => labels[f] || f);
        const last = fieldList.pop()!;
        const joined = fieldList.length > 0 ? `${fieldList.join(', ')} e ${last}` : last;
        deterministicMessage = `Ótimo! Para finalizar, preciso do seu ${joined}.`;
      } else {
        deterministicMessage = buildMissingFieldsResponse(transition.missingFields);
      }
      console.log(`[DeterministicGuard] EARLY RETURN — missing fields: [${transition.missingFields.join(', ')}]`);
      console.log(`[DeterministicGuard] Response: ${deterministicMessage}`);

      // Save deterministic message directly — NO LLM call
      const { data: insertedMsg, error: msgErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: deterministicMessage,
        is_internal: false,
      }).select('id').single();

      if (msgErr) {
        console.error('Failed to insert deterministic message:', msgErr);
        return new Response(
          JSON.stringify({ error: 'Failed to save response' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      try {
        await registerCreditUsage(supabase, conversation.empresa_id, 'message', insertedMsg.id);
      } catch (creditError) {
        console.error('Credit registration failed (non-blocking):', creditError);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === AIL: Pre-validation message (deterministic, no LLM) ===
    if (transition.preValidationMessage) {
      console.log('[AIL] Returning deterministic pre-validation message');
      const { data: ailMsg, error: ailErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: transition.preValidationMessage,
        is_internal: false,
      }).select('id').single();

      if (ailErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', ailMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === RESCHEDULE BLOCKED: Deterministic response when reschedule not allowed ===
    if (currentState === 'booking_active' && currentContext._reschedule_blocked) {
      const blockedMessage = 'Para alterar o seu agendamento, por favor contacte a empresa diretamente.';
      console.log('[RescheduleEngine] Reschedule blocked — deterministic response');
      await mergeConversationContext(supabase, conversationId, { _reschedule_blocked: null });

      const { data: blockedMsg, error: blockedErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: blockedMessage,
        is_internal: false,
      }).select('id').single();

      if (blockedErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', blockedMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === RESCHEDULE CONFLICT: Show suggestions when rescheduling had conflict ===
    if (currentState === 'rescheduling' && currentContext._reschedule_conflict) {
      const suggestions = (currentContext.reschedule_suggestions || []) as Array<{ start_datetime: string }>;
      let conflictMessage: string;
      if (suggestions.length > 0) {
        const formatted = suggestions.map((s) => {
          const dt = new Date(s.start_datetime);
          const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
          return `• ${dayNames[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        });
        conflictMessage = `O horário solicitado não está disponível. Posso sugerir:\n\n${formatted.join('\n')}\n\nQual prefere?`;
      } else {
        conflictMessage = 'O horário solicitado não está disponível e não encontrei alternativas próximas. Pode indicar outra data?';
      }

      await mergeConversationContext(supabase, conversationId, { _reschedule_conflict: null });

      const { data: rcMsg, error: rcErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: conflictMessage,
        is_internal: false,
      }).select('id').single();

      if (rcErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', rcMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === AWAITING SLOT SELECTION: Re-display suggestions when user didn't match ===
    if (currentState === 'awaiting_slot_selection') {
      // No valid match — re-display suggestions with slot validation message
      const suggestions = (currentContext.conflict_suggestions || []) as Array<{ start_datetime: string }>;

      // Detect if user proposed a specific time (slot validation guard response)
      const userProposedTime = /\d{1,2}\s*[h:]\s*\d{0,2}/.test(message);

      let reDisplayMessage: string;
      if (suggestions.length > 0) {
        const formatted = suggestions.map((s) => {
          const dt = new Date(s.start_datetime);
          const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
          return `• ${dayNames[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        });
        reDisplayMessage = userProposedTime
          ? `Esse horário não está disponível.\n\nTenho estes horários disponíveis:\n\n${formatted.join('\n')}\n\nQual prefere?`
          : `Não identifiquei a sua escolha. Por favor, selecione uma das opções disponíveis:\n\n${formatted.join('\n')}\n\nPode indicar o número (1, 2, 3) ou o horário pretendido.`;
      } else {
        reDisplayMessage = 'Não existem sugestões disponíveis. Pode indicar outra data e hora?';
        await updateConversationState(supabase, conversationId, 'collecting_data');
      }

      const { data: rdMsg, error: rdErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: reDisplayMessage,
        is_internal: false,
      }).select('id').single();

      if (rdErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', rdMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === SLOT SELECTION → CONFIRMATION: Show summary after user selected a slot ===
    // Fires on justTransitioned OR slot_changed flag (commitSlotSelection sets both)
    if (currentState === 'awaiting_confirmation' && (transition.justTransitioned === true || currentContext.slot_changed === true) && !currentContext._reschedule_pending && currentContext.conflict_suggestions === null) {
      // Clear slot_changed flag after consuming it
      if (currentContext.slot_changed) {
        await mergeConversationContext(supabase, conversationId, { slot_changed: null });
      }
      // This fires after awaiting_slot_selection → awaiting_confirmation
      const slotConfirmContent = generateBookingSummary(currentContext, { mode: 'initial' });
      if (!slotConfirmContent) {
        // Time not resolved — ask user for specific time
        console.log('[ConfirmationGuard] Summary blocked (missing time) — asking for time');
        await updateConversationState(supabase, conversationId, 'collecting_data');
        const timeMsg = '📅 Para confirmar o agendamento, preciso também da hora pretendida.';
        const { data: tmMsg } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: timeMsg, is_internal: false }).select('id').single();
        if (tmMsg?.id) { await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId); try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', tmMsg.id); } catch {} }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: scMsg, error: scErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: slotConfirmContent,
        is_internal: false,
      }).select('id').single();
      if (scErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', scMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (currentState === 'awaiting_confirmation' && transition.justTransitioned === true && currentContext._reschedule_pending) {
      const rescheduleConfirmContent = generateBookingSummary(currentContext, { mode: 'reschedule' });

      const { data: rcMsg, error: rcErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: rescheduleConfirmContent,
        is_internal: false,
      }).select('id').single();

      if (rcErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', rcMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === BOOKING PROCESSING: Handle reschedule update mode ===
    if (currentState === 'booking_processing' && currentContext._reschedule_pending) {
      console.log('[RescheduleEngine] Executing reschedule update...');
      const bookingId = (currentContext.booking_id || currentContext.appointment_id) as string;
      const newDate = (currentContext.reschedule_pending_datetime || currentContext.reschedule_new_date || currentContext.preferred_date) as string;

      let effectiveServiceId = (currentContext.service_id as string) || '';
      if (!effectiveServiceId && bookingId) {
        const { data: appt } = await supabase.from('agendamentos').select('service_id').eq('id', bookingId).single();
        effectiveServiceId = appt?.service_id || '';
      }

      const rescheduleResult = await executeReschedule(
        supabase, conversation.empresa_id, bookingId, effectiveServiceId, newDate,
      );

      let rescheduleMessage: string;
      if (rescheduleResult.success) {
        await mergeConversationContext(supabase, conversationId, {
          confirmed_start: rescheduleResult.new_start,
          confirmed_end: rescheduleResult.new_end,
          preferred_date: rescheduleResult.new_start,
          reschedule_new_date: null,
          reschedule_pending_datetime: null,
          reschedule_suggestions: null,
          _reschedule_pending: null,
          booking_in_progress: false,
        });

        // CommitGuard: Verify appointment_id before booking_active transition
        const rescheduleCtx = await getConversationContext(supabase, conversationId);
        const rescheduleVerified = rescheduleCtx?.conversation_context || {};
        if (!rescheduleVerified.appointment_id) {
          console.error('[CommitGuard] BLOCKED — booking_active without appointment_id (reschedule path)');
          throw new Error('Invalid state transition: missing appointment_id');
        }
        await updateConversationState(supabase, conversationId, 'booking_active');

        const dt = new Date(rescheduleResult.new_start!);
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const day = dayNames[dt.getDay()];
        const hours = String(dt.getHours()).padStart(2, '0');
        const mins = String(dt.getMinutes()).padStart(2, '0');
        const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}`;
        rescheduleMessage = `O seu agendamento foi atualizado com sucesso para ${day}, ${dateStr} às ${hours}:${mins}.`;
      } else {
        // Failed — revert to rescheduling
        await updateConversationState(supabase, conversationId, 'rescheduling');
        await mergeConversationContext(supabase, conversationId, { _reschedule_pending: null });
        rescheduleMessage = rescheduleResult.message || 'Não foi possível reagendar. Pode indicar outro horário?';
      }

      const { data: rMsg, error: rErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: rescheduleMessage,
        is_internal: false,
      }).select('id').single();

      if (rErr) {
        return new Response(JSON.stringify({ error: 'Failed to save response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      try { await registerCreditUsage(supabase, conversation.empresa_id, 'message', rMsg.id); } catch {}
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // (suggesting_slots state removed in v3.0 — availability is handled during booking_processing)

    // === DETERMINISTIC CONFIRMATION MESSAGE (only on ENTRY to awaiting_confirmation or slot_changed) ===
    let finalContent: string | null = null;

    // Re-fetch context to capture any slot_changed flag
    const confirmCtx = await getConversationContext(supabase, conversationId);
    if (confirmCtx) {
      currentContext = confirmCtx.conversation_context as Record<string, unknown>;
    }

    const shouldRegenerateConfirmation =
      (currentState === 'awaiting_confirmation' && transition.justTransitioned === true) ||
      (currentState === 'awaiting_confirmation' && currentContext.slot_changed === true);

    if (shouldRegenerateConfirmation) {
      console.log('[ConfirmationEngine] Generating deterministic confirmation message');

      // Handle slot selection for available_slots (resolve selected slot into context)
      if (currentContext.slot_selection && currentContext.available_slots) {
        const slots = currentContext.available_slots as Array<{ start_datetime: string }>;
        const selection = (currentContext.slot_selection as string).toLowerCase();
        const optionMatch = selection.match(/\b([123])\b/) || selection.match(/\b(primeira|segunda|terceira)\b/);
        if (optionMatch && slots.length > 0) {
          const optionMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, 'primeira': 0, 'segunda': 1, 'terceira': 2 };
          const idx = optionMap[optionMatch[1]] ?? 0;
          if (slots[idx]) {
            await mergeConversationContext(supabase, conversationId, { 
              selected_datetime: slots[idx].start_datetime 
            });
            currentContext = { ...currentContext, selected_datetime: slots[idx].start_datetime };
          }
        }
      }

      // Clear slot_changed flag after consuming it
      if (currentContext.slot_changed) {
        await mergeConversationContext(supabase, conversationId, { slot_changed: null });
      }

      // Use unified summary generator
      const isRescheduleConfirm = !!currentContext._reschedule_pending;
      finalContent = generateBookingSummary(currentContext, { mode: isRescheduleConfirm ? 'reschedule' : 'initial' }) || '📅 Para confirmar o agendamento, preciso também da hora pretendida.';

      console.log('[ConfirmationEngine] Deterministic confirmation message generated');
    }

    // === ENGINE-FIRST RESPONSE GUARD ===
    // Prevent premature LLM responses during booking_processing — wait for engine result
    // Also block re-entry if booking already finalized
    if (currentState === 'booking_processing' && !finalContent) {
      if (currentContext.booking_finalized === true || currentContext.confirmed_snapshot || currentContext.appointment_id) {
        console.log('[BOOKING BLOCKED - ALREADY FINALIZED] booking_processing re-entry blocked (engine-first guard)');
        const existingStart = currentContext.confirmed_start as string;
        if (existingStart) {
          const dt = new Date(existingStart);
          const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
          const day = dayNames[dt.getDay()];
          const hours = String(dt.getHours()).padStart(2, '0');
          const mins = String(dt.getMinutes()).padStart(2, '0');
          const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}`;
          finalContent = `✅ O seu agendamento está confirmado para ${day}, ${dateStr} às ${hours}:${mins}.`;
        } else {
          finalContent = '✅ O agendamento já foi confirmado com sucesso.';
        }
        // Ensure state is booking_active
        await updateConversationState(supabase, conversationId, 'booking_active');
      } else if (!currentContext.conflict_suggestions) {
        console.log('[EngineGuard] In booking_processing — engine will handle response via tool call');
      }
    }

    // Missing fields injection removed — handled by deterministic early return above

    // Fetch recent messages for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('sender_type, content')
      .eq('conversation_id', conversationId)
      .eq('is_internal', false)
      .neq('sender_type', 'system')
      .order('created_at', { ascending: false })
      .limit(10);

    const messageHistory = (recentMessages || []).reverse();

    // Load agent for style formatting (needed regardless of finalContent path)
    const agent = await getDefaultChatAgent(supabase, conversation.empresa_id);

    if (!finalContent) {

    const basePrompt = agent?.prompt_base || 
      `Você é um assistente virtual da empresa ${conversation.empresas?.nome || 'nossa empresa'}. 
       Responda de forma útil, profissional e amigável. 
       Se não souber a resposta, ofereça transferir para um atendente humano.`;

    const contextPrompt = agent?.contexto_negocio ? `\n\nContexto do negócio: ${agent.contexto_negocio}` : '';
    const personalityPrompt = agent?.personalidade ? `\n\nPersonalidade: ${agent.personalidade}` : '';

    const systemPrompt = buildActionAwarePrompt(
      basePrompt + contextPrompt + personalityPrompt,
      permissions,
      conversation.empresas?.nome || 'nossa empresa',
      message,
      currentState,
      currentContext,
    );

    // Build tools array — only include booking tool if scheduling is enabled AND state allows it
    // deno-lint-ignore no-explicit-any
    const tools: any[] = [];
    if (permissions.service_scheduling_enabled && currentState === 'booking_processing') {
      tools.push(BOOKING_TOOL_DEFINITION);
    }

    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...messageHistory.map((m: { sender_type: string; content: string }) => ({
        role: m.sender_type === 'client' ? 'user' : 'assistant',
        content: m.content,
      })),
    ];

    // === DYNAMIC AI PROVIDER RESOLUTION ===
    // empresa and lovableApiKey already declared above for structured extractor
    const aiRealEnabled = empresa?.chat_ai_real_enabled ?? false;
    const companyProviderKey = empresa?.chat_ai_provider || null;
    const companyModel = empresa?.chat_ai_model || null;

    let resolvedModel = 'google/gemini-2.5-flash';
    let resolvedEndpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    let resolvedAuthHeader = '';

    if (aiRealEnabled && companyProviderKey && companyModel) {
      const { data: providerRow } = await supabase
        .from('ai_providers')
        .select('id, provider_key, is_enabled, api_key, status')
        .eq('provider_key', companyProviderKey)
        .maybeSingle();

      if (providerRow && providerRow.is_enabled && providerRow.api_key) {
        resolvedModel = companyModel;

        console.log(`[AI-ROUTING] companyProviderKey: ${companyProviderKey}`);
        console.log(`[AI-ROUTING] resolvedModel (before): ${resolvedModel}`);

        if (providerRow.provider_key === 'openai') {
          resolvedEndpoint = 'https://api.openai.com/v1/chat/completions';
          resolvedAuthHeader = `Bearer ${providerRow.api_key}`;
          if (resolvedModel.startsWith('openai/')) {
            resolvedModel = resolvedModel.replace('openai/', '');
          }
        } else if (providerRow.provider_key === 'google') {
          const geminiModel = resolvedModel.startsWith('google/') ? resolvedModel.replace('google/', '') : resolvedModel;
          resolvedEndpoint = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
          resolvedAuthHeader = `Bearer ${providerRow.api_key}`;
          resolvedModel = geminiModel;
        } else {
          console.warn(`[AI-ROUTING] Unknown provider_key: ${providerRow.provider_key}, falling back to Lovable AI`);
          resolvedAuthHeader = `Bearer ${lovableApiKey}`;
        }

        console.log(`[AI-ROUTING] resolvedModel (final): ${resolvedModel}`);
        console.log(`[AI] Provider selected: ${providerRow.provider_key} - ${resolvedModel}`);
      } else {
        console.warn(`[AI] Provider '${companyProviderKey}' not ready, falling back to Lovable AI`);
        resolvedAuthHeader = `Bearer ${lovableApiKey}`;
      }
    } else {
      resolvedAuthHeader = `Bearer ${lovableApiKey}`;
      console.log(`[AI] Provider selected: lovable_default - ${resolvedModel}`);
    }

    if (!resolvedAuthHeader || resolvedAuthHeader === 'Bearer ' || resolvedAuthHeader === 'Bearer null' || resolvedAuthHeader === 'Bearer undefined') {
      console.error('No valid AI API key available');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling AI with messages:', aiMessages.length, 'agent:', agent?.nome || 'fallback', 'tools:', tools.length, 'model:', resolvedModel, 'state:', currentState);

    // === AI CALL WITH TOOL-CALLING LOOP ===
    // finalContent may already be set by ConfirmationEngine
    let currentMessages = [...aiMessages];
    const MAX_TOOL_ROUNDS = 3;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // deno-lint-ignore no-explicit-any
      const requestBody: any = {
        model: resolvedModel,
        messages: currentMessages,
      };
      if (resolvedModel.startsWith('gpt-')) {
        requestBody.max_completion_tokens = 500;
      } else {
        requestBody.max_tokens = 500;
      }
      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      let aiResponse = await fetch(resolvedEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': resolvedAuthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // === AI MODEL RETRY + FALLBACK ===
      // Step 1: Retry primary model once after 300ms for 5xx errors
      if (!aiResponse.ok && aiResponse.status >= 500 && aiResponse.status < 600) {
        const retryStatus = aiResponse.status;
        console.warn(`[AI-Retry] Primary model 5xx error (${retryStatus}) — retrying in 300ms`);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        aiResponse = await fetch(resolvedEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': resolvedAuthHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (aiResponse.ok) {
          console.log('[AI-Retry] Primary model retry succeeded');
        } else {
          console.warn(`[AI-Retry] Primary model retry also failed (${aiResponse.status})`);
        }
      }

      // Step 2: Fallback to secondary model if still failing
      if (!aiResponse.ok && [503, 429, 408, 500, 502, 504].includes(aiResponse.status)) {
        const failStatus = aiResponse.status;
        const errorText = await aiResponse.text();
        console.warn(`[AI-Fallback] Primary model failed (${failStatus}): ${errorText.substring(0, 200)}`);
        console.log('[AI-Fallback] Switching to secondary model: google/gemini-2.5-flash-lite');

        const fallbackBody = { ...requestBody, model: 'google/gemini-2.5-flash-lite' };
        return new Response(JSON.stringify({
  reply: "ok"
}), {
  headers: { "Content-Type": "application/json" }
});

        if (!aiResponse.ok) {
          const fallbackError = await aiResponse.text();
          console.error('[AI-Fallback] Secondary model also failed:', fallbackError);
          return new Response(
            JSON.stringify({ error: 'AI service error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('[AI-Fallback] Secondary model succeeded');
      } else if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'AI service error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      const choice = aiData.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) {
        console.error('No message in AI response');
        return new Response(
          JSON.stringify({ error: 'Empty AI response' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if the AI wants to call tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`[ToolCall] Round ${round + 1}: ${assistantMessage.tool_calls.length} tool call(s)`);
        currentMessages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            console.error('[ToolCall] Failed to parse tool arguments');
          }

          // Fetch fresh context for each tool call
          const toolCallCtx = await getConversationContext(supabase, conversationId);
          const toolCallContext = (toolCallCtx?.conversation_context ?? {}) as Record<string, unknown>;

          let toolResult: string;
          let bookingSucceeded = false;
          try {
            const { result } = await handleToolCall(
              supabase,
              toolName,
              toolArgs,
              conversation.empresa_id,
              agent?.id || null,
              conversationId,
              toolCallContext,
              { endpoint: resolvedEndpoint, authHeader: resolvedAuthHeader, model: resolvedModel },
            );
            toolResult = result;

            // === BOOKING SUCCESS PRIORITY GUARD ===
            // If booking succeeded, store success and prevent any further tool calls
            if (toolName === 'create_appointment_real') {
              try {
                const parsed = JSON.parse(toolResult);
                if (parsed.success === true) {
                  console.log(`[BOOKING_EXECUTION] SUCCESS — storing response and blocking further tool calls (duplicate_blocked=${!!parsed._duplicate_blocked})`);
                  bookingSucceeded = true;
                  // Build deterministic success message immediately
                  if (parsed.appointment_id && parsed.start) {
                    const dt = new Date(parsed.start);
                    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                    const day = dayNames[dt.getDay()];
                    const hours = String(dt.getHours()).padStart(2, '0');
                    const mins = String(dt.getMinutes()).padStart(2, '0');
                    const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}`;
                    finalContent = `✅ O seu agendamento está confirmado para ${day}, ${dateStr} às ${hours}:${mins}.`;
                  } else {
                    finalContent = parsed.message || '✅ Agendamento confirmado com sucesso.';
                  }
                } else if (parsed.success === false) {
                  // Only recover if booking was NOT already finalized (prevent override)
                  const freshCtx = await getConversationContext(supabase, conversationId);
                  const freshContext = freshCtx?.conversation_context as Record<string, unknown> || {};
                  if (freshContext.booking_finalized === true) {
                    console.log('[BookingGuard] Ignoring failure after booking_finalized — duplicate blocked');
                    bookingSucceeded = true; // Treat as success to prevent override
                  } else {
                    console.log(`[BookingRecovery] booking failed — error_code: ${parsed.error_code || 'UNKNOWN'}`);
                    const convSt = freshCtx?.conversation_state || 'idle';
                    if (convSt === 'booking_processing') {
                      await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
                      await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });
                      console.log('[BookingRecovery] State reverted to awaiting_confirmation');
                    }
                  }
                }
              } catch { /* non-JSON result — handled below */ }
            }
          } catch (toolError) {
            // === BOOKING FAILURE RECOVERY: Catch tool execution errors ===
            console.error(`[BookingRecovery] Tool execution error for ${toolName}:`, toolError);

            if (toolName === 'create_appointment_real') {
              // Check if booking was already finalized before this error
              const errCtx = await getConversationContext(supabase, conversationId);
              const errContext = errCtx?.conversation_context as Record<string, unknown> || {};
              if (errContext.booking_finalized === true) {
                console.log('[BOOKING_EXECUTION] BLOCKED_DUPLICATE — ignoring tool error after booking_finalized');
                console.log('[BOOKING_EXECUTION] BLOCKED_DUPLICATE');
                toolResult = JSON.stringify({ success: true, message: 'O agendamento já foi confirmado com sucesso.', _duplicate_blocked: true });
                bookingSucceeded = true;
              } else {
                console.log('[BookingRecovery] booking failed — tool threw exception');
                await updateConversationState(supabase, conversationId, 'awaiting_confirmation');
                await mergeConversationContext(supabase, conversationId, { booking_in_progress: false });
                console.log('[BookingRecovery] State reverted to awaiting_confirmation');

                toolResult = JSON.stringify({
                  success: false,
                  error_code: 'TOOL_EXECUTION_ERROR',
                  recovery_message: 'Peço desculpa, ocorreu um erro ao tentar finalizar o agendamento. Deseja que tente novamente?',
                  _instruction: 'DO NOT mention error codes or technical details. Use the recovery_message as your response.',
                });
              }
            } else {
              toolResult = JSON.stringify({ error: `Tool execution failed: ${String(toolError)}` });
            }
          }

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });

          // If booking succeeded, break out of tool calls loop
          if (bookingSucceeded) {
            console.log('[BookingGuard] Breaking tool call loop — booking already succeeded');
            break;
          }
        }

        // If booking succeeded with finalContent set, break the outer round loop too
        if (finalContent) {
          console.log('[BookingGuard] Breaking round loop — success response locked');
          break;
        }
        continue;
      }

      finalContent = assistantMessage.content;
      console.log('[ChatAI] Final assistant message generated successfully');
      break;
    }

    // === GUARANTEED FALLBACK ===
    if (!finalContent) {
      console.warn('[ChatAI] No final content after tool-calling loop. Building from tool results.');

      let lastToolResult: string | null = null;
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        // deno-lint-ignore no-explicit-any
        if ((currentMessages[i] as any).role === 'tool') {
          // deno-lint-ignore no-explicit-any
          lastToolResult = (currentMessages[i] as any).content;
          break;
        }
      }

      if (lastToolResult) {
        try {
          const parsed = JSON.parse(lastToolResult);
          if (parsed.success === true) {
            if (parsed.appointment_id && parsed.start) {
              const dt = new Date(parsed.start);
              const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
              const day = dayNames[dt.getDay()];
              const hours = String(dt.getHours()).padStart(2, '0');
              const mins = String(dt.getMinutes()).padStart(2, '0');
              const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}`;
              finalContent = `O seu agendamento está confirmado para ${day}, ${dateStr} às ${hours}:${mins}.`;
            } else {
              finalContent = parsed.message || 'Agendamento confirmado.';
            }
          } else if (parsed.success === false) {
            finalContent = parsed.recovery_message || parsed.message || 'Não foi possível concluir o agendamento. Pode tentar outro horário?';
          } else {
            finalContent = 'Não consegui processar o pedido. Pode reformular ou tentar novamente?';
          }
        } catch {
          finalContent = 'Ocorreu um erro ao processar o pedido. Pode tentar novamente?';
        }
      } else {
        finalContent = 'Não consegui processar o pedido. Pode tentar novamente ou pedir para falar com um operador.';
      }

      console.log('[ChatAI] Final assistant message generated successfully (from fallback)');
    }
    } // end if (!finalContent) — AI call block

    console.log('AI response received, inserting message');

    // === RESPONSE INTEGRITY GUARD ===
    // Detect and repair truncated responses before sending
    // Only run when a valid assistant message exists (length >= 20)
    if (finalContent && finalContent.trim().length >= 20) {
      finalContent = repairTruncatedResponse(finalContent);
    }

    // === RESPONSE STYLE FORMATTER ===
    // Apply agent's configured response style before insertion
    const agentStyle = (agent?.response_style || 'neutral') as ResponseStyle;
    const styledContent = formatResponseByStyle(finalContent, agentStyle);
    console.log(`[ResponseStyle] Applied style: ${agentStyle}`);

    // Insert AI message
    const { data: insertedMessage, error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'ai',
      content: styledContent,
      is_internal: false,
    }).select('id').single();

    if (msgError) {
      console.error('Failed to insert AI message:', msgError);
      return new Response(
        JSON.stringify({ error: 'Failed to save AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Register credits ONLY after successful message insertion
    try {
      await registerCreditUsage(supabase, conversation.empresa_id, 'message', insertedMessage.id);
    } catch (creditError) {
      console.error('Credit registration failed (non-blocking):', creditError);
    }

    console.log('AI response saved and credits registered successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
