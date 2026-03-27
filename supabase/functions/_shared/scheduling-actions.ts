/**
 * Scheduling Actions - Production-Grade Backend Contracts v1.3
 * 
 * External Calendar Execution & Internal Fallback v1.0
 * 
 * EXECUTION FLOW (MANDATORY):
 * 1. Validate input
 * 2. Check Scheduling Capability
 * 3. Resolve calendar_mode from resource (NEVER from AI)
 * 4. Check credit availability (soft check)
 * 5. Idempotency check via execution_id
 * 6. Execute action (internal OR external via bridge)
 * 7. Commit state + credits ONLY on success
 * 8. Log outcome
 *
 * TIMEZONE: ALL date/time operations use Europe/Lisbon.
 * Server default timezone is NEVER relied upon.
 *
 * CALENDAR MODE RESOLUTION:
 * - If resource.calendar_type != 'internal' AND external_calendar_id IS NOT NULL → 'external'
 * - Otherwise → 'internal'
 * - AI agent NEVER knows or chooses the mode
 *
 * FALLBACK RULE:
 * - External failure does NOT auto-create internal appointment
 * - Returns fallback_to_request = true for agent to offer lead creation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  executeExternalAction,
  isBridgeConfigured,
  CreateCalendarEventPayload,
  UpdateCalendarEventPayload,
  DeleteCalendarEventPayload,
  ExternalActionResponse,
} from './external-actions-bridge.ts';
import {
  checkSchedulingCapability,
  type CapabilityCheckResult,
} from './scheduling-capabilities.ts';
import {
  getSchedulingCreditCost,
  generateExecutionId,
  type SchedulingActionType as CreditActionType,
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
import { toLisbonParts } from './timezone-utils.ts';

// =============================================
// Calendar Mode (resolved by backend, NEVER by AI)
// =============================================

export type CalendarMode = 'internal' | 'external';

export interface CalendarModeResolution {
  mode: CalendarMode;
  provider: string | null; // e.g. 'google_calendar'
  external_calendar_id: string | null;
  resource_id: string | null;
  resource_name: string | null;
}

/**
 * Resolve calendar mode from the resource configuration.
 * This is the SINGLE SOURCE OF TRUTH for execution routing.
 * AI agents NEVER decide this.
 */
function resolveCalendarMode(resource: SchedulingResource | null): CalendarModeResolution {
  if (!resource) {
    return { mode: 'internal', provider: null, external_calendar_id: null, resource_id: null, resource_name: null };
  }

  const isExternal = resource.calendar_type !== 'internal'
    && resource.calendar_type !== null
    && resource.external_calendar_id !== null
    && resource.external_calendar_id.trim().length > 0;

  if (isExternal) {
    // Map calendar_type to provider name for External Actions Bridge
    const providerMap: Record<string, string> = {
      google: 'google_calendar',
      google_calendar: 'google_calendar',
      outlook: 'outlook_calendar',
      outlook_calendar: 'outlook_calendar',
      calendly: 'calendly',
    };
    const provider = providerMap[resource.calendar_type!] || resource.calendar_type!;

    return {
      mode: 'external',
      provider,
      external_calendar_id: resource.external_calendar_id,
      resource_id: resource.id,
      resource_name: resource.name,
    };
  }

  return {
    mode: 'internal',
    provider: null,
    external_calendar_id: null,
    resource_id: resource.id,
    resource_name: resource.name,
  };
}

// =============================================
// Error Codes (Production-Grade Contract)
// =============================================

export type SchedulingErrorCode =
  | 'INTEGRATION_NOT_ACTIVE'
  | 'MISSING_EMAIL'
  | 'MISSING_REQUIRED_DATA'
  | 'MISSING_REQUIRED_FIELD'
  | 'MINIMUM_ADVANCE_NOT_RESPECTED'
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'INTERNAL_CALENDAR_DISABLED'
  | 'EXTERNAL_CALENDAR_DISABLED'
  | 'NO_CREDITS'
  | 'VALIDATION_ERROR'
  | 'CALENDAR_CONFLICT'
  | 'SLOT_NOT_AVAILABLE'
  | 'NO_RESOURCES_CONFIGURED'
  | 'NO_VALID_RESOURCE_COMBINATION'
  | 'AUTH_ERROR'
  | 'TEMPORARY_UNAVAILABLE'
  | 'APPOINTMENT_NOT_FOUND'
  | 'DUPLICATE_EXECUTION'
  | 'EXTERNAL_EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

// =============================================
// Internal Availability Engine v1.0
// =============================================

export interface InternalAvailabilityResult {
  available: boolean;
  resolved_resource_ids?: string[];
  start_datetime?: string;
  end_datetime?: string;
  reason?: 'NO_RESOURCES_CONFIGURED' | 'SLOT_NOT_AVAILABLE' | 'NO_VALID_RESOURCE_COMBINATION';
}

interface ServiceResourceLink {
  resource_id: string;
  is_required: boolean;
}

interface ResourceWithType {
  id: string;
  type: string;
  priority: number;
}

/**
 * Multi-Resource Availability Engine v2.0
 * 
 * Supports multiple required resources per appointment (e.g. room + doctor).
 * Resolves service → grouped resources by type → combination validation.
 * Returns the first conflict-free resource combination or structured failure.
 */
