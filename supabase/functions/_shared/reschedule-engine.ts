/**
 * Reschedule Engine v2.0
 *
 * Deterministic reschedule detection and execution.
 * No LLM involvement. No new appointment creation.
 *
 * v2.0: Works with booking_active state and rescheduling state.
 * Simplified flow — detection triggers state=rescheduling.
 */

import { checkSchedulingCapability } from './scheduling-capabilities.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// =============================================
// Reschedule Intent Detection (Deterministic)
// =============================================

const RESCHEDULE_KEYWORDS = /\b(alterar|mudar|trocar|reagendar|em vez de|outro dia|outro hor[áa]rio|amanh[ãa])\b/i;

/**
 * Deterministic reschedule intent detection.
 * Returns true if the message contains reschedule keywords.
 */
export function detectRescheduleIntent(message: string): boolean {
  return RESCHEDULE_KEYWORDS.test(message);
}

// =============================================
// Reschedule Capability Check
// =============================================

export async function checkRescheduleAllowed(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<boolean> {
  const capCheck = await checkSchedulingCapability(supabase, empresaId, 'reschedule_appointment');
  return capCheck.allowed;
}

// =============================================
// Reschedule Availability Validation (NO update)
// =============================================

export interface RescheduleValidationResult {
  available: boolean;
  new_start?: string;
  new_end?: string;
  suggestions?: Array<{ start_datetime: string; end_datetime: string }>;
}

/**
 * Validate if a new datetime is available for rescheduling.
 * Does NOT update the appointment — only checks conflicts.
 */
export async function validateRescheduleAvailability(
  supabase: SupabaseClient,
  empresaId: string,
  appointmentId: string,
  serviceId: string,
  newStartDatetime: string,
): Promise<RescheduleValidationResult> {
  // Resolve service duration and buffers
  const { data: service } = await supabase
    .from('scheduling_services')
    .select('duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', serviceId)
    .single();

  const durationMinutes = service?.duration_minutes || 30;
  const bufferBefore = service?.buffer_before_minutes || 0;
  const bufferAfter = service?.buffer_after_minutes || 0;
  const startDt = new Date(newStartDatetime);
  const endDt = new Date(startDt.getTime() + durationMinutes * 60000);

  const effectiveStart = new Date(startDt.getTime() - bufferBefore * 60000);
  const effectiveEnd = new Date(endDt.getTime() + bufferAfter * 60000);

  // Get resources from existing appointment
  const { data: apptResources } = await supabase
    .from('appointment_resources')
    .select('resource_id')
    .eq('appointment_id', appointmentId);

  const resourceIds = (apptResources || []).map((r: { resource_id: string }) => r.resource_id);

  // Check conflicts for each resource, EXCLUDING current appointment
  for (const resourceId of resourceIds) {
    const { data: conflicts } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('resource_id', resourceId)
      .in('scheduling_state', ['requested', 'confirmed'])
      .neq('id', appointmentId)
      .lt('start_datetime', effectiveEnd.toISOString())
      .gt('end_datetime', effectiveStart.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      console.log(`[RescheduleValidation] Conflict on resource ${resourceId}`);
      const suggestions = await fetchAlternativeSlots(supabase, empresaId, serviceId, newStartDatetime);
      return { available: false, suggestions };
    }
  }

  // Also check primary resource_id on the appointment itself
  const { data: appt } = await supabase
    .from('agendamentos')
    .select('resource_id')
    .eq('id', appointmentId)
    .single();

  if (appt?.resource_id && !resourceIds.includes(appt.resource_id)) {
    const { data: conflicts } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('resource_id', appt.resource_id)
      .in('scheduling_state', ['requested', 'confirmed'])
      .neq('id', appointmentId)
      .lt('start_datetime', effectiveEnd.toISOString())
      .gt('end_datetime', effectiveStart.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      const suggestions = await fetchAlternativeSlots(supabase, empresaId, serviceId, newStartDatetime);
      return { available: false, suggestions };
    }
  }

  console.log(`[RescheduleValidation] ✓ Slot available: ${startDt.toISOString()} - ${endDt.toISOString()}`);
  return {
    available: true,
    new_start: startDt.toISOString(),
    new_end: endDt.toISOString(),
  };
}

// =============================================
// Reschedule Execution (UPDATE same appointment)
// =============================================

export interface RescheduleExecutionResult {
  success: boolean;
  state: 'updated' | 'conflict' | 'error';
  message: string;
  error_code?: string;
  new_start?: string;
  new_end?: string;
  suggestions?: Array<{ start_datetime: string; end_datetime: string }>;
}

/**
 * Execute a reschedule by updating the existing appointment.
 * Validates conflicts (excluding the current appointment) before updating.
 */
export async function executeReschedule(
  supabase: SupabaseClient,
  empresaId: string,
  appointmentId: string,
  serviceId: string,
  newStartDatetime: string,
): Promise<RescheduleExecutionResult> {
  // Step 1: Resolve service duration and buffers
  const { data: service } = await supabase
    .from('scheduling_services')
    .select('duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', serviceId)
    .single();

  const durationMinutes = service?.duration_minutes || 30;
  const bufferBefore = service?.buffer_before_minutes || 0;
  const bufferAfter = service?.buffer_after_minutes || 0;
  const startDt = new Date(newStartDatetime);
  const endDt = new Date(startDt.getTime() + durationMinutes * 60000);

  // Effective window includes buffers
  const effectiveStart = new Date(startDt.getTime() - bufferBefore * 60000);
  const effectiveEnd = new Date(endDt.getTime() + bufferAfter * 60000);

  // Step 2: Get resources from existing appointment
  const { data: apptResources } = await supabase
    .from('appointment_resources')
    .select('resource_id')
    .eq('appointment_id', appointmentId);

  const resourceIds = (apptResources || []).map((r: { resource_id: string }) => r.resource_id);

  // Step 3: Check conflicts for each resource, EXCLUDING current appointment
  for (const resourceId of resourceIds) {
    const { data: conflicts } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('resource_id', resourceId)
      .in('scheduling_state', ['requested', 'confirmed'])
      .neq('id', appointmentId) // Exclude self
      .lt('start_datetime', effectiveEnd.toISOString())
      .gt('end_datetime', effectiveStart.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      console.log(`[RescheduleEngine] Conflict on resource ${resourceId}`);

      // Fetch 3 alternative suggestions
      const suggestions = await fetchAlternativeSlots(supabase, empresaId, serviceId, newStartDatetime);

      return {
        success: false,
        state: 'conflict',
        message: 'O horário selecionado não está disponível.',
        error_code: 'SLOT_NOT_AVAILABLE',
        suggestions,
      };
    }
  }

  // Also check primary resource_id on the appointment itself
  const { data: appt } = await supabase
    .from('agendamentos')
    .select('resource_id')
    .eq('id', appointmentId)
    .single();

  if (appt?.resource_id && !resourceIds.includes(appt.resource_id)) {
    const { data: conflicts } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('resource_id', appt.resource_id)
      .in('scheduling_state', ['requested', 'confirmed'])
      .neq('id', appointmentId)
      .lt('start_datetime', effectiveEnd.toISOString())
      .gt('end_datetime', effectiveStart.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      const suggestions = await fetchAlternativeSlots(supabase, empresaId, serviceId, newStartDatetime);
      return {
        success: false,
        state: 'conflict',
        message: 'O horário selecionado não está disponível.',
        error_code: 'SLOT_NOT_AVAILABLE',
        suggestions,
      };
    }
  }

  // Step 4: Timezone normalization for stored fields
  const dateStr = startDt.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }); // YYYY-MM-DD
  const timeStr = startDt.toLocaleTimeString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Step 5: UPDATE the same appointment (NEVER create new)
  const { error } = await supabase
    .from('agendamentos')
    .update({
      data: dateStr,
      hora: timeStr,
      start_datetime: startDt.toISOString(),
      end_datetime: endDt.toISOString(),
      duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('empresa_id', empresaId);

  if (error) {
    console.error('[RescheduleEngine] Update failed:', error);
    return {
      success: false,
      state: 'error',
      message: 'Não foi possível atualizar o agendamento.',
      error_code: 'UPDATE_FAILED',
    };
  }

  console.log(`[RescheduleEngine] ✓ Appointment ${appointmentId} rescheduled to ${startDt.toISOString()}`);

  return {
    success: true,
    state: 'updated',
    message: 'O seu agendamento foi atualizado com sucesso.',
    new_start: startDt.toISOString(),
    new_end: endDt.toISOString(),
  };
}

// =============================================
// Alternative Slot Suggestions
// =============================================

async function fetchAlternativeSlots(
  supabase: SupabaseClient,
  empresaId: string,
  serviceId: string,
  requestedStart: string,
): Promise<Array<{ start_datetime: string; end_datetime: string }>> {
  const suggestions: Array<{ start_datetime: string; end_datetime: string }> = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/check-availability`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          company_id: empresaId,
          service_id: serviceId,
          requested_start: requestedStart,
          max_suggestions: 3,
          search_days: 7,
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      if (data.suggestions?.length > 0) {
        suggestions.push(...data.suggestions);
      }
    }
  } catch (err) {
    console.error('[RescheduleEngine] Failed to fetch suggestions:', err);
  }

  return suggestions;
}
