import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getContext, updateContext as persistContext } from '../_shared/context-manager.ts';
import { callLLMSimple } from '../_shared/llm-provider.ts';
import {
  EXTRACTION_SYSTEM_PROMPT,
  parseExtractionResponse,
  validateExtraction,
  normalizeExtraction,
} from '../_shared/extraction-contract.ts';
import { handleSystemError, resetErrorCount } from '../_shared/error-handler.ts';
import { EMOTION_KEYWORDS, ERROR_MESSAGES, HANDOFF_RULES } from '../_shared/constants.ts';
import { resolveService, loadServices, loadMenuServices } from '../_shared/service-resolver.ts';
import { findClosestSlot, orchestrateBooking, resolveSlotSelectionFromContext } from '../_shared/booking-orchestrator.ts';
import { executeBooking } from '../_shared/booking-executor.ts';
import { executeReschedule } from '../_shared/reschedule-handler.ts';
import { answerFromKnowledge } from '../_shared/knowledge-retriever.ts';
import { generateResponse } from '../_shared/response-generator.ts';
import {
  buildResponseDirective,
  serializeDirectiveToPrompt,
  HARDCODED_TEMPLATES,
} from '../_shared/response-directive.ts';
import { triggerHandoff } from '../_shared/handoff-manager.ts';
import { createLeadIfEligible } from '../_shared/lead-manager.ts';
import { checkCredits, consumeCredits } from '../_shared/credit-manager.ts';
import { canTransition } from '../_shared/state-machine.ts';
import { log } from '../_shared/logger.ts';
import { ConversationContext, ConversationState, LLMExtraction, SchedulingService, SlotSuggestion } from '../_shared/types.ts';
import { decideNextAction } from '../_shared/decision-engine.ts';
import type { ActionType } from '../_shared/action-types.ts';
import { parseDateTime } from '../_shared/date-parser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFFICIAL_RUNTIME_STATES = new Set<ConversationState>([
  'idle',
  'collecting_service',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
  'booking_processing',
  'completed',
  'human_handoff',
]);

const ACTIVE_BOOKING_STATES = new Set<ConversationState>([
  'collecting_service',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
  'booking_processing',
]);

const SERVICE_LOCK_GUARDED_STATES = new Set<ConversationState>([
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
]);

const SUPPORTED_DECISION_ACTIONS = new Set<ActionType>([
  'HANDOFF',
  'ANSWER_INFO',
  'ASK_SERVICE',
  'ASK_DATE',
  'ASK_PERSONAL_DATA',
  'GENERATE_SLOTS',
  'SHOW_SLOTS',
  'SELECT_SLOT',
  'SLOT_SEARCH_BY_TIME',
  'CONFIRM_BOOKING',
  'CREATE_BOOKING',
  'START_CANCEL',
  'START_RESCHEDULE',
  'EXECUTE_RESCHEDULE',
]);

const BOOKING_FLOW_DECISION_ACTIONS = new Set<ActionType>([
  'ASK_SERVICE',
  'ASK_DATE',
  'ASK_PERSONAL_DATA',
  'GENERATE_SLOTS',
  'SHOW_SLOTS',
  'SELECT_SLOT',
  'SLOT_SEARCH_BY_TIME',
  'CONFIRM_BOOKING',
  'CREATE_BOOKING',
  'EXECUTE_RESCHEDULE',
]);

type RuntimeContextUpdates = Partial<ConversationContext> & {
  state?: ConversationState | string | null;
};

function normalizePersistedState(state: ConversationState | string | null | undefined): ConversationState | undefined {
  if (typeof state !== 'string' || state.trim().length === 0) return undefined;

  if (OFFICIAL_RUNTIME_STATES.has(state as ConversationState)) {
    return state as ConversationState;
  }

  if (state.toLowerCase().includes('handoff')) {
    return 'human_handoff';
  }

  // Phase 1: collapse unsupported booking pseudo-states into the supported data-collection state.
  return 'collecting_data';
}

async function updateContext(
  conversationId: string,
  updates: RuntimeContextUpdates,
  currentVersion: number
): Promise<ConversationContext> {
  const sanitizedUpdates: Partial<ConversationContext> = { ...updates };

  if (Object.prototype.hasOwnProperty.call(updates, 'state')) {
    const normalizedState = normalizePersistedState(updates.state);
    if (normalizedState) {
      sanitizedUpdates.state = normalizedState;
    } else {
      delete (sanitizedUpdates as Partial<ConversationContext> & { state?: unknown }).state;
    }
  }

  return persistContext(conversationId, sanitizedUpdates, currentVersion);
}

// =============================================================================
// HELPERS (extract time parts from slot ISO strings — single source of truth)
// =============================================================================