// deno-lint-ignore no-explicit-any
export async function checkInternalAvailability(
  supabase: any,
  empresa_id: string,
  service_id: string,
  requested_start: string,
): Promise<InternalAvailabilityResult> {
  // Step A: Resolve service
  const { data: service } = await supabase
    .from('scheduling_services')
    .select('id, duration_minutes, buffer_before_minutes, buffer_after_minutes, name')
    .eq('id', service_id)
    .eq('status', 'active')
    .single();

  const durationMinutes = service?.duration_minutes || 30;
  const bufferBefore = service?.buffer_before_minutes || 0;
  const bufferAfter = service?.buffer_after_minutes || 0;

  const startDt = new Date(requested_start);
  const effectiveStart = new Date(startDt.getTime() - bufferBefore * 60000);
  const effectiveEnd = new Date(startDt.getTime() + durationMinutes * 60000 + bufferAfter * 60000);
  const appointmentEnd = new Date(startDt.getTime() + durationMinutes * 60000);

  console.log(`[AvailabilityDebug] === checkInternalAvailability ===`);
  console.log(`[AvailabilityDebug] service: ${service?.name} (${service_id}), duration=${durationMinutes}m, buffers=${bufferBefore}/${bufferAfter}m`);
  console.log(`[AvailabilityDebug] requested_start=${requested_start}, effectiveStart=${effectiveStart.toISOString()}, effectiveEnd=${effectiveEnd.toISOString()}`);

  // Step B: Resolve eligible resources from service-resource links (with is_required)
  const { data: svcResLinks } = await supabase
    .from('scheduling_service_resources')
    .select('resource_id, is_required')
    .eq('service_id', service_id);

  const links: ServiceResourceLink[] = (svcResLinks || []) as ServiceResourceLink[];

  if (links.length === 0) {
    // Fallback: get all active resources for this company (single-resource mode)
    const { data: allResources } = await supabase
      .from('scheduling_resources')
      .select('id, type, priority, name')
      .eq('empresa_id', empresa_id)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (!allResources || allResources.length === 0) {
      console.warn('[AvailabilityDebug] No resources configured for company:', empresa_id);
      return { available: false, reason: 'NO_RESOURCES_CONFIGURED' };
    }

    console.log(`[AvailabilityDebug] Legacy mode — evaluating ${allResources.length} resources`);
    // Legacy single-resource mode: find first available
    for (const res of allResources as ResourceWithType[]) {
      const checkResult = await isResourceFreeShared(supabase, res.id, effectiveStart, effectiveEnd);
      console.log(`[AvailabilityDebug] resource=${res.id} (${(res as any).name}) → ${checkResult.free ? 'AVAILABLE' : 'BUSY'} conflicts=${checkResult.conflictIds.join(',')}`);
      if (checkResult.free) {
        return {
          available: true,
          resolved_resource_ids: [res.id],
          start_datetime: startDt.toISOString(),
          end_datetime: appointmentEnd.toISOString(),
        };
      }
    }
    console.log('[AvailabilityDebug] All resources busy — SLOT_NOT_AVAILABLE');
    return { available: false, reason: 'SLOT_NOT_AVAILABLE' };
  }

  // Step C: Fetch resource details for linked resources
  const linkedResourceIds = links.map(l => l.resource_id);
  const { data: resourceDetails } = await supabase
    .from('scheduling_resources')
    .select('id, type, priority')
    .in('id', linkedResourceIds)
    .eq('status', 'active')
    .order('priority', { ascending: true });

  if (!resourceDetails || resourceDetails.length === 0) {
    console.warn('[Availability Engine v2] No active resources found for linked IDs');
    return { available: false, reason: 'NO_RESOURCES_CONFIGURED' };
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

  // If no required resources, treat all as single-resource (backward compat)
  if (requiredByType.size === 0) {
    const allLinked = [...resourceMap.values()];
    for (const res of allLinked) {
      const r = await isResourceFreeShared(supabase, res.id, effectiveStart, effectiveEnd);
      if (r.free) {
        return {
          available: true,
          resolved_resource_ids: [res.id],
          start_datetime: startDt.toISOString(),
          end_datetime: appointmentEnd.toISOString(),
        };
      }
    }
    return { available: false, reason: 'SLOT_NOT_AVAILABLE' };
  }

  // Step D: Filter available resources per required type
  const availableByType = new Map<string, ResourceWithType[]>();
  for (const [type, resources] of requiredByType.entries()) {
    const available: ResourceWithType[] = [];
    for (const res of resources) {
      const r2 = await isResourceFreeShared(supabase, res.id, effectiveStart, effectiveEnd);
      if (r2.free) available.push(res);
    }
    if (available.length === 0) {
      console.warn(`[Availability Engine v2] No available resource of type '${type}' for ${requested_start}`);
      return { available: false, reason: 'NO_VALID_RESOURCE_COMBINATION' };
    }
    availableByType.set(type, available);
  }

  // Step E: Build first valid combination (pick first available from each type)
  const resolvedIds: string[] = [];
  for (const [type, resources] of availableByType.entries()) {
    resolvedIds.push(resources[0].id);
    console.log(`[Availability Engine v2] ✓ Type '${type}': selected resource ${resources[0].id}`);
  }

  // Optionally include available optional resources
  for (const optRes of optionalResources) {
    const r3 = await isResourceFreeShared(supabase, optRes.id, effectiveStart, effectiveEnd);
    if (r3.free) {
      resolvedIds.push(optRes.id);
      console.log(`[Availability Engine v2] ✓ Optional resource ${optRes.id} included`);
    }
  }

  console.log(`[Availability Engine v2] ✓ Combination resolved: ${resolvedIds.join(', ')}`);
  return {
    available: true,
    resolved_resource_ids: resolvedIds,
    start_datetime: startDt.toISOString(),
    end_datetime: appointmentEnd.toISOString(),
  };
}

// isResourceFree removed — now using shared isResourceFreeShared from scheduling-availability.ts

// =============================================
// Action Input/Output Contracts
// =============================================

export interface CreateAppointmentRealInput {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  resource_id?: string;
  service_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  start_datetime: string;
  end_datetime?: string;
  timezone?: string;
  reason?: string;
  execution_id?: string;
}

export interface CreateAppointmentRealOutputSuccess {
  success: true;
  appointment_id: string;
  execution_id: string;
  start: string;
  end: string;
  source: 'backend';
  calendar_mode: CalendarMode;
  message: string;
  credits_consumed: number;
}

export interface CreateAppointmentRealOutputFailure {
  success: false;
  error_code: SchedulingErrorCode;
  error_message: string;
  execution_id?: string;
  calendar_mode?: CalendarMode;
  fallback_to_request?: boolean;
  credits_consumed: 0;
}

export type CreateAppointmentRealOutput =
  | CreateAppointmentRealOutputSuccess
  | CreateAppointmentRealOutputFailure;

// =============================================
// Reschedule Input/Output
// =============================================

export interface RescheduleAppointmentInput {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  appointment_id: string;
  new_start_datetime: string;
  new_end_datetime?: string;
  notes?: string;
  execution_id?: string;
}

export interface RescheduleAppointmentOutput {
  success: boolean;
  execution_id?: string;
  error_code?: SchedulingErrorCode;
  error_message?: string;
  calendar_mode?: CalendarMode;
  fallback_to_request?: boolean;
  message: string;
  credits_consumed: number;
}

// =============================================
// Cancel Input/Output
// =============================================

export interface CancelAppointmentInput {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  appointment_id: string;
  reason?: string;
  execution_id?: string;
}

export interface CancelAppointmentOutput {
  success: boolean;
  execution_id?: string;
  error_code?: SchedulingErrorCode;
  error_message?: string;
  calendar_mode?: CalendarMode;
  fallback_to_request?: boolean;
  message: string;
  credits_consumed: number;
}

// =============================================
// Request Input/Output Contracts
// =============================================

export interface CreateAppointmentRequestInput {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  customer_name?: string;
  customer_email: string;
  customer_phone?: string;
  preferred_date?: string;
  preferred_time?: string;
  reason?: string;
}

export interface CreateAppointmentRequestOutput {
  success: boolean;
  request_id?: string;
  message: string;
  error_code?: SchedulingErrorCode;
  credits_consumed: number;
}

// =============================================
// Action Logging Types
// =============================================

export interface SchedulingActionLog {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  resource_id?: string;
  action_name: string;
  execution_id?: string;
  input_data: Record<string, unknown>;
  outcome: 'success' | 'failed' | 'blocked';
  error_code?: SchedulingErrorCode;
  credits_consumed: number;
  timestamp: string;
  calendar_mode?: CalendarMode;
}

// =============================================
// Validation Functions
// =============================================

export function validateCreateAppointmentRealInput(
  input: Partial<CreateAppointmentRealInput>
): { valid: boolean; error_code?: SchedulingErrorCode; error_message?: string } {
  if (!input.customer_email?.trim()) {
    return { valid: false, error_code: 'MISSING_EMAIL', error_message: 'Email is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.customer_email)) {
    return { valid: false, error_code: 'VALIDATION_ERROR', error_message: 'Invalid email format.' };
  }
  if (!input.company_id) {
    return { valid: false, error_code: 'VALIDATION_ERROR', error_message: 'Company ID is required.' };
  }
  if (!input.customer_name?.trim()) {
    return { valid: false, error_code: 'MISSING_REQUIRED_DATA', error_message: 'Customer name is required.' };
  }
  if (!input.start_datetime) {
    return { valid: false, error_code: 'MISSING_REQUIRED_DATA', error_message: 'Date and time are required.' };
  }
  try {
    const d = new Date(input.start_datetime);
    if (isNaN(d.getTime())) throw new Error();
  } catch {
    return { valid: false, error_code: 'VALIDATION_ERROR', error_message: 'Invalid date format.' };
  }
  return { valid: true };
}

// =============================================
// Idempotency Check
// =============================================

// deno-lint-ignore no-explicit-any
async function checkIdempotency(supabase: any, executionId: string): Promise<{
  isDuplicate: boolean;
  existingAppointment?: Record<string, unknown>;
}> {
  const { data } = await supabase
    .from('agendamentos')
    .select('id, scheduling_state, external_execution_state, credits_consumed')
    .eq('execution_id', executionId)
    .maybeSingle();

  if (data) {
    return { isDuplicate: true, existingAppointment: data };
  }
  return { isDuplicate: false };
}

// =============================================
// Check Calendar Integration Status (legacy - kept for getSchedulingStatus)
// =============================================

// deno-lint-ignore no-explicit-any
export async function checkCalendarIntegrationActive(
  supabase: any,
  companyId: string
): Promise<{ active: boolean; provider?: string; error?: string }> {
  try {
    const { data: sources, error } = await supabase
      .from('external_data_sources')
      .select('id, source_type, source_name, is_active')
      .eq('empresa_id', companyId)
      .in('source_type', ['google_calendar', 'outlook_calendar', 'calendly'])
      .eq('is_active', true);

    if (error) {
      console.error('[Scheduling] Error checking calendar integration:', error);
      return { active: false, error: 'Failed to check calendar integration' };
    }
    if (sources && sources.length > 0) {
      return { active: true, provider: sources[0].source_type };
    }
    return { active: false };
  } catch (err) {
    console.error('[Scheduling] Exception checking calendar:', err);
    return { active: false, error: 'System error checking calendar' };
  }
}

// =============================================
// Credit Check
// =============================================

// deno-lint-ignore no-explicit-any
export async function checkCreditsAvailable(
  supabase: any,
  companyId: string,
  requiredCredits: number
): Promise<{ available: boolean; remaining?: number }> {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const { data: usage } = await supabase
      .from('credits_usage')
      .select('credits_used, credits_limit, extra_credits')
      .eq('empresa_id', companyId)
      .eq('month', currentMonth)
      .maybeSingle();

    if (!usage) return { available: true, remaining: 1000 };
    const totalLimit = usage.credits_limit + (usage.extra_credits || 0);
    const remaining = totalLimit - usage.credits_used;
    return { available: remaining >= requiredCredits, remaining };
  } catch (err) {
    console.error('[Scheduling] Error checking credits:', err);
    return { available: true }; // fail open for credits
  }
}

// =============================================
// Main Action: create_appointment_real
// =============================================

// deno-lint-ignore no-explicit-any
export async function executeCreateAppointmentReal(
  supabase: any,
  input: CreateAppointmentRealInput
): Promise<CreateAppointmentRealOutput> {
  const timestamp = new Date().toISOString();
  const executionId = input.execution_id || generateExecutionId('create_appointment', input.company_id);
  const creditCost = getSchedulingCreditCost('create_appointment');

  // === EXECUTION PREVENTION GUARD ===
  // This function is globally disabled and must never execute
  if (true) {
    console.log('[EXECUTION_BLOCKED] executeCreateAppointmentReal is disabled');
    return {
      success: false,
      error_code: 'TOOL_DISABLED',
      error_message: 'Appointment creation is currently disabled.',
      execution_id: executionId,
      fallback_to_request: true,
      credits_consumed: 0,
    };
  }

  console.log('[Scheduling] Executing create_appointment_real:', {
    company_id: input.company_id,
    execution_id: executionId,
  });

  // Step 0: Check scheduling capability
  const capCheck = await checkSchedulingCapability(supabase, input.company_id, 'create_appointment');
  if (!capCheck.allowed) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'INTEGRATION_NOT_ACTIVE', credits_consumed: 0, timestamp,
    });
    return { success: false, error_code: 'INTEGRATION_NOT_ACTIVE', error_message: 'Creating appointments is not enabled.', execution_id: executionId, fallback_to_request: true, credits_consumed: 0 };
  }

  // Step 0b: Fetch booking_configuration for enforcement
  const { data: bookingConfig } = await supabase
    .from('booking_configuration')
    .select('*')
    .eq('empresa_id', input.company_id)
    .maybeSingle();

  const bc = bookingConfig || {
    require_name: true,
    require_email: true,
    require_phone: false,
    require_reason: true,
    allow_same_day_booking: true,
    allow_outside_business_hours: false,
    minimum_advance_minutes: 0,
    allow_internal_calendar: true,
    allow_external_calendar: false,
  };

  // Step 0c: Validate required fields per booking_configuration
  if (bc.require_name && !input.customer_name?.trim()) {
    console.warn('[Scheduling] Booking enforcement: missing required name');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'MISSING_REQUIRED_FIELD', credits_consumed: 0, timestamp });
    return { success: false, error_code: 'MISSING_REQUIRED_FIELD' as SchedulingErrorCode, error_message: 'Nome é obrigatório para agendamento.', execution_id: executionId, credits_consumed: 0 };
  }
  if (bc.require_email && !input.customer_email?.trim()) {
    console.warn('[Scheduling] Booking enforcement: missing required email');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'MISSING_REQUIRED_FIELD', credits_consumed: 0, timestamp });
    return { success: false, error_code: 'MISSING_REQUIRED_FIELD' as SchedulingErrorCode, error_message: 'Email é obrigatório para agendamento.', execution_id: executionId, credits_consumed: 0 };
  }
  if (bc.require_phone && !input.customer_phone?.trim()) {
    console.warn('[Scheduling] Booking enforcement: missing required phone');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'MISSING_REQUIRED_FIELD', credits_consumed: 0, timestamp });
    return { success: false, error_code: 'MISSING_REQUIRED_FIELD' as SchedulingErrorCode, error_message: 'Telefone é obrigatório para agendamento.', execution_id: executionId, credits_consumed: 0 };
  }
  if (bc.require_reason && !input.reason?.trim()) {
    console.warn('[Scheduling] Booking enforcement: missing required field — reason');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'MISSING_REQUIRED_FIELD', credits_consumed: 0, timestamp });
    return { success: false, error_code: 'MISSING_REQUIRED_FIELD' as SchedulingErrorCode, error_message: 'Motivo do agendamento é obrigatório.', execution_id: executionId, credits_consumed: 0 };
  }

  // Timezone helper: use shared utility
  function toLisbonTime(date: Date) {
    const parts = toLisbonParts(date);
    console.log(`[Scheduling] Normalized date: ${parts.dateStr}`);
    console.log(`[Scheduling] Normalized time: ${parts.timeStr}`);
    console.log(`[Scheduling] Timezone used: Europe/Lisbon`);
    return parts;
  }

  // Step 0d: Validate minimum advance time
  console.log(`[Scheduling] Advance rule active: ${bc.minimum_advance_minutes} minutes`);
  if (bc.minimum_advance_minutes > 0 && input.start_datetime) {
    const nowLisbon = new Date();
    const requestedStart = new Date(input.start_datetime);
    const diffMs = requestedStart.getTime() - nowLisbon.getTime();
    const diffMinutes = diffMs / 60000;
    if (diffMinutes < bc.minimum_advance_minutes) {
      console.warn(`[Scheduling] Booking enforcement: minimum advance not met (${Math.round(diffMinutes)} < ${bc.minimum_advance_minutes})`);
      await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'MINIMUM_ADVANCE_NOT_RESPECTED' as SchedulingErrorCode, credits_consumed: 0, timestamp });
      return { success: false, error_code: 'MINIMUM_ADVANCE_NOT_RESPECTED' as SchedulingErrorCode, error_message: `Este agendamento precisa de pelo menos ${bc.minimum_advance_minutes} minutos de antecedência.`, execution_id: executionId, credits_consumed: 0 };
    }
  }

  // Step 0e: Validate business hours (using Europe/Lisbon timezone)
  if (!bc.allow_outside_business_hours && input.start_datetime) {
    const requestedStart = new Date(input.start_datetime);
    const lisbon = toLisbonTime(requestedStart);
    const { data: bhRows } = await supabase
      .from('scheduling_business_hours')
      .select('day_of_week, start_time, end_time, is_closed')
      .eq('empresa_id', input.company_id);

    if (bhRows && bhRows.length > 0) {
      const bh = bhRows.find((r: { day_of_week: number }) => r.day_of_week === lisbon.dayOfWeek);
      if (bh) {
        if (bh.is_closed) {
          console.warn('[Scheduling] Booking enforcement: requested day is closed');
          await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'OUTSIDE_BUSINESS_HOURS' as SchedulingErrorCode, credits_consumed: 0, timestamp });
          return { success: false, error_code: 'OUTSIDE_BUSINESS_HOURS' as SchedulingErrorCode, error_message: 'O horário solicitado está fora do horário de funcionamento.', execution_id: executionId, credits_consumed: 0 };
        }
        const [sh, sm] = bh.start_time.split(':').map(Number);
        const [eh, em] = bh.end_time.split(':').map(Number);
        const reqTotal = lisbon.hours * 60 + lisbon.minutes;
        const startTotal = sh * 60 + (sm || 0);
        const endTotal = eh * 60 + (em || 0);
        if (reqTotal < startTotal || reqTotal >= endTotal) {
          console.warn(`[Scheduling] Outside business hours: requested ${String(lisbon.hours).padStart(2,'0')}:${String(lisbon.minutes).padStart(2,'0')}, allowed ${bh.start_time}–${bh.end_time}`);
          await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'OUTSIDE_BUSINESS_HOURS' as SchedulingErrorCode, credits_consumed: 0, timestamp });
          return { success: false, error_code: 'OUTSIDE_BUSINESS_HOURS' as SchedulingErrorCode, error_message: `O horário solicitado (${lisbon.timeStr}) está fora do horário de funcionamento (${bh.start_time}–${bh.end_time}).`, execution_id: executionId, credits_consumed: 0 };
        }
      }
    }
  }

  // Step 1: Validate input (basic format validation)
  const validation = validateCreateAppointmentRealInput(input);
  if (!validation.valid) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'failed', error_code: validation.error_code, credits_consumed: 0, timestamp,
    });
    return { success: false, error_code: validation.error_code!, error_message: validation.error_message!, execution_id: executionId, fallback_to_request: validation.error_code !== 'MISSING_EMAIL', credits_consumed: 0 };
  }

  // Step 2: Check service_scheduling_enabled
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas').select('id, service_scheduling_enabled').eq('id', input.company_id).single();

  if (empresaError || !empresa || !empresa.service_scheduling_enabled) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'INTEGRATION_NOT_ACTIVE', credits_consumed: 0, timestamp,
    });
    return { success: false, error_code: 'INTEGRATION_NOT_ACTIVE', error_message: 'Scheduling service is not enabled.', execution_id: executionId, fallback_to_request: true, credits_consumed: 0 };
  }

  // Step 3: Idempotency check
  const idempotencyCheck = await checkIdempotency(supabase, executionId);
  if (idempotencyCheck.isDuplicate) {
    console.log(`[Scheduling] DUPLICATE execution_id: ${executionId}, returning previous result`);
    return {
      success: false,
      error_code: 'DUPLICATE_EXECUTION',
      error_message: 'This action has already been executed.',
      execution_id: executionId,
      credits_consumed: 0,
    };
  }

  // Step 4: Check credits
  const creditCheck = await checkCreditsAvailable(supabase, input.company_id, creditCost);
  if (!creditCheck.available) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'NO_CREDITS', credits_consumed: 0, timestamp,
    });
    return { success: false, error_code: 'NO_CREDITS', error_message: 'Insufficient credits.', execution_id: executionId, fallback_to_request: true, credits_consumed: 0 };
  }

  // Step 5: Resolve resource & calendar mode
  let resolvedResource: SchedulingResource | null = null;
  let resolvedService: { id: string; name?: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number } | null = null;

  // Resolve service if provided
  if (input.service_id) {
    const { data: svcData } = await supabase
      .from('scheduling_services')
      .select('id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes')
      .eq('id', input.service_id)
      .eq('status', 'active')
      .single();
    if (svcData) resolvedService = svcData;
  }

  if (input.resource_id) {
    const { resources } = await resolveResources(supabase, input.company_id, input.resource_id);
    if (resources.length > 0) {
      resolvedResource = resources[0];
    }
  } else {
    // Auto-select first active resource if none specified
    const { resources } = await resolveResources(supabase, input.company_id);
    if (resources.length > 0) {
      resolvedResource = resources[0];
    }
  }

  // Step 5-validation: Validate resource status and empresa match
  if (resolvedResource) {
    if (resolvedResource.status !== 'active') {
      console.warn(`[Scheduling] Resource ${resolvedResource.id} is ${resolvedResource.status}, rejecting`);
      await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'RESOURCE_UNAVAILABLE', credits_consumed: 0, timestamp });
      return { success: false, error_code: 'RESOURCE_UNAVAILABLE' as SchedulingErrorCode, error_message: 'O recurso selecionado não está disponível.', execution_id: executionId, credits_consumed: 0 };
    }
    if (resolvedResource.empresa_id !== input.company_id) {
      console.warn(`[Scheduling] Resource empresa mismatch: ${resolvedResource.empresa_id} vs ${input.company_id}`);
      await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'failed', error_code: 'RESOURCE_UNAVAILABLE', credits_consumed: 0, timestamp });
      return { success: false, error_code: 'RESOURCE_UNAVAILABLE' as SchedulingErrorCode, error_message: 'O recurso selecionado não está disponível.', execution_id: executionId, credits_consumed: 0 };
    }
  }

  // CALENDAR MODE RESOLUTION (backend-only, AI never decides)
  const calendarResolution = resolveCalendarMode(resolvedResource);

  // Step 5a-enforcement: Validate calendar mode against booking_configuration
  if (calendarResolution.mode === 'internal' && !bc.allow_internal_calendar) {
    console.warn('[Scheduling] Booking enforcement: internal calendar disabled');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'blocked', error_code: 'INTERNAL_CALENDAR_DISABLED' as SchedulingErrorCode, credits_consumed: 0, timestamp, calendar_mode: 'internal' });
    return { success: false, error_code: 'INTERNAL_CALENDAR_DISABLED' as SchedulingErrorCode, error_message: 'Agendamento interno não está permitido para esta empresa.', execution_id: executionId, calendar_mode: 'internal', credits_consumed: 0 };
  }
  if (calendarResolution.mode === 'external' && !bc.allow_external_calendar) {
    console.warn('[Scheduling] Booking enforcement: external calendar disabled');
    await logSchedulingAction(supabase, { company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id, action_name: 'create_appointment_real', execution_id: executionId, input_data: input as unknown as Record<string, unknown>, outcome: 'blocked', error_code: 'EXTERNAL_CALENDAR_DISABLED' as SchedulingErrorCode, credits_consumed: 0, timestamp, calendar_mode: 'external' });
    return { success: false, error_code: 'EXTERNAL_CALENDAR_DISABLED' as SchedulingErrorCode, error_message: 'Agendamento externo não está permitido para esta empresa.', execution_id: executionId, calendar_mode: 'external', credits_consumed: 0 };
  }

  // Step 5b: Resolve duration (service > resource > system default)
  const durationResult = resolveDuration(undefined, resolvedResource, resolvedService);
  const resolvedDurationMinutes = durationResult.duration_minutes;

  const startDate = new Date(input.start_datetime);
  let endDate = input.end_datetime
    ? new Date(input.end_datetime)
    : new Date(startDate.getTime() + resolvedDurationMinutes * 60 * 1000);

  // Step 5c: Conflict check (if resource assigned)
  if (calendarResolution.resource_id) {
    const conflictCheck = await validateSlotAvailability(
      supabase, input.company_id, calendarResolution.resource_id,
      startDate.toISOString(), endDate.toISOString()
    );
    if (!conflictCheck.available) {
      await logSchedulingAction(supabase, {
        company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
        resource_id: calendarResolution.resource_id,
        action_name: 'create_appointment_real', execution_id: executionId,
        input_data: input as unknown as Record<string, unknown>,
        outcome: 'failed', error_code: 'CALENDAR_CONFLICT', credits_consumed: 0, timestamp,
        calendar_mode: calendarResolution.mode,
      });
      return {
        success: false, error_code: 'CALENDAR_CONFLICT',
        error_message: 'The selected time slot conflicts with an existing appointment.',
        execution_id: executionId, calendar_mode: calendarResolution.mode,
        fallback_to_request: false, credits_consumed: 0,
      };
    }
  }

  // Use Europe/Lisbon timezone for stored date/time fields
  const lisbonComponents = toLisbonTime(startDate);
  const dateStr = lisbonComponents.dateStr;
  const timeStr = lisbonComponents.timeStr;

  // Step 6: Execute based on calendar_mode
  let externalCalendarId: string | null = null;
  let externalCalendarType: string | null = null;
  let externalExecutionState: ExternalExecutionState = 'not_attempted';
  let schedulingState: SchedulingState = 'requested';

  // === ENGINE DEBUG MODE ===
  console.log(`[Scheduling] Checking conflicts`);
  console.log(`[Scheduling] Resource selected: ${calendarResolution.resource_name || 'none'}`);
  console.log(`[Scheduling] Calendar mode: ${calendarResolution.mode}`);
  console.log(`[Scheduling] Duration: ${resolvedDurationMinutes} min`);

  if (calendarResolution.mode === 'external') {
    // ===== EXTERNAL EXECUTION (via External Actions Bridge) =====
    console.log(`[Scheduling] External execution via ${calendarResolution.provider}`);

    // Calendar provider: title = service name, description = reason
    const serviceName = resolvedService ? (resolvedService as any).name : 'Appointment';
    const calendarPayload: CreateCalendarEventPayload = {
      title: serviceName || `Appointment - ${input.customer_name}`,
      description: input.reason || '',
      start_datetime: startDate.toISOString(),
      end_datetime: endDate.toISOString(),
      timezone: input.timezone || 'Europe/Lisbon',
      attendee_email: input.customer_email,
      attendee_name: input.customer_name,
      send_notifications: true,
    };

    const externalResult = await executeExternalAction(supabase, {
      action_type: 'create_calendar_event',
      provider: calendarResolution.provider as 'google_calendar' | 'outlook_calendar',
      company_id: input.company_id,
      conversation_id: input.conversation_id || null,
      agent_id: input.agent_id || null,
      payload: { ...calendarPayload, resource_id: calendarResolution.resource_id, execution_id: executionId },
    });

    if (!externalResult.success) {
      externalExecutionState = 'failed';
      // MANDATORY FALLBACK: Do NOT create internal appointment
      await logSchedulingAction(supabase, {
        company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
        resource_id: calendarResolution.resource_id || undefined,
        action_name: 'create_appointment_real', execution_id: executionId,
        input_data: { ...input as unknown as Record<string, unknown>, external_error: externalResult.error_code },
        outcome: 'failed', error_code: 'EXTERNAL_EXECUTION_FAILED', credits_consumed: 0, timestamp,
        calendar_mode: 'external',
      });
      return {
        success: false,
        error_code: 'EXTERNAL_EXECUTION_FAILED',
        error_message: externalResult.error_message || 'Failed to create calendar event in external system.',
        execution_id: executionId,
        calendar_mode: 'external',
        fallback_to_request: true, // Agent should offer lead/request creation
        credits_consumed: 0,
      };
    }

    // External success
    externalCalendarId = externalResult.external_reference_id;
    externalCalendarType = calendarResolution.provider;
    externalExecutionState = 'success';
    schedulingState = 'confirmed'; // ONLY confirmed on external success
    console.log(`[Scheduling] External calendar event created: ${externalCalendarId}`);
  } else {
    // ===== INTERNAL EXECUTION =====
    console.log('[Scheduling] Internal calendar execution');

    // Internal Availability Engine v2.0: multi-resource combination resolution
    let resolvedResourceIds: string[] = [];
    if (input.service_id) {
      const availResult = await checkInternalAvailability(
        supabase, input.company_id, input.service_id, input.start_datetime
      );

      if (!availResult.available) {
        const errCode = (availResult.reason || 'SLOT_NOT_AVAILABLE') as SchedulingErrorCode;
        const errMsgMap: Record<string, string> = {
          'NO_RESOURCES_CONFIGURED': 'Não existem recursos configurados para este serviço.',
          'NO_VALID_RESOURCE_COMBINATION': 'Neste horário não temos disponibilidade simultânea de todos os recursos necessários.',
          'SLOT_NOT_AVAILABLE': 'O horário solicitado não está disponível. Pode escolher outro horário?',
        };
        const errMsg = errMsgMap[errCode] || errMsgMap['SLOT_NOT_AVAILABLE'];
        console.warn(`[Scheduling] Availability engine v2: ${errCode}`);
        await logSchedulingAction(supabase, {
          company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
          action_name: 'create_appointment_real', execution_id: executionId,
          input_data: input as unknown as Record<string, unknown>,
          outcome: 'failed', error_code: errCode, credits_consumed: 0, timestamp,
          calendar_mode: 'internal',
        });
        return {
          success: false, error_code: errCode,
          error_message: errMsg, execution_id: executionId,
          calendar_mode: 'internal', fallback_to_request: false, credits_consumed: 0,
        };
      }

      // Override resource and end_datetime with engine results
      resolvedResourceIds = availResult.resolved_resource_ids || [];
      if (resolvedResourceIds.length > 0) {
        // Use first resource as primary (backward compat with agendamentos.resource_id)
        calendarResolution.resource_id = resolvedResourceIds[0];
      }
      if (availResult.end_datetime) {
        endDate = new Date(availResult.end_datetime);
      }
    }

    // MANDATORY RULE: Internal booking that passes all validations = CONFIRMED
    // Only use 'requested' for: force_manual_confirmation, real conflict, resource inactive,
    // outside business hours, DB failure, or technical error.
    schedulingState = 'confirmed';
    externalExecutionState = 'not_attempted';
    console.log('[Scheduling] Creating confirmed appointment (internal calendar, all checks passed)');
  }

  // Step 7: Create appointment in database
  try {
    const { data: appointment, error } = await supabase
      .from('agendamentos')
      .insert({
        empresa_id: input.company_id,
        agente_id: input.agent_id || null,
        resource_id: calendarResolution.resource_id,
        service_id: input.service_id || null,
        data: dateStr,
        hora: timeStr,
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        duration_minutes: resolvedDurationMinutes,
        cliente_nome: input.customer_name,
        cliente_telefone: input.customer_phone || null,
        notas: input.reason || null,
        estado: schedulingState === 'confirmed' ? 'confirmado' : 'pendente',
        scheduling_state: schedulingState,
        external_execution_state: externalExecutionState,
        external_calendar_id: externalCalendarId,
        external_calendar_type: externalCalendarType,
        execution_id: executionId,
        credits_consumed: creditCost,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Scheduling] Failed to create appointment:', error);
      await logSchedulingAction(supabase, {
        company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
        action_name: 'create_appointment_real', execution_id: executionId,
        input_data: input as unknown as Record<string, unknown>,
        outcome: 'failed', error_code: 'UNKNOWN_ERROR', credits_consumed: 0, timestamp,
        calendar_mode: calendarResolution.mode,
      });
      return { success: false, error_code: 'UNKNOWN_ERROR', error_message: 'Failed to create appointment.', execution_id: executionId, calendar_mode: calendarResolution.mode, fallback_to_request: true, credits_consumed: 0 };
    }

    // Insert into appointment_resources (v2 multi-resource)
    const appointmentId = appointment.id;
    const allResourceIds = resolvedResourceIds && resolvedResourceIds.length > 0
      ? resolvedResourceIds
      : (calendarResolution.resource_id ? [calendarResolution.resource_id] : []);

    if (allResourceIds.length > 0) {
      const resourceRows = allResourceIds.map((rid: string) => ({
        appointment_id: appointmentId,
        resource_id: rid,
      }));
      const { error: arError } = await supabase
        .from('appointment_resources')
        .insert(resourceRows);
      if (arError) {
        console.warn('[Scheduling] Failed to insert appointment_resources (non-blocking):', arError);
      } else {
        console.log(`[Scheduling] ✓ Inserted ${allResourceIds.length} appointment_resources for ${appointmentId}`);
      }
    }

    // SUCCESS: Log and consume credits
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      resource_id: calendarResolution.resource_id || undefined,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'success', credits_consumed: creditCost, timestamp,
      calendar_mode: calendarResolution.mode,
    });
    await registerSchedulingCredits(supabase, input.company_id, appointment.id, creditCost);

    console.log(`[Scheduling] Conflict result: NONE`);
    console.log(`[Scheduling] Final decision: ${schedulingState === 'confirmed' ? 'SUCCESS_CONFIRMED' : 'SUCCESS_REQUESTED'}`);
    console.log(`[Scheduling] ✓ Appointment created: ${appointment.id} (mode: ${calendarResolution.mode}, exec: ${executionId})`);
    return {
      success: true, appointment_id: appointment.id, execution_id: executionId,
      start: startDate.toISOString(), end: endDate.toISOString(),
      source: 'backend', calendar_mode: calendarResolution.mode,
      message: schedulingState === 'confirmed'
        ? `Appointment confirmed for ${dateStr} at ${timeStr}.`
        : `Appointment request registered for ${dateStr} at ${timeStr}. Awaiting confirmation.`,
      credits_consumed: creditCost,
    };
  } catch (err) {
    console.error('[Scheduling] Exception creating appointment:', err);
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_real', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'failed', error_code: 'TEMPORARY_UNAVAILABLE', credits_consumed: 0, timestamp,
      calendar_mode: calendarResolution.mode,
    });
    return { success: false, error_code: 'TEMPORARY_UNAVAILABLE', error_message: 'System temporarily unavailable.', execution_id: executionId, calendar_mode: calendarResolution.mode, fallback_to_request: true, credits_consumed: 0 };
  }
}

