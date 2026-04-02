/**
 * Booking Engine v1.0
 * 
 * Pure deterministic booking validation and creation.
 * NO AI logic. NO prompt logic. NO orchestration.
 * 
 * This module is called by chat-ai-response tool handler
 * and by any future API that needs to create internal bookings.
 */

import { toLisbonParts } from './timezone-utils.ts';
import { emitPlatformEvent } from './platform-events.ts';
import {
  checkSchedulingCapability,
} from './scheduling-capabilities.ts';
import {
  getSchedulingCreditCost,
  generateExecutionId,
  type SchedulingState,
  type ExternalExecutionState,
} from './scheduling-credit-rules.ts';
import {
  resolveDuration,
  resolveResources,
  validateSlotAvailability,
  isResourceFreeShared,
  type SchedulingResource,
} from './scheduling-availability.ts';

// =============================================
// Types
// =============================================

export interface CreateInternalBookingParams {
  supabase: any;
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  service_id?: string;
  resource_id?: string;
  start_datetime: string;
  duration_minutes?: number;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  reason?: string;
  execution_id?: string;
  /** Injected context for safety checks — if appointment_id exists, create is blocked */
  conversation_context?: Record<string, unknown>;
}

export interface BookingResult {
  success: boolean;
  state: 'confirmed' | 'conflict' | 'outside_hours' | 'missing_field' | 'validation_error' | 'blocked' | 'error';
  message: string;
  recovery_message?: string;
  appointment_id?: string;
  start?: string;
  end?: string;
  error_code?: string;
  error_type?: 'conflict' | 'validation' | 'system';
  retryable?: boolean;
  credits_consumed: number;
  execution_id?: string;
}

// =============================================
// Internal helpers
// =============================================

interface ServiceResourceLink {
  resource_id: string;
  is_required: boolean;
}

interface ResourceWithType {
  id: string;
  type: string;
  priority: number;
}

// Local helper wrapping shared conflict check
async function isResourceFree(supabase: any, resourceId: string, effectiveStart: Date, effectiveEnd: Date): Promise<boolean> { // deno-lint-ignore-line no-explicit-any
  console.log('[DEBUG] isResourceFreeShared called via BookingEngine wrapper');
  const result = await isResourceFreeShared(supabase, resourceId, effectiveStart, effectiveEnd);
  return result.free;
}