function extractTimeStart(slot: any): string | null {
  if (!slot?.start) return null;
  // slot.start is ISO like "2025-04-21T10:30:00+01:00" → "10:30"
  const m = slot.start.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function extractTimeEnd(slot: any): string | null {
  if (!slot?.end) return null;
  const m = slot.end.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function extractDate(slot: any): string | null {
  if (!slot?.start) return null;
  return slot.start.slice(0, 10);
}

function buildSlotDisplay(slot: any): string {
  if (typeof slot?.display_label === 'string' && slot.display_label.trim().length > 0) {
    return slot.display_label;
  }

  const date = extractDate(slot);
  const timeStart = extractTimeStart(slot);
  const timeEnd = extractTimeEnd(slot);

  if (date && timeStart && timeEnd) return `${date} ${timeStart}-${timeEnd}`;
  if (date && timeStart) return `${date} ${timeStart}`;
  return date ?? timeStart ?? 'Horário indisponível';
}

function buildConfirmedSnapshot(ctx: ConversationContext, slot?: any): any {
  const s = slot ?? ctx.selected_slot;
  return {
    service_name: ctx.service_name ?? null,
    customer_name: ctx.customer_name ?? null,
    customer_email: ctx.customer_email ?? null,
    customer_phone: ctx.customer_phone ?? null,
    date: extractDate(s) ?? ctx.preferred_date ?? null,
    time_start: extractTimeStart(s),
    time_end: extractTimeEnd(s),
  };
}

function buildAgentCtx(agent: any, empresa: any, agentPrompt: string): any {
  return {
    agent_name: agent?.nome ?? 'Assistente',
    agent_prompt: agentPrompt,
    agent_style: agent?.response_style ?? 'friendly',
    empresa_name: empresa?.nome ?? '',
    empresa_sector: '',
    language: 'pt-PT',
  };
}

// Builds slot payload for present_slots directive content (using ISO as source of truth)
function slotsToPresentBlocks(slots: any[]): any[] {
  return slots.map((s: any, i: number) => ({
    slot_number: i + 1,
    date: extractDate(s) ?? '',
    time_start: extractTimeStart(s) ?? '',
    time_end: extractTimeEnd(s) ?? '',
    display: buildSlotDisplay(s),
  }));
}

function logPresentedSlots(slots: any[]): any[] {
  const displayedSlots = slotsToPresentBlocks(slots);
  logFlow('[FLOW_DEBUG_SLOTS_PRESENTED]', {
    displayed_slots: displayedSlots,
    available_slots: slots.map((slot) => ({
      ...summarizeSlotForLog(slot),
      display: buildSlotDisplay(slot),
    })),
  });
  return displayedSlots;
}

function buildSlotsPresentationReply(
  slots: any[],
  intro: string,
  outro: string
): string {
  const displayedSlots = logPresentedSlots(slots);
  const slotLines = displayedSlots.map((slot) => `${slot.slot_number}. ${slot.display}`);
  return `${intro}\n\n${slotLines.join('\n')}\n\n${outro}`;
}

function buildOrchestrationSlotsReply(action: string, slots: any[] | null): string | null {
  if (!slots || slots.length === 0) return null;

  switch (action) {
    case 'SHOW_SLOTS':
    case 'SHOW_EXISTING_SLOTS':
      return buildSlotsPresentationReply(
        slots,
        'Tenho estes horários disponíveis para essa data:',
        'Indique o número do horário que prefere.'
      );
    case 'PROACTIVE_SLOTS':
      return buildSlotsPresentationReply(
        slots,
        'Tenho estes horários disponíveis:',
        'Indique o número do horário que prefere.'
      );
    case 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES':
      return buildSlotsPresentationReply(
        slots,
        'Não tenho disponibilidade para a data pedida. Estas são as próximas opções disponíveis:',
        'Indique o número do horário que prefere ou diga outra data.'
      );
    default:
      return null;
  }
}

function extractDecisionMissingFields(payload?: Record<string, unknown>): string[] {
  const missing = payload?.missing_fields;
  if (!Array.isArray(missing)) return [];
  return missing.filter((field): field is string => typeof field === 'string');
}

function getMissingBookingFieldLabels(
  ctx: ConversationContext,
  requirePhone: boolean,
  requireReason: boolean,
  preferredMissingFields: string[] = []
): string[] {
  const fallbackFields = [
    !ctx.customer_name ? 'customer_name' : null,
    !ctx.customer_email ? 'customer_email' : null,
    requirePhone && !ctx.customer_phone ? 'customer_phone' : null,
    requireReason && !ctx.customer_reason ? 'customer_reason' : null,
  ].filter(Boolean) as string[];

  const fields = preferredMissingFields.length > 0 ? preferredMissingFields : fallbackFields;
  const labels: Record<string, string> = {
    customer_name: 'nome completo',
    customer_email: 'email',
    customer_phone: 'telefone',
    customer_reason: 'motivo da marcação',
  };

  return Array.from(new Set(fields.map((field) => labels[field] ?? field)));
}

function buildMissingDataPrompt(fieldLabels: string[]): string {
  if (fieldLabels.length === 0) {
    return 'Para continuar, preciso de alguns dados.';
  }

  if (fieldLabels.length === 1) {
    return `Para continuar, só preciso do seu ${fieldLabels[0]}.`;
  }

  return `Para continuar, só preciso dos seguintes dados: ${fieldLabels.join(', ')}.`;
}

function summarizeSlotForLog(slot: any): Record<string, unknown> | null {
  if (!slot) return null;

  return {
    start: slot.start ?? null,
    end: slot.end ?? null,
    resource_id: slot.resource_id ?? null,
  };
}

function logFlow(prefix: string, payload: Record<string, unknown>): void {
  console.log(prefix, JSON.stringify(payload));
}

function extractExplicitPtTime(userMessage: string): string | null {
  const normalized = normalizeSignalText(userMessage).replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(?:para\s+)?(?:as|a|pelas)\s+(\d{1,2})\s*h\s*(\d{2})?\b/,
    /\b(?:para\s+)?(?:as|a|pelas)\s+(\d{1,2})[:.](\d{2})\b/,
    /\b(\d{1,2})\s*h\s*(\d{2})?\b/,
    /\b(\d{1,2})[:.](\d{2})\b/,
    /\b(?:para\s+)?(?:as|a|pelas)\s+(\d{1,2})(?:\s+horas?)?\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  return null;
}

interface InvalidExplicitTimeInput {
  raw: string;
  suggested_time: string | null;
  reason: string;
}

function buildTimeSuggestion(hour: number, minuteText: string): string | null {
  if (hour < 0 || hour > 23) return null;

  // Common PT chat typo: "19h390" normally means "19h30".
  if (minuteText.length === 3 && minuteText.endsWith('0')) {
    const inferredMinute = Number(`${minuteText[0]}${minuteText[2]}`);
    if (inferredMinute >= 0 && inferredMinute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(inferredMinute).padStart(2, '0')}`;
    }
  }

  return null;
}

function detectInvalidExplicitPtTime(userMessage: string): InvalidExplicitTimeInput | null {
  const normalized = normalizeSignalText(userMessage).replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(\d{1,2})\s*h\s*(\d{2,})\b/,
    /\b(?:para\s+)?(?:as|a|pelas)\s+(\d{1,2})\s*h\s*(\d{2,})\b/,
    /\b(\d{1,2})[:.](\d{2,})\b/,
    /\b(?:para\s+)?(?:as|a|pelas)\s+(\d{1,2})[:.](\d{2,})\b/,
    /\b(\d{1,2})\s*h\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const raw = match[0];
    const hour = Number(match[1]);
    const minuteText = match[2] ?? '00';
    const minute = Number(minuteText);

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return { raw, suggested_time: null, reason: 'invalid_hour' };
    }

    if (minuteText.length > 2 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      return {
        raw,
        suggested_time: buildTimeSuggestion(hour, minuteText),
        reason: minuteText.length > 2 ? 'malformed_minutes' : 'invalid_minutes',
      };
    }
  }

  return null;
}

function isAvailabilityQuestion(userMessage: string): boolean {
  const normalized = normalizeSignalText(userMessage);
  const availabilitySignal =
    /\b(disponibilidade|disponivel|disponiveis|vaga|vagas|horario|horarios|data|datas|agenda)\b/.test(normalized);
  const questionSignal =
    /\b(quando|tem|ha|existe|existem|que|quais|mostra|mostrar|ver|disponibilidade|vaga|vagas|horario|horarios)\b/.test(normalized);

  return availabilitySignal && questionSignal;
}

function hasRequiredCustomerDataForAvailability(
  ctx: ConversationContext,
  requirePhone: boolean,
): boolean {
  return !!ctx.service_id &&
    !!ctx.customer_name &&
    !!ctx.customer_email &&
    (!requirePhone || !!ctx.customer_phone);
}

function appendConfirmationReminder(answer: string): string {
  const reminder = 'Se estiver tudo certo, responda sim para confirmar este agendamento.';
  return answer.includes(reminder) ? answer : `${answer}\n\n${reminder}`;
}

function isPriceQuestion(userMessage: string): boolean {
  const normalized = normalizeSignalText(userMessage);
  return /\b(preco|precos|custa|custam|custo|custos|valor|valores|tarifa|eur|euro|euros|promocao|promocoes|promo)\b/.test(normalized) ||
    /\bquanto\s+(custa|custam|e|fica|vale)\b/.test(normalized) ||
    /€/.test(userMessage);
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findServiceById(services: SchedulingService[], serviceId: string | null | undefined): SchedulingService | null {
  if (!serviceId) return null;
  return services.find((service) => service.id === serviceId) ?? null;
}

function findServiceByText(services: SchedulingService[], userMessage: string, extraction: LLMExtraction): SchedulingService | null {
  const normalizedMessage = normalizeComparable([
    userMessage,
    ...(Array.isArray(extraction.service_keywords) ? extraction.service_keywords : []),
  ].join(' '));

  if (!normalizedMessage) return null;

  let best: { service: SchedulingService; score: number } | null = null;
  for (const service of services) {
    const serviceName = normalizeComparable(service.name);
    const serviceDescription = normalizeComparable(service.description);
    let score = 0;

    if (serviceName && normalizedMessage.includes(serviceName)) score += 100;
    for (const word of serviceName.split(/\s+/).filter((part) => part.length > 3)) {
      if (normalizedMessage.includes(word)) score += 30;
    }
    for (const word of serviceDescription.split(/\s+/).filter((part) => part.length > 4)) {
      if (normalizedMessage.includes(word)) score += 10;
    }

    if (score > (best?.score ?? 0)) {
      best = { service, score };
    }
  }

  return best && best.score >= 30 ? best.service : null;
}

function toMoneyNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isPromoActive(service: SchedulingService, now: Date): boolean {
  const start = service.promo_start_date ?? service.promo_start ?? null;
  const end = service.promo_end_date ?? service.promo_end ?? null;
  if (!start && !end) return true;

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (startDate && Number.isNaN(startDate.getTime())) return false;
  if (endDate && Number.isNaN(endDate.getTime())) return false;
  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
}

function formatServicePrice(amount: number, currency: string | null | undefined): string {
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, '');
  return (currency ?? 'EUR').toUpperCase() === 'EUR' ? `${formatted} €` : `${formatted} ${currency ?? 'EUR'}`;
}

function buildServicePriceAnswer(
  service: SchedulingService,
  now: Date,
  hasPendingConfirmation = false,
): string | null {
  const price = toMoneyNumber(service.price);
  const promoPrice = toMoneyNumber(service.promo_price);
  const currency = service.currency ?? 'EUR';
  const followUp = hasPendingConfirmation ? 'Quer confirmar este agendamento?' : 'Quer marcar?';

  if (price === null && promoPrice === null) return null;
  if (promoPrice !== null && isPromoActive(service, now)) {
    const original = price !== null ? ` em vez de ${formatServicePrice(price, currency)}` : '';
    return `${service.name} está em promoção por ${formatServicePrice(promoPrice, currency)}${original}. ${followUp}`;
  }
  if (price !== null) {
    return `${service.name} tem o preço de ${formatServicePrice(price, currency)}. ${followUp}`;
  }
  return null;
}

function shouldRequireReasonForRuntime(bookingConfig: Record<string, unknown> | null | undefined): boolean {
  // Legacy booking_configuration.require_reason was created with a default true, so it is not a safe opt-in signal.
  // Phase 1 keeps reason optional until explicit triage/service metadata exists.
  return bookingConfig?.require_reason_explicit === true;
}

function serviceRequiresReason(service: SchedulingService | null): boolean {
  if (!service) return false;
  if (service.requires_triage === true) return true;
  const category = normalizeComparable(service.category);
  return /\b(triage|triagem)\b/.test(category);
}

function hasSoftServiceSignal(extraction: LLMExtraction): boolean {
  return Array.isArray(extraction.service_keywords) &&
    extraction.service_keywords.some((keyword) => typeof keyword === 'string' && keyword.trim().length > 0) &&
    extraction.confidence >= 0.5;
}

function getNameTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((token) => /^\p{L}{2,}$/u.test(token));
}

function hasExplicitNameSignal(userMessage: string): boolean {
  const normalized = userMessage
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /\b(o meu nome e|meu nome e|chamo-me|chamo me|nome:|name is|my name is)\b/.test(normalized);
}

function hasPersonalDataSignal(extraction: LLMExtraction, userMessage: string): boolean {
  return !!(
    extraction.customer_email ||
    extraction.customer_phone ||
    /@/.test(userMessage) ||
    /\b(?:\+?\d[\d\s().-]{7,}\d)\b/.test(userMessage)
  );
}

function hasPlausibleNameStructure(name: string | null): boolean {
  if (!name) return false;
  if (/@|\d/.test(name)) return false;
  const tokens = getNameTokens(name);
  return tokens.length >= 2 && tokens.length <= 6;
}

function isWeakCustomerName(name: string | null): boolean {
  if (!name) return true;
  return !hasPlausibleNameStructure(name);
}

function shouldAcceptCustomerName(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string,
  requirePhone: boolean
): boolean {
  if (!extraction.customer_name) return false;
  if (!hasPlausibleNameStructure(extraction.customer_name)) return false;

  const collectingPersonalData =
    context.state === 'collecting_data' &&
    (!context.customer_name || !context.customer_email || (requirePhone && !context.customer_phone));

  const explicitName = hasExplicitNameSignal(userMessage);
  const personalDataSignal = hasPersonalDataSignal(extraction, userMessage);
  const serviceOrReasonTurn =
    context.state === 'collecting_service' ||
    (
      hasSoftServiceSignal(extraction) &&
      !explicitName &&
      !personalDataSignal
    );

  if (serviceOrReasonTurn) return false;
  return collectingPersonalData || explicitName || personalDataSignal;
}

function hasExplicitDateSignal(userMessage: string, extraction: LLMExtraction): boolean {
  if (extraction.intent === 'DATE_CHANGE') return true;
  if (typeof extraction.date_raw === 'string' && extraction.date_raw.trim().length > 0) return true;

  const normalized = userMessage
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const absoluteDatePattern = /\b\d{1,2}(?:[\/.-]\d{1,2})(?:[\/.-]\d{2,4})?\b/;
  const relativeDatePattern = /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|hoje|amanha|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo|proxima semana|semana que vem)\b/;

  return absoluteDatePattern.test(normalized) || relativeDatePattern.test(normalized);
}

function shouldKeepCurrentDateOnTimeOnlyChange(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (context.state !== 'awaiting_confirmation') return false;
  if (!extraction.time_parsed) return false;
  if (hasExplicitDateSignal(userMessage, extraction)) return false;
  return !!(context.selected_slot || context.preferred_date);
}

function normalizeSignalText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }

  return dp[a.length][b.length];
}

function formatTimeForClarification(time: string | null): string | null {
  if (!time) return null;
  const [hour, minute] = time.split(':');
  if (!hour || minute === undefined) return time;
  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

function normalizeFuzzyPtDate(
  userMessage: string,
  referenceDate: Date,
  timezone: string
): {
  changed: boolean;
  confidence: 'high' | 'uncertain' | null;
  matched_token: string | null;
  normalized_token: 'hoje' | 'amanha' | null;
  normalized_text: string;
  date_parsed: string | null;
  time_parsed: string | null;
  clarification: string | null;
} {
  const highConfidenceMap: Record<string, 'hoje' | 'amanha'> = {
    hoje: 'hoje',
    joje: 'hoje',
    jhoje: 'hoje',
    jhojas: 'hoje',
    hije: 'hoje',
    amanha: 'amanha',
    amanhã: 'amanha',
    amanah: 'amanha',
  };

  let matchedToken: string | null = null;
  let normalizedToken: 'hoje' | 'amanha' | null = null;
  let confidence: 'high' | 'uncertain' | null = null;

  for (const match of userMessage.matchAll(/\b[\p{L}]+\b/gu)) {
    const token = match[0];
    const normalized = normalizeSignalText(token).replace(/[^\p{L}]/gu, '');

    if (highConfidenceMap[normalized]) {
      matchedToken = token;
      normalizedToken = highConfidenceMap[normalized];
      confidence = 'high';
      break;
    }

    const todayDistance = editDistance(normalized, 'hoje');
    const tomorrowDistance = editDistance(normalized, 'amanha');
    if (normalized.length >= 4 && (todayDistance === 1 || tomorrowDistance === 1)) {
      matchedToken = token;
      normalizedToken = todayDistance <= tomorrowDistance ? 'hoje' : 'amanha';
      confidence = 'uncertain';
      break;
    }
  }

  if (!matchedToken || !normalizedToken || !confidence) {
    return {
      changed: false,
      confidence: null,
      matched_token: null,
      normalized_token: null,
      normalized_text: userMessage,
      date_parsed: null,
      time_parsed: null,
      clarification: null,
    };
  }

  const normalizedText = userMessage.replace(new RegExp(`\\b${matchedToken}\\b`, 'iu'), normalizedToken);
  const parsed = parseDateTime(normalizedText, referenceDate, timezone);
  const clarificationTime = formatTimeForClarification(parsed.time);
  const clarification = confidence === 'uncertain' && parsed.time
    ? `Quer dizer ${normalizedToken} às ${clarificationTime}?`
    : null;

  return {
    changed: normalizedText !== userMessage,
    confidence,
    matched_token: matchedToken,
    normalized_token: normalizedToken,
    normalized_text: normalizedText,
    date_parsed: parsed.date,
    time_parsed: parsed.time,
    clarification,
  };
}

function hasBookingContinuationSignal(userMessage: string, extraction: LLMExtraction): boolean {
  const normalized = normalizeSignalText(userMessage);
  return (
    /\b(marcar|agendar|reservar|consulta|consultar|agendamento|horario|hora|dor|sintoma|problema|motivo)\b/.test(normalized) ||
    hasSoftServiceSignal(extraction)
  );
}

function isServiceMenuSelectionState(context: ConversationContext): boolean {
  return (
    context.state === 'idle' ||
    context.state === 'collecting_service'
  ) && context.available_slots.length === 0;
}

function inferTimeRelation(
  userMessage: string,
  extraction: LLMExtraction
): Pick<LLMExtraction, 'time_operator' | 'relative_time_direction'> {
  const normalized = normalizeSignalText(userMessage);
  const hasSpecificTime = !!extraction.time_parsed;
  const saysBefore = /\b(antes|before|earlier than)\b/.test(normalized);
  const saysAfter = /\b(depois|apos|after|later than)\b/.test(normalized);
  const saysEarlier = /\b(mais cedo|earlier)\b/.test(normalized) || (!hasSpecificTime && saysBefore);
  const saysLater = /\b(mais tarde|later)\b/.test(normalized) || (!hasSpecificTime && saysAfter);

  return {
    time_operator: hasSpecificTime
      ? 'exact'
      : (extraction.time_operator ?? null),
    relative_time_direction: hasSpecificTime
      ? null
      : extraction.relative_time_direction ?? (saysEarlier ? 'earlier' : saysLater ? 'later' : null),
  };
}

function parseNumericMenuSelection(input: string): number | null {
  const match = normalizeSignalText(input).trim().match(/^(?:opcao\s*)?(\d{1,2})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function resolveNumericServiceSelection(
  input: string,
  services: SchedulingService[]
): SchedulingService | null {
  const selectedNumber = parseNumericMenuSelection(input);
  if (selectedNumber === null) return null;
  const index = selectedNumber - 1;
  return index >= 0 && index < services.length ? services[index] : null;
}

function isExplicitServiceChangeRequest(
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (extraction.confirmation === 'CHANGE_SERVICE') return true;
  const normalized = normalizeSignalText(userMessage);
  return /\b(mudar|alterar|trocar|corrigir|change|switch)\b.*\b(servico|servicos|service)\b/.test(normalized) ||
    /\b(outro|outra|different)\b.*\b(servico|servicos|service)\b/.test(normalized);
}

function isServiceLockedForState(context: ConversationContext): boolean {
  return !!context.service_locked && SERVICE_LOCK_GUARDED_STATES.has(context.state);
}

function hasCompletedBookingMutationSignal(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (context.state !== 'completed') return false;
  if (!context.execution_id && !context.agendamento_id && !context.confirmed_snapshot) return false;

  if (
    extraction.intent === 'BOOKING_NEW' ||
    extraction.intent === 'RESCHEDULE' ||
    extraction.intent === 'DATE_CHANGE' ||
    extraction.intent === 'CORRECTION'
  ) {
    return true;
  }

  if (extraction.date_parsed || extraction.time_parsed || extraction.relative_time_direction) return true;

  const normalized = normalizeSignalText(userMessage);
  return /\b(alias|afinal|antes|depois|alterar|mudar|trocar|remarcar|reagendar|reschedule|change|instead|earlier|later)\b/.test(normalized);
}

function shouldResetExecutionForSelectedSlot(context: ConversationContext): boolean {
  if (!context.execution_id) return false;
  if (!context.agendamento_id && !context.confirmed_snapshot) return false;
  if (!context.selected_slot?.start) return false;

  const confirmedStart = context.confirmed_snapshot?.start ?? null;
  return !confirmedStart || confirmedStart !== context.selected_slot.start;
}

function logSlotSelectionDebug(
  selectedIndex: number | null,
  selectedSlotStart: string | null,
  availableSlotsCount: number
): void {
  logFlow('[FLOW_DEBUG]', {
    selected_index: selectedIndex,
    selected_slot_start: selectedSlotStart,
    available_slots_count: availableSlotsCount,
  });
}

function logTimeMatchDebug(
  timeParsed: string | null,
  matchedSlotStart: string | null,
  matchType: 'exact' | 'closest' | 'fallback',
  availableSlotsCount: number
): void {
  logFlow('[FLOW_DEBUG_TIME_MATCH]', {
    time_parsed: timeParsed,
    matched_slot_start: matchedSlotStart,
    match_type: matchType,
    available_slots_count: availableSlotsCount,
  });
}

function logTimeOperatorDebug(
  userMessage: string,
  extraction: LLMExtraction,
  matchedSlotStart: string | null,
  matchStrategy: string
): void {
  logFlow('[FLOW_DEBUG_TIME_OPERATOR]', {
    raw_user_text: userMessage,
    time_parsed: extraction.time_parsed ?? null,
    time_operator: extraction.time_operator ?? null,
    relative_time_direction: extraction.relative_time_direction ?? null,
    matched_slot_start: matchedSlotStart,
    match_strategy: matchStrategy,
  });
}

function buildSlotSelectionUpdates(
  context: ConversationContext,
  selectedSlot: SlotSuggestion,
  state: ConversationContext['state'],
  currentIntent: ConversationContext['current_intent'] = 'SLOT_SELECTION'
): Partial<ConversationContext> {
  const updates: Partial<ConversationContext> = {
    available_slots: context.available_slots,
    selected_slot: selectedSlot,
    preferred_date: extractDate(selectedSlot),
    preferred_time: extractTimeStart(selectedSlot),
    slots_generated_for_date: context.slots_generated_for_date,
    current_intent: currentIntent,
    state,
  };

  if (context.reschedule_from_agendamento_id) {
    updates.reschedule_new_slot = selectedSlot;
    updates.reschedule_new_date = extractDate(selectedSlot);
    updates.reschedule_new_time = extractTimeStart(selectedSlot);
  }

  return updates;
}

function logSelectedSlotPersisted(
  conversationId: string,
  context: ConversationContext,
  selectedSlot: SlotSuggestion
): void {
  logFlow('[FLOW_SELECTED_SLOT_PERSISTED]', {
    conversation_id: conversationId,
    selected_slot_start: selectedSlot.start ?? null,
    selected_slot_end: selectedSlot.end ?? null,
    selected_slot_resource_id: selectedSlot.resource_id ?? null,
    state_after_persist: context.state ?? null,
    available_slots_count: context.available_slots?.length ?? 0,
  });
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let empresaId = '';
  let conversationId = '';

  try {
    const body = await req.json();
    conversationId = body.conversation_id;
    const userMessage = body.message?.trim();

    if (!conversationId || !userMessage) {
      return new Response(JSON.stringify({ error: 'Missing conversation_id or message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const db = getServiceClient();

    // -------------------------------------------------------------------------
    // 1. Load conversation + empresa + agent + booking config
    // -------------------------------------------------------------------------
    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, empresa_id, status, owner, conversation_context, context_version')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    empresaId = conversation.empresa_id;

    if (conversation.owner !== 'ai' || conversation.status === 'closed' || conversation.status === 'completed') {
      return new Response(JSON.stringify({ reply: null, blocked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: empresa } = await db
      .from('empresas')
      .select('id, nome, fuso_horario, chat_ai_provider, chat_ai_model, chat_ai_real_enabled')
      .eq('id', empresaId)
      .single();

    const { data: agent } = await db
      .from('agentes')
      .select('id, nome, prompt_base, regras, welcome_message, response_delay_ms, response_style')
      .eq('empresa_id', empresaId)
      .eq('is_default_chat_agent', true)
      .eq('status', 'ativo')
      .single();

    const { data: bookingConfig } = await db
      .from('booking_configuration')
      .select('require_name, require_email, require_phone, require_reason, allow_same_day_booking, allow_outside_business_hours, minimum_advance_minutes, fallback_service_id')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    const requirePhone = true;
    const companyRequiresReason = shouldRequireReasonForRuntime(bookingConfig as Record<string, unknown> | null);
    let requireReason = companyRequiresReason;

    const agentId = agent?.id ?? '';
    const agentPrompt = `${agent?.prompt_base ?? ''}\n${agent?.regras ?? ''}`.trim();
    const timezone = empresa?.fuso_horario ?? 'Europe/Lisbon';
    const agentCtx = buildAgentCtx(agent, empresa, agentPrompt);

    // -------------------------------------------------------------------------
    // 2. Credits gate
    // -------------------------------------------------------------------------
    const creditCheck = await checkCredits(empresaId, 'message');
    if (!creditCheck.allowed) {
      return new Response(JSON.stringify({
        reply: 'De momento não é possível continuar. Por favor contacte-nos diretamente.',
        blocked: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // 3. Load context + persist user message
    // -------------------------------------------------------------------------
    const context = await getContext(conversationId);
    const currentVersion = context.context_version;

    logFlow('[FLOW_CONTEXT]', {
      stage: 'loaded',
      conversation_id: conversationId,
      state: context.state ?? null,
      current_intent: context.current_intent ?? null,
      service_id: context.service_id ?? null,
      service_source: context.service_source ?? null,
      service_locked: context.service_locked ?? false,
      preferred_date: context.preferred_date ?? null,
      selected_slot: summarizeSlotForLog(context.selected_slot),
      customer_name: context.customer_name ?? null,
      customer_email: context.customer_email ?? null,
    });

    await db.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'client',
      content: userMessage,
    });

    const invalidExplicitTime = detectInvalidExplicitPtTime(userMessage);
    if (invalidExplicitTime) {
      const reply = invalidExplicitTime.suggested_time
        ? `Quis dizer ${invalidExplicitTime.suggested_time}?`
        : 'Não consegui perceber o horário. Indique um horário válido, por exemplo 17h30 ou 17:30.';

      logFlow('[FLOW_INVALID_TIME_INPUT]', {
        conversation_id: conversationId,
        state: context.state ?? null,
        raw_user_text: userMessage,
        raw_time: invalidExplicitTime.raw,
        suggested_time: invalidExplicitTime.suggested_time,
        reason: invalidExplicitTime.reason,
      });

      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        content: reply,
      });

      await consumeCredits(empresaId, 'message', conversationId);

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -------------------------------------------------------------------------
    // 4. Single LLM extraction call (intent + entities + emotion)
    // -------------------------------------------------------------------------
    let extraction: any;
    try {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
      const extractionUserMessage = `[TODAY IS ${todayStr}]\n\n${userMessage}`;
      const llmRaw = await callLLMSimple(EXTRACTION_SYSTEM_PROMPT, extractionUserMessage, empresaId, 'json');
      extraction = parseExtractionResponse(llmRaw);
    } catch {
      extraction = parseExtractionResponse('');
    }
    extraction = normalizeExtraction(extraction);
    const explicitTime = extractExplicitPtTime(userMessage);
    if (explicitTime) {
      extraction = {
        ...extraction,
        time_raw: explicitTime,
        time_parsed: explicitTime,
        time_operator: 'exact',
        relative_time_direction: null,
        intent: context.state === 'completed' && (context.agendamento_id || context.confirmed_snapshot)
          ? 'RESCHEDULE'
          : extraction.intent,
        confidence: Math.max(extraction.confidence ?? 0, 0.9),
      };
    }
    const dateNormalization = normalizeFuzzyPtDate(userMessage, new Date(), timezone);
    let dateNormalizerClarification: string | null = null;
    if (dateNormalization.confidence) {
      logFlow('[FLOW_DATE_NORMALIZER]', {
        conversation_id: conversationId,
        raw_user_text: userMessage,
        matched_token: dateNormalization.matched_token,
        normalized_token: dateNormalization.normalized_token,
        confidence: dateNormalization.confidence,
        date_parsed: dateNormalization.date_parsed,
        time_parsed: dateNormalization.time_parsed,
      });

      if (dateNormalization.confidence === 'high') {
        extraction = {
          ...extraction,
          date_raw: extraction.date_raw ?? dateNormalization.matched_token,
          time_raw: extraction.time_raw ?? dateNormalization.time_parsed,
          date_parsed: extraction.date_parsed ?? dateNormalization.date_parsed,
          time_parsed: extraction.time_parsed ?? dateNormalization.time_parsed,
          intent: extraction.intent === 'INFO_REQUEST' ? 'BOOKING_NEW' : extraction.intent,
          confidence: Math.max(extraction.confidence ?? 0, 0.85),
        };
      } else if (dateNormalization.clarification) {
        dateNormalizerClarification = dateNormalization.clarification;
      }
    }
    const inferredTimeRelation = inferTimeRelation(userMessage, extraction);
    extraction = {
      ...extraction,
      time_operator: inferredTimeRelation.time_operator,
      relative_time_direction: inferredTimeRelation.relative_time_direction,
    };
    const originalIntent = extraction.intent;
    if (
      ACTIVE_BOOKING_STATES.has(context.state) &&
      extraction.intent === 'INFO_REQUEST' &&
      hasBookingContinuationSignal(userMessage, extraction)
    ) {
      extraction = {
        ...extraction,
        intent: 'BOOKING_NEW',
      };
    }
    if (
      (extraction.time_parsed || extraction.relative_time_direction) &&
      (
        ACTIVE_BOOKING_STATES.has(context.state) ||
        (context.state !== 'completed' && context.available_slots.length > 0) ||
        extraction.intent === 'SLOT_SELECTION'
      )
    ) {
      extraction = {
        ...extraction,
        intent: 'TIME_BASED_SELECTION',
      };
    }
    logFlow('[FLOW_EXTRACTION]', {
      conversation_id: conversationId,
      intent: extraction.intent ?? null,
      original_intent: originalIntent ?? null,
      confirmation: extraction.confirmation ?? null,
      date_parsed: extraction.date_parsed ?? null,
      time_parsed: extraction.time_parsed ?? null,
      time_operator: extraction.time_operator ?? null,
      relative_time_direction: extraction.relative_time_direction ?? null,
      service_keywords: Array.isArray(extraction.service_keywords) ? extraction.service_keywords : [],
      confidence: extraction.confidence ?? null,
    });
    const fieldValidations = validateExtraction(extraction);

    // -------------------------------------------------------------------------
    // 5. Emotion (deterministic first, LLM fallback)
    // -------------------------------------------------------------------------
    let emotionalContext: any = null;
    const lowerMsg = userMessage.toLowerCase();
    for (const [tone, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      const found = (keywords as readonly string[]).filter((kw) => lowerMsg.includes(kw));
      if (found.length > 0) {
        emotionalContext = { tone, keywords: found, detected_by: 'deterministic' };
        break;
      }
    }
    if (!emotionalContext && extraction.emotional_context) {
      emotionalContext = { ...extraction.emotional_context, detected_by: 'llm' };
    }

    let intent = extraction.intent;
    const keepCurrentDateOnTimeOnlyChange = shouldKeepCurrentDateOnTimeOnlyChange(context, extraction, userMessage);

    // -------------------------------------------------------------------------
    // 6. Accumulate extraction into context (never overwrite valid data with null)
    // -------------------------------------------------------------------------
    const extractionUpdates: Partial<ConversationContext> = {
      current_intent: intent as any,
    };

    if (extraction.customer_name) {
      const v = fieldValidations.find((x) => x.field === 'customer_name');
      const canAcceptName = shouldAcceptCustomerName(context, extraction, userMessage, requirePhone);
      const shouldReplaceWeakName =
        !!context.customer_name &&
        isWeakCustomerName(context.customer_name) &&
        canAcceptName;

      if (v?.status === 'valid' && (!context.customer_name || shouldReplaceWeakName) && canAcceptName) {
        extractionUpdates.customer_name = extraction.customer_name;
      }
    }
    if (extraction.customer_email) {
      const v = fieldValidations.find((x) => x.field === 'customer_email');
      if (v?.status === 'valid' && !context.customer_email) {
        extractionUpdates.customer_email = extraction.customer_email;
      }
    }
    if (extraction.customer_phone) {
      const v = fieldValidations.find((x) => x.field === 'customer_phone');
      if (v?.status === 'valid' && !context.customer_phone) {
        extractionUpdates.customer_phone = extraction.customer_phone;
      }
    }
    if (extraction.date_parsed && !keepCurrentDateOnTimeOnlyChange) {
      const v = fieldValidations.find((x) => x.field === 'date_parsed');
      if (v?.status === 'valid') {
        extractionUpdates.preferred_date = extraction.date_parsed;
      } else if (v?.status !== 'invalid') {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
        if (extraction.date_parsed >= today) {
          extractionUpdates.preferred_date = extraction.date_parsed;
        }
      }
    }
    if (extraction.time_parsed) {
      extractionUpdates.preferred_time = extraction.time_parsed;
    }
    // Save customer_reason if not already stored (helps service resolution later)
    if (
      !context.customer_reason &&
      userMessage.length > 5 &&
      (intent !== 'INFO_REQUEST' || context.state === 'collecting_service' || hasSoftServiceSignal(extraction))
    ) {
      extractionUpdates.customer_reason = userMessage.trim();
    }

    let updatedContext = await updateContext(conversationId, extractionUpdates, currentVersion);

    if (hasCompletedBookingMutationSignal(updatedContext, extraction, userMessage)) {
      const previousState = updatedContext.state ?? null;
      const previousExecutionId = updatedContext.execution_id ?? null;
      const previousSelectedSlotStart = updatedContext.selected_slot?.start ?? null;
      const previousAgendamentoId =
        updatedContext.agendamento_id ?? updatedContext.confirmed_snapshot?.agendamento_id ?? null;
      const shouldRescheduleExistingBooking = !!previousAgendamentoId;

      updatedContext = await updateContext(conversationId, {
        state: 'collecting_data',
        current_intent: shouldRescheduleExistingBooking ? 'RESCHEDULE' : 'BOOKING_NEW',
        execution_id: null,
        booking_lifecycle_id: null,
        selected_slot: null,
        available_slots: [],
        slots_page: 0,
        slots_generated_for_date: null,
        preferred_date: extraction.date_parsed ?? updatedContext.preferred_date ?? updatedContext.confirmed_snapshot?.start.slice(0, 10) ?? null,
        preferred_time: extraction.time_parsed ?? updatedContext.preferred_time ?? null,
        reschedule_from_agendamento_id: previousAgendamentoId,
        reschedule_new_date: null,
        reschedule_new_time: null,
        reschedule_new_slot: null,
        error_context: resetErrorCount(updatedContext.error_context),
      }, updatedContext.context_version);

      logFlow('[FLOW_DEBUG_EXECUTION_REUSE]', {
        current_state: previousState,
        current_execution_id: previousExecutionId,
        selected_slot_start: previousSelectedSlotStart,
        agendamento_id_in_context: previousAgendamentoId,
        execution_id_was_reset: true,
        source_branch: shouldRescheduleExistingBooking
          ? 'post_completed_reschedule_reset'
          : 'post_completed_change_reset',
      });

      if (shouldRescheduleExistingBooking) {
        logFlow('[FLOW_RESCHEDULE_REQUEST_DETECTED]', {
          conversation_id: conversationId,
          previous_state: previousState,
          agendamento_id: previousAgendamentoId,
          requested_date: extraction.date_parsed ?? null,
          requested_time: extraction.time_parsed ?? null,
          source: 'post_completed_change',
        });
      }
    }

    let servicesCache: SchedulingService[] | null = null;
    let menuServicesCache: SchedulingService[] | null = null;
    const getServices = async () => {
      servicesCache ??= await loadServices(empresaId);
      return servicesCache;
    };
    const getMenuServices = async () => {
      menuServicesCache ??= await loadMenuServices(empresaId);
      return menuServicesCache;
    };

    if (updatedContext.service_id) {
      const currentService = findServiceById(await getServices(), updatedContext.service_id);
      requireReason = companyRequiresReason || serviceRequiresReason(currentService);
    }

    const explicitServiceChange = isExplicitServiceChangeRequest(extraction, userMessage);
    let serviceChangedThisTurn = false;
    const shouldCheckServiceChange =
      ACTIVE_BOOKING_STATES.has(updatedContext.state) &&
      (!!updatedContext.service_id || updatedContext.service_locked) &&
      intent !== 'HUMAN_REQUEST' &&
      (explicitServiceChange || hasBookingContinuationSignal(userMessage, extraction));

    if (shouldCheckServiceChange) {
      const services = await getServices();
      const combinedInput = [
        userMessage,
        Array.isArray(extraction.service_keywords) ? extraction.service_keywords.join(' ') : '',
      ].filter(Boolean).join(' ').trim();
      const serviceResult = await resolveService(combinedInput, empresaId, services);
      const isDifferentService =
        !!serviceResult.service_id &&
        serviceResult.service_id !== updatedContext.service_id;

      if (isDifferentService) {
        const oldServiceId = updatedContext.service_id ?? null;
        const oldServiceName = updatedContext.service_name ?? null;
        updatedContext = await updateContext(conversationId, {
          service_id: serviceResult.service_id,
          service_name: serviceResult.service_name,
          service_source: 'explicit_service_change',
          service_locked: true,
          selected_slot: null,
          available_slots: [],
          slots_page: 0,
          slots_generated_for_date: null,
          state: 'collecting_data',
        }, updatedContext.context_version);

        extraction = {
          ...extraction,
          service_id: serviceResult.service_id,
          service_keywords: serviceResult.service_name ? [serviceResult.service_name] : extraction.service_keywords,
          intent: 'BOOKING_NEW',
        };
        intent = extraction.intent;
        serviceChangedThisTurn = true;
        requireReason = companyRequiresReason ||
          serviceRequiresReason(findServiceById(services, serviceResult.service_id));

        logFlow('[FLOW_SERVICE_CHANGE]', {
          conversation_id: conversationId,
          old_service_name: oldServiceName,
          new_service_name: serviceResult.service_name,
        });
        logFlow('[FLOW_DEBUG_SERVICE_LOCK]', {
          previous_service_id: oldServiceId,
          new_service_id: serviceResult.service_id,
          service_locked: true,
          source: 'explicit_service_change',
          overwrite_prevented: false,
        });
      } else if (updatedContext.service_locked && explicitServiceChange && !serviceResult.service_id) {
        const previousServiceId = updatedContext.service_id ?? null;
        updatedContext = await updateContext(conversationId, {
          service_id: null,
          service_name: null,
          service_source: null,
          service_locked: false,
          selected_slot: null,
          available_slots: [],
          slots_page: 0,
          slots_generated_for_date: null,
          state: 'collecting_service',
        }, updatedContext.context_version);

        logFlow('[FLOW_DEBUG_SERVICE_LOCK]', {
          previous_service_id: previousServiceId,
          new_service_id: null,
          service_locked: false,
          source: 'explicit_service_change',
          overwrite_prevented: false,
        });
      }
    }

    if (
      !serviceChangedThisTurn &&
      isServiceLockedForState(updatedContext) &&
      (hasSoftServiceSignal(extraction) || extraction.service_id)
    ) {
      logFlow('[FLOW_DEBUG_SERVICE_LOCK]', {
        previous_service_id: updatedContext.service_id ?? null,
        new_service_id: extraction.service_id ?? null,
        service_locked: true,
        source: updatedContext.service_source ?? 'unknown',
        overwrite_prevented: true,
      });
    }

    logFlow('[FLOW_CONTEXT]', {
      stage: 'after_initial_update',
      conversation_id: conversationId,
      state: updatedContext.state ?? null,
      current_intent: updatedContext.current_intent ?? null,
      service_id: updatedContext.service_id ?? null,
      service_source: updatedContext.service_source ?? null,
      service_locked: updatedContext.service_locked ?? false,
      customer_name: updatedContext.customer_name ?? null,
      customer_email: updatedContext.customer_email ?? null,
      preferred_date: updatedContext.preferred_date ?? null,
    });

    let decision = decideNextAction({
      context: updatedContext,
      extraction,
      userMessage,
      config: {
        requirePhone,
        requireReason,
        allowSameDayBooking: bookingConfig?.allow_same_day_booking,
        minimumAdvanceMinutes: bookingConfig?.minimum_advance_minutes,
      },
    });

    logFlow('[FLOW_DECISION]', {
      stage: 'initial',
      conversation_id: conversationId,
      action: decision.action,
      proposed_state: decision.proposed_state,
      confidence: decision.confidence,
      reason: decision.reason,
    });

    // -------------------------------------------------------------------------
    // 7. Resolve service deterministically — combine message + reason + keywords
    //    BUG FIX #2: resolveService now receives combined input, not just userMessage
    // -------------------------------------------------------------------------
    const numericMenuIndex = parseNumericMenuSelection(userMessage);
    if (
      numericMenuIndex !== null &&
      isServiceMenuSelectionState(updatedContext) &&
      intent !== 'HUMAN_REQUEST'
    ) {
      const menuServices = await getMenuServices();
      const numericService = resolveNumericServiceSelection(userMessage, menuServices);
      const displayedServicesOrder = menuServices.map((service, index) => ({
        menu_index: index + 1,
        service_id: service.id,
        service_name: service.name,
      }));

      logFlow('[FLOW_SERVICE_MENU_SELECTION]', {
        conversation_id: conversationId,
        menu_index: numericMenuIndex,
        selected_service_id: numericService?.id ?? null,
        selected_service_name: numericService?.name ?? null,
        displayed_services_order: displayedServicesOrder,
      });

      if (numericService) {
        const previousServiceId = updatedContext.service_id ?? null;
        updatedContext = await updateContext(conversationId, {
          service_id: numericService.id,
          service_name: numericService.name,
          service_source: 'menu_numeric_selection',
          service_locked: true,
          selected_slot: null,
          available_slots: [],
          slots_page: 0,
          slots_generated_for_date: null,
        }, updatedContext.context_version);

        extraction = {
          ...extraction,
          service_id: numericService.id,
          service_keywords: [numericService.name],
          intent: 'BOOKING_NEW',
        };
        intent = extraction.intent;
        requireReason = companyRequiresReason || serviceRequiresReason(numericService);

        logFlow('[FLOW_DEBUG_SERVICE_LOCK]', {
          previous_service_id: previousServiceId,
          new_service_id: numericService.id,
          service_locked: true,
          source: 'menu_numeric_selection',
          overwrite_prevented: false,
        });

        decision = decideNextAction({
          context: updatedContext,
          extraction,
          userMessage,
          config: {
            requirePhone,
            requireReason,
            allowSameDayBooking: bookingConfig?.allow_same_day_booking,
            minimumAdvanceMinutes: bookingConfig?.minimum_advance_minutes,
          },
        });

        logFlow('[FLOW_DECISION]', {
          stage: 'post_service_menu_selection',
          conversation_id: conversationId,
          action: decision.action,
          proposed_state: decision.proposed_state,
          confidence: decision.confidence,
          reason: decision.reason,
        });
      }
    }

    if (
      numericMenuIndex === null &&
      !updatedContext.service_id &&
      !isServiceLockedForState(updatedContext) &&
      intent !== 'HUMAN_REQUEST' &&
      (
        decision.action === 'ASK_SERVICE' ||
        updatedContext.state === 'collecting_service' ||
        hasSoftServiceSignal(extraction)
      )
    ) {
      const services = await getServices();
      const numericService = updatedContext.state === 'collecting_service'
        ? resolveNumericServiceSelection(userMessage, services)
        : null;

      if (numericService) {
        const previousServiceId = updatedContext.service_id ?? null;
        updatedContext = await updateContext(conversationId, {
          service_id: numericService.id,
          service_name: numericService.name,
          service_source: 'menu_numeric_selection',
          service_locked: true,
        }, updatedContext.context_version);
        requireReason = companyRequiresReason || serviceRequiresReason(numericService);

        logFlow('[FLOW_DEBUG_SERVICE_LOCK]', {
          previous_service_id: previousServiceId,
          new_service_id: numericService.id,
          service_locked: true,
          source: 'menu_numeric_selection',
          overwrite_prevented: false,
        });

        decision = decideNextAction({
          context: updatedContext,
          extraction,
          userMessage,
          config: {
            requirePhone,
            requireReason,
            allowSameDayBooking: bookingConfig?.allow_same_day_booking,
            minimumAdvanceMinutes: bookingConfig?.minimum_advance_minutes,
          },
        });

        logFlow('[FLOW_DECISION]', {
          stage: 'post_service_menu_selection',
          conversation_id: conversationId,
          action: decision.action,
          proposed_state: decision.proposed_state,
          confidence: decision.confidence,
          reason: decision.reason,
        });
      } else {
        const combinedInput = [
          userMessage,
          updatedContext.customer_reason,
          Array.isArray(extraction.service_keywords) ? extraction.service_keywords.join(' ') : '',
        ].filter(Boolean).join(' ').trim();

        const serviceResult = await resolveService(combinedInput, empresaId, services);
        logFlow('[FLOW_SERVICE]', {
          conversation_id: conversationId,
          service_id: serviceResult?.service_id ?? null,
          service_name: serviceResult?.service_name ?? null,
          confidence: serviceResult?.confidence ?? null,
          method: serviceResult?.method ?? null,
        });

        if (serviceResult?.service_id) {
          requireReason = companyRequiresReason ||
            serviceRequiresReason(findServiceById(services, serviceResult.service_id));

          updatedContext = await updateContext(conversationId, {
            service_id: serviceResult.service_id,
            service_name: serviceResult.service_name,
            service_source: serviceResult.method,
            service_locked: false,
          }, updatedContext.context_version);

          decision = decideNextAction({
            context: updatedContext,
            extraction,
            userMessage,
            config: {
              requirePhone,
              requireReason,
              allowSameDayBooking: bookingConfig?.allow_same_day_booking,
              minimumAdvanceMinutes: bookingConfig?.minimum_advance_minutes,
            },
          });

          logFlow('[FLOW_DECISION]', {
            stage: 'post_service_resolution',
            conversation_id: conversationId,
            action: decision.action,
            proposed_state: decision.proposed_state,
            confidence: decision.confidence,
            reason: decision.reason,
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. Immediate handoff paths (before main routing)
    // -------------------------------------------------------------------------
    if (decision.action === 'HANDOFF') {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'HANDOFF',
        source: 'decision',
        state: updatedContext.state ?? null,
      });

      const isExplicitHumanRequest = intent === 'HUMAN_REQUEST';
      const handoffReason = isExplicitHumanRequest
        ? 'Decision engine: user requested human'
        : `Decision engine: ${decision.reason}`;
      const reply = isExplicitHumanRequest
        ? 'Vou transferir para um operador humano agora. Um momento, por favor.'
        : 'PeÃ§o desculpa pelas dificuldades. Vou transferir para um operador humano que pode ajudar melhor.';

      await triggerHandoff(conversationId, empresaId, updatedContext, handoffReason);
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (intent === 'HUMAN_REQUEST' && !ACTIVE_BOOKING_STATES.has(updatedContext.state)) {
      await triggerHandoff(conversationId, empresaId, updatedContext, 'User requested human');
      const reply = 'Vou transferir para um operador humano agora. Um momento, por favor.';
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const errorState = updatedContext.error_context;
    if (errorState && errorState.consecutive_errors >= HANDOFF_RULES.system_error_threshold) {
      await triggerHandoff(conversationId, empresaId, updatedContext, 'Auto handoff: system errors threshold');
      const reply = 'Peço desculpa pelas dificuldades. Vou transferir para um operador humano que pode ajudar melhor.';
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (dateNormalizerClarification) {
      const reply = dateNormalizerClarification;
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -------------------------------------------------------------------------
    // 9. MAIN ROUTING
    //    BUG FIX #1: ALL routing uses updatedContext.state, NEVER context.state
    //    BUG FIX #4: collecting_service has ONE branch only
    // -------------------------------------------------------------------------
    let reply = '';
    const isActiveBookingState = ACTIVE_BOOKING_STATES.has(updatedContext.state);
    const allowLegacyIntentRouting = !isActiveBookingState;
    const decisionActionSupported = SUPPORTED_DECISION_ACTIONS.has(decision.action);
    const isDecisionBookingAction = BOOKING_FLOW_DECISION_ACTIONS.has(decision.action);

    const processTimeBasedSlotSearch = async (source: 'decision' | 'legacy_state') => {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'SLOT_SEARCH_BY_TIME',
        source,
        state: updatedContext.state ?? null,
      });

      const availableSlotsCount = updatedContext.available_slots.length;
      const requestedTime = extraction.time_parsed ?? '';
      const currentSlotForRelation = updatedContext.selected_slot ??
        (updatedContext.confirmed_snapshot
          ? {
            start: updatedContext.confirmed_snapshot.start,
            end: updatedContext.confirmed_snapshot.end,
            resource_id: updatedContext.confirmed_snapshot.resource_id,
          } as SlotSuggestion
          : null);
      const match = findClosestSlot(requestedTime, updatedContext.available_slots, {
        time_operator: extraction.time_operator,
        relative_time_direction: extraction.relative_time_direction,
        current_slot: currentSlotForRelation,
      });
      const matchedSlot = match.slot;
      logTimeMatchDebug(
        requestedTime || null,
        matchedSlot?.start ?? null,
        match.match_type,
        availableSlotsCount
      );
      logTimeOperatorDebug(userMessage, extraction, matchedSlot?.start ?? null, match.match_strategy);

      if (matchedSlot && (match.match_type === 'exact' || match.match_type === 'closest')) {
        const missingFieldLabels = getMissingBookingFieldLabels(
          updatedContext,
          requirePhone,
          requireReason
        );
        const isExact = match.match_type === 'exact';
        const matchedTime = extractTimeStart(matchedSlot) ?? buildSlotDisplay(matchedSlot);
        const closestPrefix = isExact
          ? null
          : match.match_strategy === 'before'
            ? `Para antes das ${requestedTime}, tenho as ${matchedTime}. Pode ser?`
            : match.match_strategy === 'after'
              ? `Para depois das ${requestedTime}, tenho as ${matchedTime}. Pode ser?`
              : match.match_strategy === 'relative_earlier'
                ? `Tenho uma opção mais cedo às ${matchedTime}. Pode ser?`
                : match.match_strategy === 'relative_later'
                  ? `Tenho uma opção mais tarde às ${matchedTime}. Pode ser?`
                  : `Não temos exatamente às ${requestedTime}, mas temos às ${matchedTime}. Pode ser?`;

        if (missingFieldLabels.length > 0) {
          updatedContext = await updateContext(
            conversationId,
            buildSlotSelectionUpdates(updatedContext, matchedSlot, 'collecting_data', 'TIME_BASED_SELECTION'),
            updatedContext.context_version
          );

          const dataPrompt = buildMissingDataPrompt(missingFieldLabels);
          reply = closestPrefix ? `${closestPrefix}\n\n${dataPrompt}` : dataPrompt;
          return;
        }

        updatedContext = await updateContext(
          conversationId,
          buildSlotSelectionUpdates(updatedContext, matchedSlot, 'awaiting_confirmation', 'TIME_BASED_SELECTION'),
          updatedContext.context_version
        );
        logSelectedSlotPersisted(conversationId, updatedContext, matchedSlot);

        reply = isExact
          ? HARDCODED_TEMPLATES.awaiting_confirmation(buildConfirmedSnapshot(updatedContext, matchedSlot))
          : closestPrefix!;
        return;
      }

      const orderedSlots = match.ordered_slots.length > 0
        ? match.ordered_slots
        : updatedContext.available_slots;
      updatedContext = await updateContext(conversationId, {
        available_slots: orderedSlots,
        selected_slot: null,
        reschedule_new_slot: null,
        state: 'awaiting_slot_selection',
      }, updatedContext.context_version);

      const fallbackIntro = match.match_strategy === 'before'
        ? `Não encontrei horário disponível antes das ${requestedTime}. Estes são os horários mais próximos:`
        : match.match_strategy === 'after'
          ? `Não encontrei horário disponível depois das ${requestedTime}. Estes são os horários mais próximos:`
          : match.match_strategy === 'relative_earlier'
            ? 'Não encontrei uma opção mais cedo. Estes são os horários mais próximos:'
            : match.match_strategy === 'relative_later'
              ? 'Não encontrei uma opção mais tarde. Estes são os horários mais próximos:'
              : `Não encontrei um horário próximo de ${requestedTime}. Estes são os horários mais próximos:`;

      reply = buildSlotsPresentationReply(
        updatedContext.available_slots,
        fallbackIntro,
        'Indique o número do horário que prefere.'
      );
    };

    const processRescheduleBooking = async (source: 'decision' | 'legacy_confirmation') => {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'EXECUTE_RESCHEDULE',
        source,
        state: updatedContext.state ?? null,
      });

      if (!updatedContext.selected_slot) {
        reply = 'Para remarcar, preciso que escolha primeiro o novo horário.';
        return;
      }

      const creditReschedule = await checkCredits(empresaId, 'booking_reschedule');
      if (!creditReschedule.allowed) {
        reply = 'Não foi possível remarcar o agendamento: créditos insuficientes.';
        return;
      }

      if (!updatedContext.reschedule_new_slot) {
        updatedContext = await updateContext(conversationId, {
          reschedule_new_slot: updatedContext.selected_slot,
          reschedule_new_date: extractDate(updatedContext.selected_slot),
          reschedule_new_time: extractTimeStart(updatedContext.selected_slot),
        }, updatedContext.context_version);
      }

      const result = await executeReschedule(updatedContext, empresaId, agentId, conversationId);
      if (result.success) {
        const confirmedSlot = updatedContext.selected_slot!;
        const snapshot = {
          service_id: updatedContext.service_id!,
          service_name: updatedContext.service_name!,
          start: confirmedSlot.start,
          end: confirmedSlot.end,
          resource_id: confirmedSlot.resource_id,
          customer_name: updatedContext.customer_name!,
          customer_email: updatedContext.customer_email!,
          customer_phone: updatedContext.customer_phone ?? null,
          agendamento_id: result.agendamento_id,
        };

        updatedContext = await updateContext(conversationId, {
          state: 'completed',
          agendamento_id: result.agendamento_id,
          confirmed_snapshot: snapshot,
          reschedule_from_agendamento_id: null,
          reschedule_new_date: null,
          reschedule_new_time: null,
          reschedule_new_slot: null,
          error_context: resetErrorCount(updatedContext.error_context),
        }, updatedContext.context_version);

        logFlow('[FLOW_RESCHEDULE_SUCCESS]', {
          conversation_id: conversationId,
          original_agendamento_id: updatedContext.agendamento_id ?? result.agendamento_id,
          new_agendamento_id: result.agendamento_id,
          new_slot_start: confirmedSlot.start,
          new_slot_resource_id: confirmedSlot.resource_id ?? null,
        });

        reply = HARDCODED_TEMPLATES.booking_confirmed(buildConfirmedSnapshot(updatedContext));
        return;
      }

      if (result.error_code === 'SLOT_CONFLICT') {
        const { updatedErrorState } = handleSystemError(
          updatedContext.error_context,
          'slot_conflict',
          true,
        );
        const conflictedSlot = updatedContext.selected_slot;
        const recoveryContext = {
          ...updatedContext,
          preferred_date: extractDate(conflictedSlot) ?? updatedContext.preferred_date,
          preferred_time: extractTimeStart(conflictedSlot) ?? updatedContext.preferred_time,
          selected_slot: null,
          reschedule_new_slot: null,
          available_slots: [],
          slots_generated_for_date: null,
        };
        const recoveryOrchestration = await orchestrateBooking(
          recoveryContext,
          empresaId,
          requirePhone,
          requireReason
        );
        const recoverySlots =
          recoveryOrchestration.slots ??
          recoveryOrchestration.context_updates.available_slots ??
          [];
        updatedContext = await updateContext(conversationId, {
          ...recoveryOrchestration.context_updates,
          state: 'awaiting_slot_selection',
          selected_slot: null,
          reschedule_new_slot: null,
          available_slots: recoverySlots,
          error_context: updatedErrorState,
        }, updatedContext.context_version);

        logFlow('[FLOW_SLOTS_REGENERATED_AFTER_CONFLICT]', {
          conversation_id: conversationId,
          source: 'reschedule',
          conflicted_slot_start: conflictedSlot?.start ?? null,
          regenerated_slots_count: recoverySlots.length,
        });

        reply = recoverySlots.length > 0
          ? buildSlotsPresentationReply(
            recoverySlots,
            ERROR_MESSAGES.system.slot_conflict,
            'Indique o número do horário que prefere.'
          )
          : ERROR_MESSAGES.system.slot_conflict;
        return;
      }

      reply = result.error ?? ERROR_MESSAGES.system.retry;
    };

    const processCreateBooking = async (source: 'decision' | 'legacy_confirmation') => {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'CREATE_BOOKING',
        source,
        state: updatedContext.state ?? null,
      });

      if (updatedContext.reschedule_from_agendamento_id && updatedContext.selected_slot) {
        await processRescheduleBooking(source);
        return;
      }

      const creditBooking = await checkCredits(empresaId, 'booking_create');
      if (!creditBooking.allowed) {
        reply = 'Não foi possível criar o agendamento: créditos insuficientes.';
        return;
      }

      const stateBeforeBooking = updatedContext.state ?? null;
      let executionIdResetBeforeBooking = false;
      if (shouldResetExecutionForSelectedSlot(updatedContext)) {
        const previousExecutionId = updatedContext.execution_id ?? null;
        const previousSelectedSlotStart = updatedContext.selected_slot?.start ?? null;
        const previousAgendamentoId =
          updatedContext.agendamento_id ?? updatedContext.confirmed_snapshot?.agendamento_id ?? null;

        updatedContext = await updateContext(conversationId, {
          execution_id: null,
          agendamento_id: null,
          confirmed_snapshot: null,
          booking_lifecycle_id: null,
        }, updatedContext.context_version);
        executionIdResetBeforeBooking = true;

        logFlow('[FLOW_DEBUG_EXECUTION_REUSE]', {
          current_state: stateBeforeBooking,
          current_execution_id: previousExecutionId,
          selected_slot_start: previousSelectedSlotStart,
          agendamento_id_in_context: previousAgendamentoId,
          execution_id_was_reset: true,
          source_branch: `${source}_stale_selected_slot_reset`,
        });
      }

      const executionId = updatedContext.execution_id ?? crypto.randomUUID();
      const bookingContextUpdates: Partial<ConversationContext> = {};

      if (!updatedContext.execution_id) {
        bookingContextUpdates.execution_id = executionId;
      }

      if (canTransition(updatedContext.state, 'booking_processing')) {
        bookingContextUpdates.state = 'booking_processing';
      }

      if (Object.keys(bookingContextUpdates).length > 0) {
        updatedContext = await updateContext(
          conversationId,
          bookingContextUpdates,
          updatedContext.context_version
        );
      }

      logFlow('[FLOW_DEBUG_EXECUTION_REUSE]', {
        current_state: stateBeforeBooking,
        current_execution_id: updatedContext.execution_id ?? null,
        selected_slot_start: updatedContext.selected_slot?.start ?? null,
        agendamento_id_in_context: updatedContext.agendamento_id ?? null,
        execution_id_was_reset: executionIdResetBeforeBooking,
        source_branch: `${source}_before_booking`,
      });

      logFlow('[FLOW_DEBUG_BOOKING]', {
        stage: 'before_execute',
        source,
        execution_id: updatedContext.execution_id ?? executionId,
        selected_slot_start: updatedContext.selected_slot?.start ?? null,
        selected_slot_end: updatedContext.selected_slot?.end ?? null,
        selected_slot_resource_id: updatedContext.selected_slot?.resource_id ?? null,
        state_before_booking: stateBeforeBooking,
        agendamento_id: null,
        result_success: null,
        result_error_code: null,
        result_error: null,
      });

      const result = await executeBooking(updatedContext, empresaId, agentId, conversationId);
      logFlow('[FLOW_DEBUG_BOOKING]', {
        stage: 'after_execute',
        source,
        execution_id: updatedContext.execution_id ?? executionId,
        selected_slot_start: updatedContext.selected_slot?.start ?? null,
        selected_slot_end: updatedContext.selected_slot?.end ?? null,
        selected_slot_resource_id: updatedContext.selected_slot?.resource_id ?? null,
        state_before_booking: stateBeforeBooking,
        agendamento_id: result.agendamento_id ?? null,
        result_success: result.success,
        result_error_code: result.error_code ?? null,
        result_error: result.error ?? null,
      });
      if (result.success) {
        const snapshot = {
          service_id: updatedContext.service_id!,
          service_name: updatedContext.service_name!,
          start: updatedContext.selected_slot!.start,
          end: updatedContext.selected_slot!.end,
          resource_id: updatedContext.selected_slot!.resource_id,
          customer_name: updatedContext.customer_name!,
          customer_email: updatedContext.customer_email!,
          customer_phone: updatedContext.customer_phone ?? null,
          agendamento_id: result.agendamento_id,
        };
        if (canTransition(updatedContext.state, 'completed')) {
          updatedContext = await updateContext(conversationId, {
            state: 'completed',
            agendamento_id: result.agendamento_id,
            confirmed_snapshot: snapshot,
            error_context: resetErrorCount(updatedContext.error_context),
          }, updatedContext.context_version);
        }

        logFlow('[FLOW_BOOKING_CONFIRMED_CONTEXT_SAVED]', {
          conversation_id: conversationId,
          agendamento_id: result.agendamento_id,
          state: updatedContext.state ?? null,
          confirmed_snapshot_start: updatedContext.confirmed_snapshot?.start ?? null,
        });

        reply = HARDCODED_TEMPLATES.booking_confirmed(buildConfirmedSnapshot(updatedContext));
        await createLeadIfEligible(updatedContext, empresaId, agentId, conversationId);
        return;
      }

      if (result.error_code === 'SLOT_CONFLICT') {
        const { updatedErrorState } = handleSystemError(
          updatedContext.error_context,
          'slot_conflict',
          true,
        );
        const conflictedSlot = updatedContext.selected_slot;
        const recoveryContext = {
          ...updatedContext,
          selected_slot: null,
          reschedule_new_slot: null,
          available_slots: [],
          slots_generated_for_date: null,
        };
        const recoveryOrchestration = await orchestrateBooking(
          recoveryContext,
          empresaId,
          requirePhone,
          requireReason
        );
        const recoverySlots =
          recoveryOrchestration.slots ??
          recoveryOrchestration.context_updates.available_slots ??
          [];
        updatedContext = await updateContext(conversationId, {
          ...recoveryOrchestration.context_updates,
          state: 'awaiting_slot_selection',
          selected_slot: null,
          reschedule_new_slot: null,
          available_slots: recoverySlots,
          error_context: updatedErrorState,
        }, updatedContext.context_version);

        logFlow('[FLOW_SLOTS_REGENERATED_AFTER_CONFLICT]', {
          conversation_id: conversationId,
          source: 'booking_create',
          conflicted_slot_start: conflictedSlot?.start ?? null,
          regenerated_slots_count: recoverySlots.length,
        });

        reply = recoverySlots.length > 0
          ? buildSlotsPresentationReply(
            recoverySlots,
            ERROR_MESSAGES.system.slot_conflict,
            'Indique o número do horário que prefere.'
          )
          : ERROR_MESSAGES.system.slot_conflict;
        return;
      }

      if (result.error_code === 'DB_ERROR') {
        const { updatedErrorState, shouldHandoff } = handleSystemError(
          updatedContext.error_context,
          'booking_creation_failed',
          false,
        );
        const recoveryState = updatedContext.selected_slot ? 'awaiting_confirmation' : 'awaiting_slot_selection';
        updatedContext = await updateContext(conversationId, {
          state: recoveryState,
          error_context: updatedErrorState,
          last_error: result.error,
        }, updatedContext.context_version);

        logFlow('[FLOW_DEBUG_BOOKING_RECOVERY]', {
          conversation_id: conversationId,
          error_code: result.error_code,
          restored_state: recoveryState,
          selected_slot_start: updatedContext.selected_slot?.start ?? null,
          selected_slot_end: updatedContext.selected_slot?.end ?? null,
          available_slots_count: updatedContext.available_slots?.length ?? 0,
        });

        if (shouldHandoff) {
          await triggerHandoff(conversationId, empresaId, updatedContext, 'Booking creation failed repeatedly');
          reply = ERROR_MESSAGES.system.general_failure;
        } else if (updatedContext.selected_slot) {
          reply = 'Houve um problema técnico ao criar o agendamento. O horário continua selecionado; pode responder "sim" para tentar novamente ou escolher outro horário.';
        } else {
          reply = 'Houve um problema técnico ao criar o agendamento. Pode escolher novamente um dos horários disponíveis.';
        }
        return;
      }

      const { updatedErrorState, shouldHandoff } = handleSystemError(
        updatedContext.error_context,
        'booking_creation_failed',
        false,
      );
      updatedContext = await updateContext(conversationId, {
        error_context: updatedErrorState,
        last_error: result.error,
      }, updatedContext.context_version);
      if (shouldHandoff) {
        await triggerHandoff(conversationId, empresaId, updatedContext, 'Booking creation failed repeatedly');
        reply = ERROR_MESSAGES.system.general_failure;
      } else {
        reply = result.error ?? ERROR_MESSAGES.system.retry;
      }
    };

    const hasPendingConfirmation =
      updatedContext.state === 'awaiting_confirmation' && !!updatedContext.selected_slot;

    const answerServicePriceQuestion = async (preservePendingConfirmation = false): Promise<string> => {
      const services = await getServices();
      const currentService = findServiceById(services, updatedContext.service_id);
      let matchedService = currentService;
      let lookupSource = currentService ? 'current_service' : 'none';
      let priceAnswer = matchedService
        ? buildServicePriceAnswer(matchedService, new Date(), preservePendingConfirmation)
        : null;

      if (!priceAnswer) {
        const serviceFromText = findServiceByText(services, userMessage, extraction);
        if (serviceFromText) {
          matchedService = serviceFromText;
          lookupSource = 'message_service_match';
          priceAnswer = buildServicePriceAnswer(serviceFromText, new Date(), preservePendingConfirmation);
        }
      }

      logFlow('[FLOW_SERVICE_PRICE_LOOKUP]', {
        conversation_id: conversationId,
        current_service_id: currentService?.id ?? null,
        current_service_name: currentService?.name ?? null,
        matched_service_id: matchedService?.id ?? null,
        matched_service_name: matchedService?.name ?? null,
        lookup_source: lookupSource,
        has_configured_price: !!priceAnswer,
        confirmation_preserved: preservePendingConfirmation,
      });

      const fallbackFollowUp = preservePendingConfirmation
        ? 'Quer confirmar este agendamento?'
        : 'Quer que avancemos com a marcação?';
      const answer = priceAnswer ??
        (matchedService
          ? `Não tenho preço configurado para ${matchedService.name}. ${fallbackFollowUp}`
          : 'Não consegui identificar o serviço para consultar o preço. Pode indicar qual o serviço?');

      logFlow('[FLOW_SERVICE_PRICE_ANSWER]', {
        conversation_id: conversationId,
        service_id: matchedService?.id ?? null,
        service_name: matchedService?.name ?? null,
        answered_from_service_config: !!priceAnswer,
        confirmation_preserved: preservePendingConfirmation,
      });

      return answer;
    };

    const answerGeneralInfoQuestion = async (): Promise<string> => {
      const knowledge = await answerFromKnowledge(userMessage, empresaId, agentId, agentPrompt);
      if (knowledge.found && knowledge.answer) {
        await consumeCredits(empresaId, 'knowledge_lookup');
        return knowledge.answer;
      }

      const directive = buildResponseDirective({
        state: updatedContext.state,
        mustSayBlocks: [{
          type: 'inform',
          content: 'Responde à questão do utilizador com base no conhecimento da empresa. Sê directo e útil.',
          priority: 1,
        }],
        confirmedData: buildConfirmedSnapshot(updatedContext),
        emotionalContext: emotionalContext as any,
        language: 'pt-PT',
      });

      return await generateResponse(
        userMessage,
        updatedContext,
        serializeDirectiveToPrompt(directive),
        null,
        agentCtx,
        empresaId,
      );
    };

    const handleAvailabilityQuestion = async (): Promise<boolean> => {
      if (
        !isAvailabilityQuestion(userMessage) ||
        isPriceQuestion(userMessage) ||
        !hasRequiredCustomerDataForAvailability(updatedContext, requirePhone) ||
        updatedContext.state === 'booking_processing'
      ) {
        return false;
      }

      const bookingFlowIntent: 'RESCHEDULE' | 'BOOKING_NEW' = updatedContext.reschedule_from_agendamento_id
        ? 'RESCHEDULE'
        : 'BOOKING_NEW';

      logFlow('[FLOW_AVAILABILITY_QUESTION]', {
        conversation_id: conversationId,
        stage: 'start',
        state: updatedContext.state ?? null,
        service_id: updatedContext.service_id ?? null,
        preferred_date: updatedContext.preferred_date ?? null,
        has_customer_data: true,
      });

      const orchestrationContext = {
        ...updatedContext,
        state: 'collecting_data' as const,
        current_intent: bookingFlowIntent,
        selected_slot: null,
        reschedule_new_slot: null,
        available_slots: [],
        slots_page: 0,
        slots_generated_for_date: null,
      };
      const orchestration = await orchestrateBooking(orchestrationContext, empresaId, requirePhone, requireReason);
      updatedContext = await updateContext(conversationId, {
        ...orchestration.context_updates,
        current_intent: bookingFlowIntent,
      }, updatedContext.context_version);

      const hasSlots =
        orchestration.action === 'SHOW_SLOTS' ||
        orchestration.action === 'SHOW_EXISTING_SLOTS' ||
        orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' ||
        orchestration.action === 'SINGLE_SLOT_CONFIRM' ||
        orchestration.action === 'PROACTIVE_SLOTS';
      const slotReply = buildOrchestrationSlotsReply(
        orchestration.action,
        hasSlots ? (orchestration.slots ?? null) : null,
      );

      if (slotReply) {
        reply = slotReply;
      } else {
        reply = await generateResponse(
          userMessage,
          updatedContext,
          orchestration.response_hint,
          hasSlots ? (orchestration.slots ?? null) : null,
          agentCtx,
          empresaId,
        );
      }

      logFlow('[FLOW_AVAILABILITY_QUESTION]', {
        conversation_id: conversationId,
        stage: 'result',
        action: orchestration.action,
        slots_count: orchestration.slots?.length ?? 0,
        preferred_date: updatedContext.preferred_date ?? null,
        state: updatedContext.state ?? null,
      });

      return true;
    };

    // --- 9a. INFO_REQUEST → knowledge base, no state change ---
    if (updatedContext.state === 'awaiting_confirmation' && !updatedContext.selected_slot) {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'AWAITING_CONFIRMATION_MISSING_SELECTED_SLOT',
        source: 'defensive_recovery',
        state: updatedContext.state ?? null,
        action: decision.action ?? null,
      });

      const bookingFlowIntent: 'RESCHEDULE' | 'BOOKING_NEW' = updatedContext.reschedule_from_agendamento_id
        ? 'RESCHEDULE'
        : 'BOOKING_NEW';
      const recoveryContext = {
        ...updatedContext,
        state: 'collecting_data' as const,
        current_intent: bookingFlowIntent,
        selected_slot: null,
        reschedule_new_slot: null,
      };
      const orchestration = await orchestrateBooking(recoveryContext, empresaId, requirePhone, requireReason);
      updatedContext = await updateContext(conversationId, {
        ...orchestration.context_updates,
        selected_slot: null,
        reschedule_new_slot: null,
        current_intent: bookingFlowIntent,
      }, updatedContext.context_version);

      const hasSlots =
        orchestration.action === 'SHOW_SLOTS' ||
        orchestration.action === 'SHOW_EXISTING_SLOTS' ||
        orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' ||
        orchestration.action === 'SINGLE_SLOT_CONFIRM' ||
        orchestration.action === 'PROACTIVE_SLOTS';
      const slotReply = buildOrchestrationSlotsReply(
        orchestration.action,
        hasSlots ? (orchestration.slots ?? null) : null,
      );

      reply = slotReply ??
        'A seleção do horário não ficou disponível para confirmação. Escolha novamente um horário para eu confirmar o agendamento.';

    } else if (hasPendingConfirmation && (isPriceQuestion(userMessage) || intent === 'INFO_REQUEST' || decision.action === 'ANSWER_INFO')) {
      const infoReply = isPriceQuestion(userMessage)
        ? await answerServicePriceQuestion(true)
        : await answerGeneralInfoQuestion();
      reply = appendConfirmationReminder(infoReply);

      logFlow('[FLOW_INFO_ANSWER_CONFIRMATION_PRESERVED]', {
        conversation_id: conversationId,
        state: updatedContext.state ?? null,
        selected_slot_start: updatedContext.selected_slot?.start ?? null,
        info_type: isPriceQuestion(userMessage) ? 'price' : 'general',
      });

    } else if (await handleAvailabilityQuestion()) {
      // Reply is set by handleAvailabilityQuestion; keep booking context action-driven.

    } else if (isPriceQuestion(userMessage)) {
      reply = await answerServicePriceQuestion(false);

    } else if (!decisionActionSupported) {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'UNSUPPORTED_DECISION_ACTION',
        source: 'legacy_fallback_unexpected',
        state: updatedContext.state ?? null,
        action: decision.action ?? null,
      });

      reply = isActiveBookingState
        ? 'Pode dizer se quer escolher outro horário, confirmar este agendamento ou indicar os dados em falta?'
        : 'Pode reformular o pedido? Posso ajudar a marcar, remarcar, cancelar ou esclarecer uma dúvida.';

    } else if (
      (decision.action === 'ANSWER_INFO' && !isActiveBookingState) ||
      (
        allowLegacyIntentRouting &&
        intent === 'INFO_REQUEST' &&
        updatedContext.state !== 'awaiting_confirmation' &&
        updatedContext.state !== 'booking_processing' &&
        !updatedContext.selected_slot
      )
    ) {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'ANSWER_INFO',
        source: decision.action === 'ANSWER_INFO' ? 'decision' : 'legacy_non_active_only',
        state: updatedContext.state ?? null,
      });

      const knowledge = await answerFromKnowledge(userMessage, empresaId, agentId, agentPrompt);
      if (knowledge.found && knowledge.answer) {
        reply = knowledge.answer;
        await consumeCredits(empresaId, 'knowledge_lookup');
      } else {
        const directive = buildResponseDirective({
          state: updatedContext.state,
          mustSayBlocks: [{
            type: 'inform',
            content: 'Responde à questão do utilizador com base no conhecimento da empresa. Sê directo e útil.',
            priority: 1,
          }],
          confirmedData: buildConfirmedSnapshot(updatedContext),
          emotionalContext: emotionalContext as any,
          language: 'pt-PT',
        });
        reply = await generateResponse(
          userMessage,
          updatedContext,
          serializeDirectiveToPrompt(directive),
          null,
          agentCtx,
          empresaId,
        );
      }

    // --- 9b. CANCEL ---
    } else if (decision.action === 'START_CANCEL' || (allowLegacyIntentRouting && intent === 'CANCEL')) {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'START_CANCEL',
        source: decision.action === 'START_CANCEL' ? 'decision' : 'legacy_non_active_only',
        state: updatedContext.state ?? null,
      });

      reply = 'Para cancelar um agendamento, por favor indique o dia e hora do agendamento que pretende cancelar.';
      updatedContext = await updateContext(conversationId, {
        state: 'collecting_data',
        current_intent: 'CANCEL',
      }, updatedContext.context_version);

    // --- 9c. RESCHEDULE ---
    } else if (decision.action === 'START_RESCHEDULE' || (allowLegacyIntentRouting && intent === 'RESCHEDULE')) {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'START_RESCHEDULE',
        source: decision.action === 'START_RESCHEDULE' ? 'decision' : 'legacy_non_active_only',
        state: updatedContext.state ?? null,
      });

      const existingAgendamentoId =
        updatedContext.reschedule_from_agendamento_id ??
        updatedContext.agendamento_id ??
        updatedContext.confirmed_snapshot?.agendamento_id ??
        null;

      logFlow('[FLOW_RESCHEDULE_REQUEST_DETECTED]', {
        conversation_id: conversationId,
        agendamento_id: existingAgendamentoId,
        requested_date: extraction.date_parsed ?? null,
        requested_time: extraction.time_parsed ?? null,
        source: decision.action === 'START_RESCHEDULE' ? 'decision' : 'legacy_non_active_only',
      });

      const resolvedRescheduleDate =
        extraction.date_parsed ??
        updatedContext.preferred_date ??
        updatedContext.confirmed_snapshot?.start.slice(0, 10) ??
        null;
      const resolvedRescheduleTime = extraction.time_parsed ?? updatedContext.preferred_time ?? null;
      updatedContext = await updateContext(conversationId, {
        state: 'collecting_data',
        current_intent: 'RESCHEDULE' as any,
        reschedule_from_agendamento_id: existingAgendamentoId,
        preferred_date: resolvedRescheduleDate,
        preferred_time: resolvedRescheduleTime,
        reschedule_new_date: resolvedRescheduleDate,
        reschedule_new_time: resolvedRescheduleTime,
        selected_slot: null,
        available_slots: [],
        slots_page: 0,
        slots_generated_for_date: null,
        reschedule_new_slot: null,
      }, updatedContext.context_version);

      let handledImmediateReschedule = false;
      if (existingAgendamentoId && (extraction.time_parsed || extraction.date_parsed)) {
        const orchestration = await orchestrateBooking(
          {
            ...updatedContext,
            current_intent: 'RESCHEDULE' as any,
          },
          empresaId,
          requirePhone,
          requireReason
        );
        updatedContext = await updateContext(conversationId, {
          ...orchestration.context_updates,
          current_intent: 'RESCHEDULE',
        }, updatedContext.context_version);

        if (extraction.time_parsed && updatedContext.available_slots.length > 0) {
          await processTimeBasedSlotSearch('decision');
        } else {
          const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
          reply = slotReply ??
            'Indique a nova data e hora pretendida para o reagendamento.';
        }
        handledImmediateReschedule = true;
      }

      if (!handledImmediateReschedule) {
        const directive = buildResponseDirective({
          state: updatedContext.state,
          mustSayBlocks: [{
            type: 'ask_date',
            content: 'Pede a nova data e hora para o reagendamento.',
            priority: 1,
          }],
          confirmedData: buildConfirmedSnapshot(updatedContext),
          emotionalContext: emotionalContext as any,
          language: 'pt-PT',
        });
        reply = await generateResponse(
          userMessage,
          updatedContext,
          serializeDirectiveToPrompt(directive),
          null,
          agentCtx,
          empresaId,
        );
      }

    // --- 9d. BOOKING FLOW (state-driven, ALL branches use updatedContext.state) ---
    } else if (
      isDecisionBookingAction ||
      intent === 'BOOKING_NEW' ||
      intent === 'TIME_BASED_SELECTION' ||
      isActiveBookingState
    ) {

      if (decision.action === 'ASK_SERVICE') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ASK_SERVICE',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        updatedContext = await updateContext(conversationId, {
          state: 'collecting_service',
        }, updatedContext.context_version);

        const directive = buildResponseDirective({
          state: updatedContext.state,
          mustSayBlocks: [{
            type: 'ask_service',
            content: updatedContext.customer_name
              ? `O utilizador já forneceu dados pessoais. Agradece brevemente e pergunta qual o serviço ou motivo da consulta, sem voltar a pedir dados pessoais.`
              : 'Identifica o serviço pretendido de forma empática e sem pedir dados pessoais ainda.',
            priority: 1,
          }],
          confirmedData: buildConfirmedSnapshot(updatedContext),
          emotionalContext: emotionalContext as any,
          language: 'pt-PT',
        });

        reply = await generateResponse(
          userMessage,
          updatedContext,
          serializeDirectiveToPrompt(directive),
          null,
          agentCtx,
          empresaId,
        );

      } else if (decision.action === 'ASK_DATE') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ASK_DATE',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        updatedContext = await updateContext(conversationId, {
          state: 'collecting_data',
        }, updatedContext.context_version);

        const shouldUseDeterministicDatePrompt =
          !!updatedContext.service_name && hasBookingContinuationSignal(userMessage, extraction);

        if (shouldUseDeterministicDatePrompt) {
          reply = `Claro. Para avançar com ${updatedContext.service_name}, indique a data e hora que prefere. Se quiser, pode escrever algo como 'hoje às 12h30'.`;
        } else {
          const askDateContent = updatedContext.service_name
          ? `Pergunta de forma clara para que data prefere o agendamento de ${updatedContext.service_name}.`
          : 'Pergunta de forma clara para que data prefere o agendamento.';

          const directive = buildResponseDirective({
            state: updatedContext.state,
            mustSayBlocks: [{
              type: 'ask_date',
              content: askDateContent,
              priority: 1,
            }],
            confirmedData: buildConfirmedSnapshot(updatedContext),
            emotionalContext: emotionalContext as any,
            language: 'pt-PT',
          });

          reply = await generateResponse(
            userMessage,
            updatedContext,
            serializeDirectiveToPrompt(directive),
            null,
            agentCtx,
            empresaId,
          );
        }

      } else if (decision.action === 'ASK_PERSONAL_DATA') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ASK_PERSONAL_DATA',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        const missingFieldLabels = getMissingBookingFieldLabels(
          updatedContext,
          requirePhone,
          requireReason,
          extractDecisionMissingFields(decision.payload)
        );

        updatedContext = await updateContext(conversationId, {
          state: 'collecting_data',
        }, updatedContext.context_version);

        const directive = buildResponseDirective({
          state: updatedContext.state,
          mustSayBlocks: [{
            type: 'ask_multiple_fields',
            content: buildMissingDataPrompt(missingFieldLabels),
            priority: 1,
          }],
          confirmedData: buildConfirmedSnapshot(updatedContext),
          emotionalContext: emotionalContext as any,
          language: 'pt-PT',
        });

        reply = await generateResponse(
          userMessage,
          updatedContext,
          serializeDirectiveToPrompt(directive),
          null,
          agentCtx,
          empresaId,
        );

      } else if (decision.action === 'GENERATE_SLOTS') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'GENERATE_SLOTS',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        const bookingFlowIntent: 'RESCHEDULE' | 'BOOKING_NEW' = updatedContext.reschedule_from_agendamento_id
          ? 'RESCHEDULE'
          : 'BOOKING_NEW';
        const orchestrationContext = {
          ...updatedContext,
          state: 'collecting_data' as const,
          current_intent: bookingFlowIntent,
        };
        const orchestration = await orchestrateBooking(orchestrationContext, empresaId, requirePhone, requireReason);
        updatedContext = await updateContext(conversationId, {
          ...orchestration.context_updates,
          current_intent: bookingFlowIntent,
        }, updatedContext.context_version);

        if (
          (extraction.time_parsed || extraction.relative_time_direction) &&
          updatedContext.available_slots.length > 0
        ) {
          await processTimeBasedSlotSearch('decision');
          // Time-based generation is fully handled here; do not also present the generic list.
        } else {
          const hasSlots =
            orchestration.action === 'SHOW_SLOTS' ||
            orchestration.action === 'SHOW_EXISTING_SLOTS' ||
            orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' ||
            orchestration.action === 'SINGLE_SLOT_CONFIRM' ||
            orchestration.action === 'PROACTIVE_SLOTS';
          const slotReply = buildOrchestrationSlotsReply(
            orchestration.action,
            hasSlots ? (orchestration.slots ?? null) : null
          );

          if (slotReply) {
            reply = slotReply;
          } else {
            reply = await generateResponse(
              userMessage,
              updatedContext,
              orchestration.response_hint,
              hasSlots ? (orchestration.slots ?? null) : null,
              agentCtx,
              empresaId,
            );
          }
        }

      } else if (decision.action === 'SHOW_SLOTS' && updatedContext.available_slots.length > 0) {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'SHOW_SLOTS',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        updatedContext = await updateContext(conversationId, {
          state: 'awaiting_slot_selection',
        }, updatedContext.context_version);
        reply = buildSlotsPresentationReply(
          updatedContext.available_slots,
          'Tenho estes horários disponíveis para essa data:',
          'Indique o número do horário que prefere.'
        );

      } else if (decision.action === 'SLOT_SEARCH_BY_TIME' && updatedContext.available_slots.length > 0) {
        await processTimeBasedSlotSearch('decision');

      } else if (decision.action === 'SELECT_SLOT' && updatedContext.available_slots.length > 0) {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'SELECT_SLOT',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        const selectionResult = resolveSlotSelectionFromContext(updatedContext, userMessage);
        const selectedSlot = selectionResult.slot;
        logSlotSelectionDebug(
          selectionResult.selected_index,
          selectedSlot?.start ?? null,
          updatedContext.available_slots.length
        );

        if (selectedSlot) {
          const missingFieldLabels = getMissingBookingFieldLabels(
            updatedContext,
            requirePhone,
            requireReason
          );

          if (missingFieldLabels.length > 0) {
            updatedContext = await updateContext(
              conversationId,
              buildSlotSelectionUpdates(updatedContext, selectedSlot, 'collecting_data'),
              updatedContext.context_version
            );

            const directive = buildResponseDirective({
              state: updatedContext.state,
              mustSayBlocks: [{
                type: 'ask_multiple_fields',
                content: buildMissingDataPrompt(missingFieldLabels),
                priority: 1,
              }],
              confirmedData: buildConfirmedSnapshot(updatedContext, selectedSlot),
              emotionalContext: emotionalContext as any,
              language: 'pt-PT',
            });

            reply = await generateResponse(
              userMessage,
              updatedContext,
              serializeDirectiveToPrompt(directive),
              null,
              agentCtx,
              empresaId,
            );
          } else {
            updatedContext = await updateContext(
              conversationId,
              buildSlotSelectionUpdates(updatedContext, selectedSlot, 'awaiting_confirmation'),
              updatedContext.context_version
            );
            logSelectedSlotPersisted(conversationId, updatedContext, selectedSlot);

            reply = HARDCODED_TEMPLATES.awaiting_confirmation(
              buildConfirmedSnapshot(updatedContext, selectedSlot)
            );
          }
        } else {
          updatedContext = await updateContext(conversationId, {
            state: 'awaiting_slot_selection',
          }, updatedContext.context_version);
          reply = buildSlotsPresentationReply(
            updatedContext.available_slots,
            'O horário indicado não está na lista. Estes são os horários disponíveis:',
            'Indique o número do horário que prefere.'
          );
        }

      } else if (decision.action === 'CONFIRM_BOOKING' && updatedContext.selected_slot) {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'CONFIRM_BOOKING',
          source: 'decision',
          state: updatedContext.state ?? null,
        });

        updatedContext = await updateContext(conversationId, {
          state: 'awaiting_confirmation',
        }, updatedContext.context_version);

        reply = HARDCODED_TEMPLATES.awaiting_confirmation(
          buildConfirmedSnapshot(updatedContext)
        );

      } else if (decision.action === 'CREATE_BOOKING') {
        if (updatedContext.selected_slot) {
          await processCreateBooking('decision');
        } else {
          const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
          updatedContext = await updateContext(conversationId, orchestration.context_updates, updatedContext.context_version);
          const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
          if (slotReply) {
            reply = slotReply;
          } else {
            reply = await generateResponse(
              userMessage,
              updatedContext,
              orchestration.response_hint,
              orchestration.slots ?? null,
              agentCtx,
              empresaId,
            );
          }
        }

      } else if (decision.action === 'EXECUTE_RESCHEDULE') {
        if (updatedContext.selected_slot) {
          await processRescheduleBooking('decision');
        } else {
          reply = 'Para remarcar, preciso que escolha primeiro o novo horário.';
        }

      } else if (isActiveBookingState && decisionActionSupported) {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ACTIVE_DECISION_SAFE_FALLBACK',
          source: 'legacy_fallback_unexpected',
          state: updatedContext.state ?? null,
          action: decision.action ?? null,
        });

        reply = updatedContext.available_slots.length > 0
          ? 'Pode indicar o número do horário que prefere, dizer outro horário ou confirmar este agendamento.'
          : 'Pode dizer qual o serviço, data ou dados que pretende ajustar para eu continuar?';

      // === 9d.1 awaiting_confirmation ===
      } else if (updatedContext.state === 'awaiting_confirmation') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ACTIVE_LEGACY_BLOCKED',
          source: 'legacy_fallback_unexpected',
          state: updatedContext.state ?? null,
          action: decision.action ?? null,
          blocked_branch: 'awaiting_confirmation',
        });

        reply = updatedContext.selected_slot
          ? 'Pode responder "sim" para confirmar este agendamento, indicar o número do horário ou dizer outro horário.'
          : 'Preciso que confirme ou indique o horário pretendido para continuar.';

        if (false) {
        // ---- Confirmation accepted ----
        if (/\b(sim|confirmo|confirmar|ok|certo|correto|exato|perfeito|yes)\b/i.test(userMessage)) {
          logFlow('[FLOW_BRANCH]', {
            conversation_id: conversationId,
            branch: 'CREATE_BOOKING',
            source: 'legacy_fallback_unexpected',
            state: updatedContext.state ?? null,
            action: decision.action ?? null,
          });

          // Phase 1 / Sprint 3: blocked legacy confirmation path; booking creation must come from decision.action.

        } else {
          // ---- Not a confirmation: might be a time change, data change, or unclear ----
          const timeOnlyPattern = /\b(\d{1,2})\s*h(?:oras?)?(?:\s*(\d{2}))?\b|^às?\s+(\d{1,2})/i;
          const isTimeRequest = timeOnlyPattern.test(userMessage) && extraction.intent !== 'CANCEL';

          if (isTimeRequest && extraction.time_parsed && updatedContext.available_slots.length > 0) {
            // Phase 1 / Sprint 3: blocked legacy time-change path; slot change must come from decision.action.
          } else if (isTimeRequest && updatedContext.available_slots.length > 0) {
            const currentDate = extractDate(updatedContext.selected_slot) ?? updatedContext.preferred_date;
            const selectionContext = keepCurrentDateOnTimeOnlyChange && currentDate
              ? {
                ...updatedContext,
                available_slots: updatedContext.available_slots.filter((slot) => extractDate(slot) === currentDate),
              }
              : updatedContext;
            const selectionResult = resolveSlotSelectionFromContext(selectionContext, userMessage);
            const selectedSlot = selectionResult.slot;
            logSlotSelectionDebug(
              selectionResult.selected_index,
              selectedSlot?.start ?? null,
              selectionContext.available_slots.length
            );
            if (selectedSlot !== null) {
              // New time matched existing slot → update selection, stay in confirmation
              updatedContext = await updateContext(
                conversationId,
                buildSlotSelectionUpdates(updatedContext, selectedSlot!, 'awaiting_confirmation'),
                updatedContext.context_version
              );
              reply = HARDCODED_TEMPLATES.awaiting_confirmation(buildConfirmedSnapshot(updatedContext, selectedSlot));
            } else {
              // New time NOT in existing slots → re-show same slots, no new search
              updatedContext = await updateContext(conversationId, { state: 'awaiting_slot_selection' }, updatedContext.context_version);
              reply = buildSlotsPresentationReply(
                updatedContext.available_slots,
                'Esse horário não está disponível. Estes são os horários disponíveis:',
                'Indique o número do horário que prefere.'
              );
            }
          } else {
            // Data change or unclear → back to collecting_data, trigger orchestration
            updatedContext = await updateContext(conversationId, {
              state: 'collecting_data',
              selected_slot: null,
            }, updatedContext.context_version);
            const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
            updatedContext = await updateContext(conversationId, orchestration.context_updates, updatedContext.context_version);
            const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
            if (slotReply !== null) {
              reply = slotReply!;
            } else {
              reply = await generateResponse(
                userMessage,
                updatedContext,
                orchestration.response_hint,
                orchestration.slots ?? null,
                agentCtx,
                empresaId,
              );
            }
          }
        }
        }

      // === 9d.2 awaiting_slot_selection ===
      } else if (updatedContext.state === 'awaiting_slot_selection') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ACTIVE_LEGACY_BLOCKED',
          source: 'legacy_fallback_unexpected',
          state: updatedContext.state ?? null,
          action: decision.action ?? null,
          blocked_branch: 'awaiting_slot_selection',
        });

        reply = updatedContext.available_slots.length > 0
          ? 'Pode indicar o número do horário que prefere ou dizer outro horário.'
          : 'Preciso que escolha um dos horários disponíveis para continuar.';

        if (false) {
        const selectionResult = resolveSlotSelectionFromContext(updatedContext, userMessage);
        const selectedSlot = selectionResult.slot;
        logSlotSelectionDebug(
          selectionResult.selected_index,
          selectedSlot?.start ?? null,
          updatedContext.available_slots.length
        );
        if (selectedSlot !== null) {
          const missingPersonal = !updatedContext.customer_name || !updatedContext.customer_email;
          if (missingPersonal) {
            updatedContext = await updateContext(
              conversationId,
              buildSlotSelectionUpdates(updatedContext, selectedSlot!, 'collecting_data'),
              updatedContext.context_version
            );
            const missingFields: string[] = [];
            if (!updatedContext.customer_name) missingFields.push('nome completo');
            if (!updatedContext.customer_email) missingFields.push('email');
            if (requirePhone && !updatedContext.customer_phone) missingFields.push('telefone');
            const directive = buildResponseDirective({
              state: updatedContext.state,
              mustSayBlocks: [{
                type: 'ask_multiple_fields',
                content: `Para confirmar o agendamento, só preciso do seu ${missingFields.join(', ')} 😊`,
                priority: 1,
              }],
              confirmedData: buildConfirmedSnapshot(updatedContext, selectedSlot),
              emotionalContext: emotionalContext as any,
              language: 'pt-PT',
            });
            reply = await generateResponse(
              userMessage,
              updatedContext,
              serializeDirectiveToPrompt(directive),
              null,
              agentCtx,
              empresaId,
            );
          } else {
            updatedContext = await updateContext(
              conversationId,
              buildSlotSelectionUpdates(updatedContext, selectedSlot!, 'awaiting_confirmation'),
              updatedContext.context_version
            );
            reply = HARDCODED_TEMPLATES.awaiting_confirmation(buildConfirmedSnapshot(updatedContext, selectedSlot));
          }
        } else {
          // No match — re-present existing slots without regenerating
          reply = buildSlotsPresentationReply(
            updatedContext.available_slots,
            'O horário indicado não está na lista. Estes são os horários disponíveis:',
            'Indique o número do horário que prefere.'
          );
        }

      // === 9d.3 collecting_service (SINGLE BRANCH — BUG FIX #4) ===
        }
      } else if (updatedContext.state === 'collecting_service') {
        logFlow('[FLOW_BRANCH]', {
          conversation_id: conversationId,
          branch: 'ACTIVE_LEGACY_BLOCKED',
          source: 'legacy_fallback_unexpected',
          state: updatedContext.state ?? null,
          action: decision.action ?? null,
          blocked_branch: 'collecting_service',
        });

        if (true) {
          // Phase 1 / Sprint 4: collecting_service must be driven by decision.action only.
          reply = updatedContext.service_id
            ? 'Já tenho o serviço. Pode indicar a data pretendida para continuar.'
            : 'Preciso que indique o serviço pretendido para continuar.';
        } else if (updatedContext.service_id) {
          // Service resolved this turn → advance to orchestrator (will go to collecting_data or slots)
          const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
          updatedContext = await updateContext(conversationId, {
            ...orchestration.context_updates,
            current_intent: 'BOOKING_NEW',
          }, updatedContext.context_version);
          const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
          if (slotReply !== null) {
            reply = slotReply!;
          } else {
            reply = await generateResponse(
              userMessage,
              updatedContext,
              orchestration.response_hint,
              orchestration.slots ?? null,
              agentCtx,
              empresaId,
            );
          }
        } else {
          // Service NOT yet resolved → ask for it (never ask personal data here)
          const directive = buildResponseDirective({
            state: updatedContext.state,
            mustSayBlocks: [{
              type: 'ask_service',
              content: updatedContext.customer_name
                ? `O utilizador já forneceu os seus dados (nome: ${updatedContext.customer_name}). Agradece brevemente e pergunta qual o motivo da consulta ou que serviço pretende. Não voltes a pedir dados pessoais.`
                : 'Identifica o serviço pretendido de forma empática. Não peças dados pessoais ainda.',
              priority: 1,
            }],
            confirmedData: buildConfirmedSnapshot(updatedContext),
            emotionalContext: emotionalContext as any,
            language: 'pt-PT',
          });
          reply = await generateResponse(
            userMessage,
            updatedContext,
            serializeDirectiveToPrompt(directive),
            null,
            agentCtx,
            empresaId,
          );
        }

      // === 9d.4 collecting_data / idle-to-booking / new booking intent ===
      } else {
        // If idle and we reach here, it's a booking intent on first turn → decide path
        if (updatedContext.state === 'idle') {
          const nextState = updatedContext.service_id ? 'collecting_data' : 'collecting_service';
          updatedContext = await updateContext(conversationId, {
            state: nextState,
            current_intent: 'BOOKING_NEW',
          }, updatedContext.context_version);

          // If still no service, ask for it with empathy — NEVER ask for data here
          if (!updatedContext.service_id) {
            const directive = buildResponseDirective({
              state: updatedContext.state,
              mustSayBlocks: [{
                type: 'ask_service',
                content: 'Sê empático, reconhece o contexto e guia para perceber que serviço o utilizador pretende.',
                priority: 1,
              }],
              confirmedData: buildConfirmedSnapshot(updatedContext),
              emotionalContext: emotionalContext as any,
              language: 'pt-PT',
            });
            reply = await generateResponse(
              userMessage,
              updatedContext,
              serializeDirectiveToPrompt(directive),
              null,
              agentCtx,
              empresaId,
            );
          } else {
            // Service already resolved from extraction → go straight to orchestration
            const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
            updatedContext = await updateContext(conversationId, {
              ...orchestration.context_updates,
              current_intent: 'BOOKING_NEW',
            }, updatedContext.context_version);
            const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
            if (slotReply) {
              reply = slotReply;
            } else {
              reply = await generateResponse(
                userMessage,
                updatedContext,
                orchestration.response_hint,
                orchestration.slots ?? null,
                agentCtx,
                empresaId,
              );
            }
          }
        } else {
          // collecting_data — run orchestration to decide availability vs. ask more data
          logFlow('[FLOW_BRANCH]', {
            conversation_id: conversationId,
            branch: 'ACTIVE_LEGACY_BLOCKED',
            source: 'legacy_fallback_unexpected',
            state: updatedContext.state ?? null,
            action: decision.action ?? null,
            blocked_branch: 'collecting_data',
          });

          if (true) {
            // Phase 1 / Sprint 4: collecting_data must be driven by decision.action only.
            reply = updatedContext.available_slots.length > 0
              ? 'Pode indicar o número do horário que prefere ou dizer outro horário.'
              : 'Pode indicar a data pretendida ou os dados em falta para continuar.';
          } else {
            const preOrchestrationContext = {
            ...updatedContext,
            state: 'collecting_data' as const,
            current_intent: 'BOOKING_NEW' as const,
          };
          const orchestration = await orchestrateBooking(preOrchestrationContext, empresaId, requirePhone, requireReason);
          updatedContext = await updateContext(conversationId, {
            ...orchestration.context_updates,
            current_intent: 'BOOKING_NEW',
          }, updatedContext.context_version);

          const hasSlots =
            orchestration.action === 'SHOW_SLOTS' ||
            orchestration.action === 'SHOW_EXISTING_SLOTS' ||
            orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' ||
            orchestration.action === 'SINGLE_SLOT_CONFIRM' ||
            orchestration.action === 'PROACTIVE_SLOTS';
          const slotReply = buildOrchestrationSlotsReply(
            orchestration.action,
            hasSlots ? (orchestration.slots ?? null) : null
          );

          if (slotReply !== null) {
            reply = slotReply!;
          } else {
            reply = await generateResponse(
              userMessage,
              updatedContext,
              orchestration.response_hint,
              hasSlots ? (orchestration.slots ?? null) : null,
              agentCtx,
              empresaId,
            );
          }
          }
        }
      }

    // --- 9e. Generic fallback ---
    } else {
      logFlow('[FLOW_BRANCH]', {
        conversation_id: conversationId,
        branch: 'ACTIVE_LEGACY_BLOCKED',
        source: 'legacy_fallback_unexpected',
        state: updatedContext.state ?? null,
        action: decision.action ?? null,
        blocked_branch: 'generic_fallback',
      });

      if (true) {
        // Phase 1 / Sprint 4: generic fallback must never start or mutate booking flow.
        reply = updatedContext.state === 'idle'
          ? 'Pode dizer se quer marcar, remarcar, cancelar ou esclarecer uma dúvida.'
          : 'Não consegui determinar o próximo passo com segurança. Pode reformular o que pretende fazer?';
      } else {
        const nextState = updatedContext.service_id ? 'collecting_data' : 'collecting_service';
        updatedContext = await updateContext(conversationId, {
          state: nextState,
          current_intent: 'BOOKING_NEW',
        }, updatedContext.context_version);
        const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
        updatedContext = await updateContext(conversationId, {
          ...orchestration.context_updates,
          current_intent: 'BOOKING_NEW',
        }, updatedContext.context_version);
        const slotReply = buildOrchestrationSlotsReply(orchestration.action, orchestration.slots ?? null);
        if (slotReply !== null) {
          reply = slotReply!;
        } else {
          reply = await generateResponse(
            userMessage,
            updatedContext,
            orchestration.response_hint,
            orchestration.slots ?? null,
            agentCtx,
            empresaId,
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 10. Persist AI reply + credits + last_message_at
    // -------------------------------------------------------------------------
    await db.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'ai',
      content: reply,
    });

    await consumeCredits(empresaId, 'message', conversationId);

    await db.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CHAT_AI_ERROR]', error);
    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'ORCHESTRATOR_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 'error').catch(() => {});

    return new Response(JSON.stringify({
      reply: 'Peço desculpa, ocorreu um erro. Por favor tente novamente.',
      error: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