// =============================================
// Action: reschedule_appointment
// =============================================

// deno-lint-ignore no-explicit-any
export async function executeRescheduleAppointment(
  supabase: any,
  input: RescheduleAppointmentInput
): Promise<RescheduleAppointmentOutput> {
  const timestamp = new Date().toISOString();
  const executionId = input.execution_id || generateExecutionId('reschedule_appointment', input.company_id);
  const creditCost = getSchedulingCreditCost('reschedule_appointment');

  console.log('[Scheduling] Executing reschedule_appointment:', { appointment_id: input.appointment_id, execution_id: executionId });

  // Step 0: Capability check
  const capCheck = await checkSchedulingCapability(supabase, input.company_id, 'reschedule_appointment');
  if (!capCheck.allowed) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'reschedule_appointment', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'INTEGRATION_NOT_ACTIVE', credits_consumed: 0, timestamp,
    });
    return { success: false, execution_id: executionId, error_code: 'INTEGRATION_NOT_ACTIVE', error_message: 'Rescheduling is not enabled for this company.', message: 'Rescheduling is not enabled.', credits_consumed: 0 };
  }

  // Step 1: Idempotency
  const idempCheck = await checkIdempotency(supabase, executionId);
  if (idempCheck.isDuplicate) {
    return { success: false, execution_id: executionId, error_code: 'DUPLICATE_EXECUTION', error_message: 'Already executed.', message: 'This action has already been executed.', credits_consumed: 0 };
  }

  // Step 2: Find appointment
  const { data: appointment, error: fetchErr } = await supabase
    .from('agendamentos')
    .select('*')
    .eq('id', input.appointment_id)
    .eq('empresa_id', input.company_id)
    .single();

  if (fetchErr || !appointment) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'reschedule_appointment', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'failed', error_code: 'APPOINTMENT_NOT_FOUND', credits_consumed: 0, timestamp,
    });
    return { success: false, execution_id: executionId, error_code: 'APPOINTMENT_NOT_FOUND', error_message: 'Appointment not found.', message: 'Appointment not found.', credits_consumed: 0 };
  }

  // Step 3: Cannot reschedule cancelled/failed
  if (appointment.scheduling_state === 'cancelled' || appointment.scheduling_state === 'failed') {
    return { success: false, execution_id: executionId, error_code: 'VALIDATION_ERROR', error_message: `Cannot reschedule a ${appointment.scheduling_state} appointment.`, message: `Cannot reschedule.`, credits_consumed: 0 };
  }

  // Step 4: Credit check
  const creditCheck = await checkCreditsAvailable(supabase, input.company_id, creditCost);
  if (!creditCheck.available) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'reschedule_appointment', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'NO_CREDITS', credits_consumed: 0, timestamp,
    });
    return { success: false, execution_id: executionId, error_code: 'NO_CREDITS', error_message: 'Insufficient credits.', message: 'Insufficient credits.', credits_consumed: 0 };
  }

  // Step 5: Resolve calendar mode from RESOURCE (not from appointment legacy fields)
  let resolvedResource: SchedulingResource | null = null;
  if (appointment.resource_id) {
    const { resources } = await resolveResources(supabase, input.company_id, appointment.resource_id);
    if (resources.length > 0) resolvedResource = resources[0];
  }
  const calendarResolution = resolveCalendarMode(resolvedResource);
  console.log(`[Scheduling] Reschedule calendar mode: ${calendarResolution.mode}`);

  // Step 5b: Resolve new end time
  const durationResult = resolveDuration(undefined, resolvedResource);
  const newStartDate = new Date(input.new_start_datetime);
  const newEndDate = input.new_end_datetime
    ? new Date(input.new_end_datetime)
    : new Date(newStartDate.getTime() + durationResult.duration_minutes * 60 * 1000);

  // Step 5c: Conflict check
  if (calendarResolution.resource_id) {
    const conflictCheck = await validateSlotAvailability(
      supabase, input.company_id, calendarResolution.resource_id,
      newStartDate.toISOString(), newEndDate.toISOString(),
      input.appointment_id // exclude self
    );
    if (!conflictCheck.available) {
      return {
        success: false, execution_id: executionId, error_code: 'CALENDAR_CONFLICT',
        error_message: 'The new time slot conflicts with an existing appointment.',
        calendar_mode: calendarResolution.mode,
        message: 'Time slot not available.', credits_consumed: 0,
      };
    }
  }

  // Step 6: External calendar update if calendar_mode = external
  if (calendarResolution.mode === 'external') {
    // Need existing external_calendar_id to update
    const existingExternalId = appointment.external_calendar_id;
    if (!existingExternalId) {
      // Edge case: resource now external but appointment was created internally
      // Treat as internal for this reschedule
      console.warn('[Scheduling] Resource is external but appointment has no external_calendar_id. Treating as internal.');
    } else {
      const calendarPayload: UpdateCalendarEventPayload = {
        event_id: existingExternalId,
        start_datetime: newStartDate.toISOString(),
        end_datetime: newEndDate.toISOString(),
        timezone: 'Europe/Lisbon',
      };

      const externalResult = await executeExternalAction(supabase, {
        action_type: 'update_calendar_event',
        provider: calendarResolution.provider as 'google_calendar' | 'outlook_calendar',
        company_id: input.company_id,
        conversation_id: input.conversation_id || null,
        agent_id: input.agent_id || null,
        payload: { ...calendarPayload, resource_id: calendarResolution.resource_id, execution_id: executionId },
      });

      if (!externalResult.success) {
        await logSchedulingAction(supabase, {
          company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
          action_name: 'reschedule_appointment', execution_id: executionId,
          input_data: input as unknown as Record<string, unknown>,
          outcome: 'failed', error_code: 'EXTERNAL_EXECUTION_FAILED', credits_consumed: 0, timestamp,
          calendar_mode: 'external',
        });
        return {
          success: false, execution_id: executionId,
          error_code: 'EXTERNAL_EXECUTION_FAILED',
          error_message: externalResult.error_message || 'Failed to reschedule in external calendar.',
          calendar_mode: 'external',
          fallback_to_request: true,
          message: 'Failed to reschedule externally.',
          credits_consumed: 0,
        };
      }
    }
  }

  // Step 7: Update internal record
  const newSchedulingState: SchedulingState = calendarResolution.mode === 'external'
    ? 'confirmed'  // External success = confirmed
    : appointment.scheduling_state; // Internal: preserve current state

  const { error: updateErr } = await supabase
    .from('agendamentos')
    .update({
      data: newStartDate.toISOString().split('T')[0],
      hora: newStartDate.toTimeString().split(' ')[0].substring(0, 5),
      start_datetime: newStartDate.toISOString(),
      end_datetime: newEndDate.toISOString(),
      duration_minutes: durationResult.duration_minutes,
      notas: appointment.notas ? `${appointment.notas}\n[Rescheduled: ${input.notes || 'N/A'}]` : `[Rescheduled: ${input.notes || 'N/A'}]`,
      scheduling_state: newSchedulingState,
    })
    .eq('id', input.appointment_id);

  if (updateErr) {
    console.error('[Scheduling] Failed to reschedule:', updateErr);
    return { success: false, execution_id: executionId, error_code: 'UNKNOWN_ERROR', error_message: 'Failed to update appointment.', message: 'Failed to reschedule.', credits_consumed: 0 };
  }

  // SUCCESS
  await logSchedulingAction(supabase, {
    company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
    action_name: 'reschedule_appointment', execution_id: executionId,
    input_data: input as unknown as Record<string, unknown>,
    outcome: 'success', credits_consumed: creditCost, timestamp,
    calendar_mode: calendarResolution.mode,
  });
  await registerSchedulingCredits(supabase, input.company_id, input.appointment_id, creditCost);

  console.log(`[Scheduling] ✓ Rescheduled: ${input.appointment_id} (mode: ${calendarResolution.mode}, exec: ${executionId})`);
  return { success: true, execution_id: executionId, calendar_mode: calendarResolution.mode, message: 'Appointment rescheduled successfully.', credits_consumed: creditCost };
}