// deno-lint-ignore no-explicit-any
async function resolveMultiResourceAvailability(
  supabase: any,
  companyId: string,
  serviceId: string,
  startDt: Date,
  durationMinutes: number,
  bufferBefore: number,
  bufferAfter: number,
): Promise<{ available: boolean; resourceIds: string[]; endDt: Date; reason?: string }> {
  const effectiveStart = new Date(startDt.getTime() - bufferBefore * 60000);
  const effectiveEnd = new Date(startDt.getTime() + durationMinutes * 60000 + bufferAfter * 60000);
  const appointmentEnd = new Date(startDt.getTime() + durationMinutes * 60000);

  const { data: svcResLinks } = await supabase
    .from('scheduling_service_resources')
    .select('resource_id, is_required')
    .eq('service_id', serviceId);

  const links: ServiceResourceLink[] = (svcResLinks || []) as ServiceResourceLink[];

  if (links.length === 0) {
    // Fallback: all active resources for company (single-resource mode)
    const { data: allResources } = await supabase
      .from('scheduling_resources')
      .select('id, type, priority')
      .eq('empresa_id', companyId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (!allResources || allResources.length === 0) {
      return { available: false, resourceIds: [], endDt: appointmentEnd, reason: 'NO_RESOURCES_CONFIGURED' };
    }

    for (const res of allResources as ResourceWithType[]) {
      const isFree = await isResourceFree(supabase, res.id, effectiveStart, effectiveEnd);
      if (isFree) {
        console.log(`[BookingEngine] Resource ${res.id} available (legacy mode)`);
        return { available: true, resourceIds: [res.id], endDt: appointmentEnd };
      }
    }
    return { available: false, resourceIds: [], endDt: appointmentEnd, reason: 'SLOT_NOT_AVAILABLE' };
  }

  // Fetch resource details
  const linkedIds = links.map(l => l.resource_id);
  const { data: resourceDetails } = await supabase
    .from('scheduling_resources')
    .select('id, type, priority')
    .in('id', linkedIds)
    .eq('status', 'active')
    .order('priority', { ascending: true });

  if (!resourceDetails || resourceDetails.length === 0) {
    return { available: false, resourceIds: [], endDt: appointmentEnd, reason: 'NO_RESOURCES_CONFIGURED' };
  }

  const resourceMap = new Map<string, ResourceWithType>();
  for (const r of resourceDetails as ResourceWithType[]) {
    resourceMap.set(r.id, r);
  }

  // Build required/optional groups by type
  const requiredByType = new Map<string, ResourceWithType[]>();
  const optionalResources: ResourceWithType[] = [];
  for (const link of links) {
    const res = resourceMap.get(link.resource_id);
    if (!res) continue;
    if (link.is_required) {
      const existing = requiredByType.get(res.type) || [];
      existing.push(res);
      requiredByType.set(res.type, existing);
    } else {
      optionalResources.push(res);
    }
  }

  if (requiredByType.size === 0) {
    // No required resources → single-resource fallback
    for (const res of resourceMap.values()) {
      const isFree = await isResourceFree(supabase, res.id, effectiveStart, effectiveEnd);
      if (isFree) {
        return { available: true, resourceIds: [res.id], endDt: appointmentEnd };
      }
    }
    return { available: false, resourceIds: [], endDt: appointmentEnd, reason: 'SLOT_NOT_AVAILABLE' };
  }

  // Check each required type has at least one available resource
  const resolvedIds: string[] = [];
  for (const [type, resources] of requiredByType.entries()) {
    let found = false;
    for (const res of resources) {
      const isFree = await isResourceFree(supabase, res.id, effectiveStart, effectiveEnd);
      if (isFree) {
        resolvedIds.push(res.id);
        console.log(`[BookingEngine] Type '${type}': selected resource ${res.id}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`[BookingEngine] No available resource of type '${type}'`);
      return { available: false, resourceIds: [], endDt: appointmentEnd, reason: 'NO_VALID_RESOURCE_COMBINATION' };
    }
  }

  // Include optional resources if free
  for (const optRes of optionalResources) {
    const isFree = await isResourceFree(supabase, optRes.id, effectiveStart, effectiveEnd);
    if (isFree) resolvedIds.push(optRes.id);
  }

  console.log(`[BookingEngine] Combination resolved: ${resolvedIds.join(', ')}`);
  return { available: true, resourceIds: resolvedIds, endDt: appointmentEnd };
}

// =============================================
// Main Entry Point
// =============================================

export async function createInternalBooking(params: CreateInternalBookingParams): Promise<BookingResult> {
  const { supabase, company_id, agent_id, conversation_id, start_datetime, customer_name, customer_email, customer_phone, reason, service_id, resource_id } = params;
  const executionId = params.execution_id || generateExecutionId('create_appointment', company_id);
  const creditCost = getSchedulingCreditCost('create_appointment');
  const timestamp = new Date().toISOString();

  // --- 0. Hard guard: empresa_id must exist ---
  if (!company_id) {
    console.error('[BookingEngine] BLOCKED: Missing empresa_id');
    return { success: false, state: 'blocked', message: 'Empresa inválida.', error_code: 'MISSING_EMPRESA_ID', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  console.log('[BOOKING_EXECUTION] BookingEngine entry');
  console.log(`[BOOKING_EXECUTION] empresa_id: ${company_id}`);

  // --- HARD LOCK CHECKS ---
  const ctx = params.conversation_context;
  
  // GUARD: booking_finalized
  if (ctx && ctx.booking_finalized === true) {
    console.log('[BOOKING BLOCKED - ALREADY FINALIZED] booking_finalized=true (BookingEngine)');
    return { success: false, state: 'blocked', message: 'O agendamento já foi confirmado anteriormente.', error_code: 'DUPLICATE_EXECUTION', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // GUARD: appointment_id exists
  if (ctx && ctx.appointment_id) {
    console.log(`[BOOKING BLOCKED - ALREADY FINALIZED] appointment_id=${ctx.appointment_id} (BookingEngine)`);
    return { success: false, state: 'blocked', message: 'Já existe um agendamento ativo nesta conversa.', error_code: 'ACTIVE_BOOKING_EXISTS', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // GUARD: confirmed_snapshot exists
  if (ctx && ctx.confirmed_snapshot) {
    console.log('[BOOKING BLOCKED - ALREADY FINALIZED] confirmed_snapshot exists (BookingEngine)');
    return { success: false, state: 'blocked', message: 'O agendamento já foi confirmado anteriormente.', error_code: 'DUPLICATE_EXECUTION', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  console.log(`[BookingEngine] company=${company_id}, service=${service_id || 'none'}, resource=${resource_id || 'auto'}`);

  // --- 1. Capability check ---
  const capCheck = await checkSchedulingCapability(supabase, company_id, 'create_appointment');
  if (!capCheck.allowed) {
    console.log('[BookingEngine] BLOCKED: capability not enabled');
    return { success: false, state: 'blocked', message: 'Creating appointments is not enabled.', error_code: 'INTEGRATION_NOT_ACTIVE', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // --- 2. Validate required fields ---
  if (!customer_email?.trim()) {
    return { success: false, state: 'missing_field', message: 'Email é obrigatório para agendamento.', recovery_message: 'Para confirmar o agendamento, preciso do seu endereço de email. Pode fornecer?', error_code: 'MISSING_REQUIRED_FIELD', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // --- 2b. Email format validation ---
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customer_email.trim())) {
    console.warn(`[BookingEngine] FAILED_INVALID_EMAIL: "${customer_email}"`);
    return { success: false, state: 'validation_error', message: 'O formato do email fornecido não é válido.', recovery_message: 'O email fornecido não parece estar correto. Pode verificar e indicar um email válido, por favor?', error_code: 'INVALID_EMAIL_FORMAT', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }
  if (!customer_name?.trim()) {
    return { success: false, state: 'missing_field', message: 'Nome é obrigatório para agendamento.', recovery_message: 'Para prosseguir com o agendamento, preciso do seu nome completo. Pode indicar, por favor?', error_code: 'MISSING_REQUIRED_FIELD', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }
  if (!start_datetime) {
    return { success: false, state: 'missing_field', message: 'Data e hora são obrigatórias.', error_code: 'MISSING_REQUIRED_DATA', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  const startDt = new Date(start_datetime);
  if (isNaN(startDt.getTime())) {
    return { success: false, state: 'validation_error', message: 'Formato de data inválido.', error_code: 'VALIDATION_ERROR', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // --- 3. Fetch booking configuration ---
  const { data: bookingConfig } = await supabase
    .from('booking_configuration')
    .select('*')
    .eq('empresa_id', company_id)
    .maybeSingle();

  const bc = bookingConfig || {
    require_phone: false, require_reason: true, allow_same_day_booking: true,
    allow_outside_business_hours: false, minimum_advance_minutes: 0,
    allow_internal_calendar: true,
  };

  // Field enforcement from booking config
  if (bc.require_phone && !customer_phone?.trim()) {
    return { success: false, state: 'missing_field', message: 'Telefone é obrigatório.', recovery_message: 'Para este agendamento é necessário um número de telefone de contacto. Pode indicar o seu?', error_code: 'MISSING_REQUIRED_FIELD', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }
  if (bc.require_reason && !reason?.trim()) {
    console.warn('[BookingEngine] FAILED_MISSING_REQUIRED_FIELD: reason is missing');
    return { success: false, state: 'missing_field', message: 'Motivo é obrigatório.', recovery_message: 'Pode indicar o motivo ou assunto do agendamento, por favor?', error_code: 'MISSING_REQUIRED_FIELD', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  if (!bc.allow_internal_calendar) {
    return { success: false, state: 'blocked', message: 'Agendamento interno não está permitido.', error_code: 'INTERNAL_CALENDAR_DISABLED', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // --- 4. Timezone normalization (Europe/Lisbon) ---
  const lisbon = toLisbonParts(startDt);
  console.log(`[BookingEngine] Normalized date: ${lisbon.dateStr}`);
  console.log(`[BookingEngine] Normalized time: ${lisbon.timeStr}`);
  console.log(`[BookingEngine] Timezone used: Europe/Lisbon`);

  // --- 5. Minimum advance validation ---
  if (bc.minimum_advance_minutes > 0) {
    const diffMinutes = (startDt.getTime() - Date.now()) / 60000;
    if (diffMinutes < bc.minimum_advance_minutes) {
      console.warn(`[BookingEngine] FAILED: minimum advance not met (${Math.round(diffMinutes)} < ${bc.minimum_advance_minutes})`);
      return { success: false, state: 'validation_error', message: `Antecedência mínima de ${bc.minimum_advance_minutes} minutos não respeitada.`, recovery_message: `Este agendamento precisa de pelo menos ${bc.minimum_advance_minutes} minutos de antecedência. Pode escolher outro horário?`, error_code: 'MINIMUM_ADVANCE_NOT_RESPECTED', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
    }
  }

  // --- 6. Business hours validation ---
  if (!bc.allow_outside_business_hours) {
    const { data: bhRows } = await supabase
      .from('scheduling_business_hours')
      .select('day_of_week, start_time, end_time, is_closed')
      .eq('empresa_id', company_id);

    if (bhRows && bhRows.length > 0) {
      const bh = bhRows.find((r: { day_of_week: number }) => r.day_of_week === lisbon.dayOfWeek);
      if (bh) {
        if (bh.is_closed) {
          console.warn('[BookingEngine] FAILED_OUTSIDE_HOURS: day is closed');
          return { success: false, state: 'outside_hours', message: 'O dia solicitado está encerrado.', recovery_message: 'O horário solicitado está fora do horário de funcionamento.', error_code: 'OUTSIDE_BUSINESS_HOURS', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
        }
        const [sh, sm] = bh.start_time.split(':').map(Number);
        const [eh, em] = bh.end_time.split(':').map(Number);
        const reqTotal = lisbon.hours * 60 + lisbon.minutes;
        const startTotal = sh * 60 + (sm || 0);
        const endTotal = eh * 60 + (em || 0);
        if (reqTotal < startTotal || reqTotal >= endTotal) {
          console.warn(`[BookingEngine] FAILED_OUTSIDE_HOURS: requested ${lisbon.timeStr}, allowed ${bh.start_time}–${bh.end_time}`);
          return { success: false, state: 'outside_hours', message: `Fora do horário (${bh.start_time}–${bh.end_time}).`, recovery_message: `O horário solicitado (${lisbon.timeStr}) está fora do horário de funcionamento (${bh.start_time}–${bh.end_time}). Pode escolher um horário dentro deste período?`, error_code: 'OUTSIDE_BUSINESS_HOURS', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
        }
        console.log('[BookingEngine] Business hours validated');
      }
    }
  }

  // --- 7. Idempotency check ---
  const { data: existingExec } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('execution_id', executionId)
    .maybeSingle();
  if (existingExec) {
    console.log(`[BookingEngine] DUPLICATE execution_id: ${executionId}`);
    return { success: false, state: 'error', message: 'Esta ação já foi executada.', error_code: 'DUPLICATE_EXECUTION', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  // --- 8. Credit check ---
  const currentMonth = new Date().toISOString().substring(0, 7);
  const { data: usage } = await supabase
    .from('credits_usage')
    .select('credits_used, credits_limit, extra_credits')
    .eq('empresa_id', company_id)
    .eq('month', currentMonth)
    .maybeSingle();
  if (usage) {
    const totalLimit = usage.credits_limit + (usage.extra_credits || 0);
    if (usage.credits_used + creditCost > totalLimit) {
      console.warn('[BookingEngine] BLOCKED: no credits');
      return { success: false, state: 'blocked', message: 'Créditos insuficientes.', error_code: 'NO_CREDITS', error_type: 'system', retryable: false, credits_consumed: 0, execution_id: executionId };
    }
  }

  // --- 9. Resolve service & resource ---
  // Service MUST be pre-resolved by chat-ai-response before reaching BookingEngine.
  // BookingEngine only validates and inserts — no semantic resolution.
  let effectiveServiceId = service_id;
  let resolvedResource: SchedulingResource | null = null;
  let resolvedService: { id: string; name?: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number } | null = null;

  if (!effectiveServiceId) {
    console.error('[BookingEngine] STRUCTURAL ERROR: service_id not pre-resolved');
    return { success: false, state: 'validation_error', message: 'Serviço não identificado.', recovery_message: 'Não consegui identificar o tipo de consulta. Pode indicar o tratamento pretendido?', error_code: 'SERVICE_NOT_RESOLVED', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  console.log(`[BookingEngine] Service input (pre-resolved): ${effectiveServiceId}`);

  const { data: svcData, error: svcError } = await supabase
    .from('scheduling_services')
    .select('id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', effectiveServiceId)
    .eq('status', 'active')
    .maybeSingle();

  if (svcError) {
    console.warn(`[BookingEngine] Service lookup error: ${svcError.message}`);
  }

  if (svcData) {
    resolvedService = svcData;
    console.log(`[BookingEngine] Validated service: ${svcData.id} (${svcData.name})`);
  } else {
    console.error(`[BookingEngine] Service ID ${effectiveServiceId} not found or inactive`);
    return { success: false, state: 'validation_error', message: 'Serviço não encontrado ou inativo.', recovery_message: 'O serviço selecionado não está disponível. Pode indicar outro?', error_code: 'SERVICE_NOT_FOUND', error_type: 'validation', retryable: false, credits_consumed: 0, execution_id: executionId };
  }

  console.log(`[BookingEngine] Final service used: ${effectiveServiceId}`);

  if (resource_id) {
    const { resources } = await resolveResources(supabase, company_id, resource_id);
    if (resources.length > 0) resolvedResource = resources[0];
  } else {
    const { resources } = await resolveResources(supabase, company_id);
    if (resources.length > 0) resolvedResource = resources[0];
  }

  // Validate resource
  if (resolvedResource) {
    if (resolvedResource.status !== 'active') {
      console.warn(`[BookingEngine] Resource ${resolvedResource.id} inactive`);
      return { success: false, state: 'error', message: 'O recurso selecionado não está disponível.', error_code: 'RESOURCE_UNAVAILABLE', error_type: 'system', retryable: false, credits_consumed: 0, execution_id: executionId };
    }
    if (resolvedResource.empresa_id !== company_id) {
      console.warn(`[BookingEngine] Resource empresa mismatch`);
      return { success: false, state: 'error', message: 'O recurso selecionado não está disponível.', error_code: 'RESOURCE_UNAVAILABLE', error_type: 'system', retryable: false, credits_consumed: 0, execution_id: executionId };
    }
    console.log(`[BookingEngine] Resource validated: ${resolvedResource.name}`);
  }

  // --- 10. Duration resolution ---
  const durationResult = resolveDuration(params.duration_minutes, resolvedResource, resolvedService);
  const durationMinutes = durationResult.duration_minutes;
  const endDt = new Date(startDt.getTime() + durationMinutes * 60000);

  // --- 11. Conflict check ---
  let resolvedResourceIds: string[] = [];
  let finalEndDt = endDt;

  console.log('[BookingEngine] Conflict check START');

  if (effectiveServiceId) {
    const bufferBefore = resolvedService?.buffer_before_minutes || 0;
    const bufferAfter = resolvedService?.buffer_after_minutes || 0;
    console.log(`[BookingEngine] Multi-resource mode: service=${effectiveServiceId}, duration=${durationMinutes}min, buffers=${bufferBefore}/${bufferAfter}`);
    console.log(`[BookingEngine] Time window: ${startDt.toISOString()} → ${new Date(startDt.getTime() + durationMinutes * 60000).toISOString()}`);
    const multiResult = await resolveMultiResourceAvailability(
      supabase, company_id, effectiveServiceId, startDt, durationMinutes, bufferBefore, bufferAfter
    );
    if (!multiResult.available) {
      const reason = multiResult.reason || 'SLOT_NOT_AVAILABLE';
      const msgMap: Record<string, string> = {
        'NO_RESOURCES_CONFIGURED': 'Não existem recursos configurados para este serviço.',
        'NO_VALID_RESOURCE_COMBINATION': 'Neste horário não temos disponibilidade simultânea de todos os recursos necessários.',
        'SLOT_NOT_AVAILABLE': 'O horário solicitado não está disponível.',
      };
      console.log(`[BookingEngine] FAILED_CONFLICT: ${reason}`);
      return { success: false, state: 'conflict', message: msgMap[reason] || msgMap['SLOT_NOT_AVAILABLE'], recovery_message: 'O horário selecionado já não está disponível. Pode indicar outro horário?', error_code: reason, error_type: 'conflict', retryable: true, credits_consumed: 0, execution_id: executionId };
    }
    resolvedResourceIds = multiResult.resourceIds;
    finalEndDt = multiResult.endDt;
    console.log(`[BookingEngine] Resource IDs resolved: [${resolvedResourceIds.join(', ')}]`);
    if (resolvedResourceIds.length > 0) {
      // Use first as primary resource
      resolvedResource = { id: resolvedResourceIds[0] } as SchedulingResource;
    }
  } else if (resolvedResource) {
    // Simple single-resource conflict check
    console.log(`[BookingEngine] Single-resource mode: resource=${resolvedResource.id}`);
    console.log(`[BookingEngine] Time window: ${startDt.toISOString()} → ${endDt.toISOString()}`);
    const conflictCheck = await validateSlotAvailability(
      supabase, company_id, resolvedResource.id, startDt.toISOString(), endDt.toISOString()
    );
    if (!conflictCheck.available) {
      console.log(`[BookingEngine] FAILED_CONFLICT: slot taken for resource ${resolvedResource.id}`);
      return { success: false, state: 'conflict', message: 'O horário selecionado já não está disponível.', recovery_message: 'O horário selecionado já não está disponível. Pode indicar outro horário da sua preferência?', error_code: 'CALENDAR_CONFLICT', error_type: 'conflict', retryable: true, credits_consumed: 0, execution_id: executionId };
    }
    resolvedResourceIds = [resolvedResource.id];
  } else {
    console.log('[BookingEngine] No resource resolved — proceeding without resource');
  }

  console.log(`[BookingEngine] Conflict result: NONE`);

  // --- 11b. FINAL PRE-COMMIT VALIDATION (race condition guard) ---
  // Re-check ALL resolved resources one final time right before INSERT
  for (const rid of resolvedResourceIds) {
    const bufBefore = resolvedService?.buffer_before_minutes || 0;
    const bufAfter = resolvedService?.buffer_after_minutes || 0;
    const effStart = new Date(startDt.getTime() - bufBefore * 60000);
    const effEnd = new Date(startDt.getTime() + durationMinutes * 60000 + bufAfter * 60000);
    const preCheck = await isResourceFreeShared(supabase, rid, effStart, effEnd);
    if (!preCheck.free) {
      console.warn(`[BookingEngine] PRE-COMMIT FAILED: resource ${rid} conflict with ${preCheck.conflictIds.join(', ')}`);
      return {
        success: false,
        state: 'conflict',
        message: 'Esse horário acabou de ficar indisponível.',
        recovery_message: 'O horário selecionado já não está disponível. Vou procurar alternativas.',
        error_code: 'SLOT_TAKEN_RACE_CONDITION',
        error_type: 'conflict',
        retryable: true,
        credits_consumed: 0,
        execution_id: executionId,
      };
    }
  }
  console.log('[BookingEngine] Pre-commit validation PASSED');

  // --- 12. Insert appointment (CONFIRMED) ---
  const primaryResourceId = resolvedResourceIds.length > 0 ? resolvedResourceIds[0] : null;

  try {
    const { data: appointment, error } = await supabase
      .from('agendamentos')
      .insert({
        empresa_id: company_id,
        agente_id: agent_id || null,
        resource_id: primaryResourceId,
        service_id: effectiveServiceId || null,
        data: lisbon.dateStr,
        hora: lisbon.timeStr,
        start_datetime: startDt.toISOString(),
        end_datetime: finalEndDt.toISOString(),
        duration_minutes: durationMinutes,
        cliente_nome: customer_name,
        cliente_telefone: customer_phone || null,
        notas: reason || null,
        estado: 'confirmado',
        scheduling_state: 'confirmed',
        external_execution_state: 'not_attempted',
        execution_id: executionId,
        credits_consumed: creditCost,
      })
      .select('id')
      .single();

    if (error) {
      // --- UNIQUE constraint violation (23505) → graceful recovery ---
      if (error.code === '23505') {
        console.warn(`[BookingGuard] UNIQUE slot violation intercepted: ${error.message}`);
        return {
          success: false,
          state: 'conflict',
          message: 'Esse horário acabou de ficar indisponível. Vou sugerir novas opções.',
          recovery_message: 'Esse horário acabou de ficar indisponível. Vou sugerir novas opções.',
          error_code: 'UNIQUE_SLOT_VIOLATION',
          error_type: 'conflict',
          retryable: true,
          credits_consumed: 0,
          execution_id: executionId,
        };
      }
      console.error('[BookingEngine] DB insert failed:', error);
      return { success: false, state: 'error', message: 'Falha ao criar agendamento.', error_code: 'UNKNOWN_ERROR', error_type: 'system', retryable: true, credits_consumed: 0, execution_id: executionId };
    }

    // Insert appointment_resources
    if (resolvedResourceIds.length > 0) {
      const rows = resolvedResourceIds.map((rid: string) => ({
        appointment_id: appointment.id,
        resource_id: rid,
      }));
      const { error: arError } = await supabase.from('appointment_resources').insert(rows);
      if (arError) console.warn('[BookingEngine] appointment_resources insert failed (non-blocking):', arError);
      else console.log(`[BookingEngine] Inserted ${rows.length} appointment_resources`);
    }

    // Log action
    try {
      await supabase.from('agent_action_logs').insert({
        empresa_id: company_id,
        agent_id: agent_id || null,
        conversation_id: conversation_id || null,
        action_type: 'create_appointment_real',
        action_data: { execution_id: executionId, resource_ids: resolvedResourceIds, duration_minutes: durationMinutes },
        actor_type: 'ai',
        outcome: 'success',
        credits_consumed: creditCost,
        execution_id: executionId,
        reference_id: appointment.id,
      });
    } catch (logErr) {
      console.warn('[BookingEngine] Action log failed (non-blocking):', logErr);
    }

    console.log(`[BOOKING_EXECUTION] SUCCESS appointment_id=${appointment.id}`);
    console.log(`[BOOKING_EXECUTION] SUCCESS_CONFIRMED appointment_id=${appointment.id} empresa_id=${company_id} resource_ids=[${resolvedResourceIds.join(', ')}]`);

    // Emit platform event (async, non-blocking) — fetch empresa name + email
    (async () => {
      try {
        let empresaNome = 'Empresa';
        let empresaEmail = '';
        const { data: emp } = await supabase.from('empresas').select('nome, email').eq('id', company_id).single();
        if (emp?.nome) empresaNome = emp.nome;
        if (emp?.email) empresaEmail = emp.email;

        // Use resolved service name (readable), not the UUID
        const serviceName = resolvedService?.name || '-';

        await emitPlatformEvent({
          type: 'booking_confirmed',
          empresa_id: company_id,
          conversation_id: conversation_id || undefined,
          payload: {
            client_name: customer_name,
            email: customer_email,
            service_name: serviceName,
            appointment_date: lisbon.dateStr,
            appointment_time: lisbon.timeStr,
            empresa_nome: empresaNome,
            empresa_email: empresaEmail,
          },
          supabase,
        });
      } catch (e) {
        console.warn('[BookingEngine] Platform event failed (non-blocking):', e);
      }
    })();

    return {
      success: true,
      state: 'confirmed',
      message: 'Agendamento confirmado.',
      appointment_id: appointment.id,
      start: startDt.toISOString(),
      end: finalEndDt.toISOString(),
      credits_consumed: creditCost,
      execution_id: executionId,
    };
  } catch (err) {
    console.error('[BookingEngine] Exception:', err);
    return { success: false, state: 'error', message: 'Erro interno ao criar agendamento.', error_code: 'UNKNOWN_ERROR', error_type: 'system', retryable: true, credits_consumed: 0, execution_id: executionId };
  }
}