// =============================================
// Action: cancel_appointment
// =============================================

// deno-lint-ignore no-explicit-any
export async function executeCancelAppointment(
  supabase: any,
  input: CancelAppointmentInput
): Promise<CancelAppointmentOutput> {
  const timestamp = new Date().toISOString();
  const executionId = input.execution_id || generateExecutionId('cancel_appointment', input.company_id);
  const creditCost = getSchedulingCreditCost('cancel_appointment');

  console.log('[Scheduling] Executing cancel_appointment:', { appointment_id: input.appointment_id, execution_id: executionId });

  // Step 0: Capability check
  const capCheck = await checkSchedulingCapability(supabase, input.company_id, 'cancel_appointment');
  if (!capCheck.allowed) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'cancel_appointment', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'blocked', error_code: 'INTEGRATION_NOT_ACTIVE', credits_consumed: 0, timestamp,
    });
    return { success: false, execution_id: executionId, error_code: 'INTEGRATION_NOT_ACTIVE', error_message: 'Cancellation is not enabled.', message: 'Cancellation is not enabled for this company.', credits_consumed: 0 };
  }

  // Step 1: Idempotency
  const idempCheck = await checkIdempotency(supabase, executionId);
  if (idempCheck.isDuplicate) {
    return { success: false, execution_id: executionId, error_code: 'DUPLICATE_EXECUTION', error_message: 'Already executed.', message: 'This action has already been executed.', credits_consumed: 0 };
  }

  // Step 2: Find appointment
  const { data: appointment, error: fetchErr } = await supabase
    .from('agendamentos')
    .select('*')
    .eq('id', input.appointment_id)
    .eq('empresa_id', input.company_id)
    .single();

  if (fetchErr || !appointment) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'cancel_appointment', execution_id: executionId,
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'failed', error_code: 'APPOINTMENT_NOT_FOUND', credits_consumed: 0, timestamp,
    });
    return { success: false, execution_id: executionId, error_code: 'APPOINTMENT_NOT_FOUND', error_message: 'Appointment not found.', message: 'Appointment not found.', credits_consumed: 0 };
  }

  // Already cancelled
  if (appointment.scheduling_state === 'cancelled') {
    return { success: true, execution_id: executionId, message: 'Appointment was already cancelled.', credits_consumed: 0 };
  }

  // Step 3: Resolve calendar mode from resource
  let resolvedResource: SchedulingResource | null = null;
  if (appointment.resource_id) {
    const { resources } = await resolveResources(supabase, input.company_id, appointment.resource_id);
    if (resources.length > 0) resolvedResource = resources[0];
  }
  const calendarResolution = resolveCalendarMode(resolvedResource);
  console.log(`[Scheduling] Cancel calendar mode: ${calendarResolution.mode}`);

  // Step 4: External calendar deletion if calendar_mode = external
  if (calendarResolution.mode === 'external' && appointment.external_calendar_id) {
    const calendarPayload: DeleteCalendarEventPayload = {
      event_id: appointment.external_calendar_id,
      send_notifications: true,
    };

    const externalResult = await executeExternalAction(supabase, {
      action_type: 'delete_calendar_event',
      provider: calendarResolution.provider as 'google_calendar' | 'outlook_calendar',
      company_id: input.company_id,
      conversation_id: input.conversation_id || null,
      agent_id: input.agent_id || null,
      payload: { ...calendarPayload, resource_id: calendarResolution.resource_id, execution_id: executionId },
    });

    if (!externalResult.success) {
      await logSchedulingAction(supabase, {
        company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
        action_name: 'cancel_appointment', execution_id: executionId,
        input_data: input as unknown as Record<string, unknown>,
        outcome: 'failed', error_code: 'EXTERNAL_EXECUTION_FAILED', credits_consumed: 0, timestamp,
        calendar_mode: 'external',
      });
      return {
        success: false, execution_id: executionId,
        error_code: 'EXTERNAL_EXECUTION_FAILED',
        error_message: externalResult.error_message || 'Failed to cancel in external calendar.',
        calendar_mode: 'external',
        fallback_to_request: true,
        message: 'Failed to cancel externally.',
        credits_consumed: 0,
      };
    }
  }

  // Step 5: Update internal record
  const { error: updateErr } = await supabase
    .from('agendamentos')
    .update({
      estado: 'cancelado',
      scheduling_state: 'cancelled',
      external_execution_state: (calendarResolution.mode === 'external' && appointment.external_calendar_id)
        ? 'success' : 'not_attempted',
      notas: appointment.notas ? `${appointment.notas}\n[Cancelled: ${input.reason || 'N/A'}]` : `[Cancelled: ${input.reason || 'N/A'}]`,
    })
    .eq('id', input.appointment_id);

  if (updateErr) {
    console.error('[Scheduling] Failed to cancel:', updateErr);
    return { success: false, execution_id: executionId, error_code: 'UNKNOWN_ERROR', error_message: 'Failed to update appointment.', message: 'Failed to cancel.', credits_consumed: 0 };
  }

  // SUCCESS
  await logSchedulingAction(supabase, {
    company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
    action_name: 'cancel_appointment', execution_id: executionId,
    input_data: input as unknown as Record<string, unknown>,
    outcome: 'success', credits_consumed: creditCost, timestamp,
    calendar_mode: calendarResolution.mode,
  });
  await registerSchedulingCredits(supabase, input.company_id, input.appointment_id, creditCost);

  console.log(`[Scheduling] ✓ Cancelled: ${input.appointment_id} (mode: ${calendarResolution.mode}, exec: ${executionId})`);
  return { success: true, execution_id: executionId, calendar_mode: calendarResolution.mode, message: 'Appointment cancelled successfully.', credits_consumed: creditCost };
}

// =============================================
// Fallback: create_appointment_request
// =============================================

// deno-lint-ignore no-explicit-any
export async function executeCreateAppointmentRequest(
  supabase: any,
  input: CreateAppointmentRequestInput
): Promise<CreateAppointmentRequestOutput> {
  const timestamp = new Date().toISOString();

  if (!input.customer_email?.trim()) {
    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_request',
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'failed', error_code: 'MISSING_EMAIL', credits_consumed: 0, timestamp,
    });
    return { success: false, error_code: 'MISSING_EMAIL', message: 'Email is required.', credits_consumed: 0 };
  }

  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        empresa_id: input.company_id,
        conversation_id: input.conversation_id || null,
        agent_id: input.agent_id || null,
        name: input.customer_name || null,
        email: input.customer_email,
        phone: input.customer_phone || null,
        notes: buildRequestNotes(input),
        source: 'scheduling_request',
        status: 'new',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Scheduling] Failed to create request:', error);
      await logSchedulingAction(supabase, {
        company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
        action_name: 'create_appointment_request',
        input_data: input as unknown as Record<string, unknown>,
        outcome: 'failed', error_code: 'UNKNOWN_ERROR', credits_consumed: 0, timestamp,
      });
      return { success: false, error_code: 'UNKNOWN_ERROR', message: 'Failed to submit request.', credits_consumed: 0 };
    }

    const requestCreditCost = 1;

    await logSchedulingAction(supabase, {
      company_id: input.company_id, agent_id: input.agent_id, conversation_id: input.conversation_id,
      action_name: 'create_appointment_request',
      input_data: input as unknown as Record<string, unknown>,
      outcome: 'success', credits_consumed: requestCreditCost, timestamp,
    });
    await registerSchedulingCredits(supabase, input.company_id, lead.id, requestCreditCost);

    return { success: true, request_id: lead.id, message: 'Scheduling request recorded. Our team will confirm and contact you.', credits_consumed: requestCreditCost };
  } catch (err) {
    console.error('[Scheduling] Exception creating request:', err);
    return { success: false, error_code: 'TEMPORARY_UNAVAILABLE', message: 'System temporarily unavailable.', credits_consumed: 0 };
  }
}

// =============================================
// Helper Functions
// =============================================

// buildAppointmentNotes removed — reason is the single semantic field for motive.
// Calendar providers use: title = service_name, description = reason.

function buildRequestNotes(input: CreateAppointmentRequestInput): string {
  const parts: string[] = ['[SCHEDULING REQUEST]'];
  if (input.preferred_date) parts.push(`Preferred date: ${input.preferred_date}`);
  if (input.preferred_time) parts.push(`Preferred time: ${input.preferred_time}`);
  if (input.reason) parts.push(`Reason: ${input.reason}`);
  return parts.join('\n');
}

// deno-lint-ignore no-explicit-any
async function logSchedulingAction(supabase: any, log: SchedulingActionLog): Promise<void> {
  try {
    await supabase.from('agent_action_logs').insert({
      empresa_id: log.company_id,
      agent_id: log.agent_id || null,
      conversation_id: log.conversation_id || null,
      action_type: log.action_name,
      action_data: {
        ...log.input_data,
        resource_id: log.resource_id || null,
        calendar_mode: log.calendar_mode || null,
      },
      actor_type: 'ai',
      outcome: log.outcome,
      outcome_message: log.error_code || null,
      credits_consumed: log.credits_consumed,
      execution_id: log.execution_id || null,
    });
    console.log(`[Scheduling] Logged: ${log.action_name} (${log.outcome}) mode:${log.calendar_mode || 'n/a'} exec:${log.execution_id || 'none'}`);
  } catch (err) {
    console.error('[Scheduling] Failed to log action:', err);
  }
}

// deno-lint-ignore no-explicit-any
async function registerSchedulingCredits(supabase: any, companyId: string, referenceId: string, credits: number): Promise<void> {
  if (credits <= 0) return;
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    await supabase.from('credits_events').insert({
      empresa_id: companyId,
      event_type: 'other',
      credits_consumed: credits,
      reference_id: referenceId,
      metadata: { action: 'scheduling', registered_at: new Date().toISOString() },
    });

    const { data: usage } = await supabase
      .from('credits_usage')
      .select('id, credits_used')
      .eq('empresa_id', companyId)
      .eq('month', currentMonth)
      .maybeSingle();

    if (usage) {
      await supabase.from('credits_usage').update({ credits_used: usage.credits_used + credits }).eq('id', usage.id);
    } else {
      await supabase.from('credits_usage').insert({ empresa_id: companyId, month: currentMonth, credits_used: credits, credits_limit: 1000 });
    }
    console.log(`[Scheduling] Credits registered: ${credits} for ${companyId}`);
  } catch (err) {
    console.error('[Scheduling] Failed to register credits:', err);
  }
}

function mapExternalErrorToSchedulingError(externalErrorCode: string | null): SchedulingErrorCode {
  switch (externalErrorCode) {
    case 'AUTH_ERROR': return 'AUTH_ERROR';
    case 'CALENDAR_CONFLICT': return 'CALENDAR_CONFLICT';
    case 'PERMISSION_DENIED': return 'AUTH_ERROR';
    case 'TIMEOUT': case 'NETWORK_ERROR': return 'TEMPORARY_UNAVAILABLE';
    case 'VALIDATION_ERROR': return 'VALIDATION_ERROR';
    default: return 'UNKNOWN_ERROR';
  }
}

// =============================================
// Get Scheduling Status for Admin UI
// =============================================

export interface SchedulingStatusInfo {
  state: 'REAL_TIME_SCHEDULING_ACTIVE' | 'REQUEST_ONLY' | 'SCHEDULING_DISABLED';
  has_calendar_integration: boolean;
  calendar_provider?: string;
  status_label: string;
  status_description: string;
  can_confirm_appointments: boolean;
}

// deno-lint-ignore no-explicit-any
export async function getSchedulingStatus(supabase: any, companyId: string): Promise<SchedulingStatusInfo> {
  const { data: empresa } = await supabase
    .from('empresas').select('service_scheduling_enabled').eq('id', companyId).single();

  if (!empresa || !empresa.service_scheduling_enabled) {
    return { state: 'SCHEDULING_DISABLED', has_calendar_integration: false, status_label: 'Desativado', status_description: 'O serviço de agendamentos não está ativo.', can_confirm_appointments: false };
  }

  // Check if any resource has an external calendar configured
  const { resources } = await resolveResources(supabase, companyId);
  const externalResource = resources.find(r => {
    const cm = resolveCalendarMode(r);
    return cm.mode === 'external';
  });

  if (externalResource) {
    const cm = resolveCalendarMode(externalResource);
    return {
      state: 'REAL_TIME_SCHEDULING_ACTIVE',
      has_calendar_integration: true,
      calendar_provider: cm.provider || undefined,
      status_label: 'Tempo Real',
      status_description: `Calendário ${cm.provider} conectado via recurso "${externalResource.name}".`,
      can_confirm_appointments: true,
    };
  }

  // Fallback: check legacy external_data_sources
  const calendarCheck = await checkCalendarIntegrationActive(supabase, companyId);
  if (calendarCheck.active) {
    return { state: 'REAL_TIME_SCHEDULING_ACTIVE', has_calendar_integration: true, calendar_provider: calendarCheck.provider, status_label: 'Tempo Real', status_description: `Calendário ${calendarCheck.provider} conectado.`, can_confirm_appointments: true };
  }

  return { state: 'REQUEST_ONLY', has_calendar_integration: false, status_label: 'Apenas Pedidos', status_description: 'Sem calendário conectado.', can_confirm_appointments: false };
}
