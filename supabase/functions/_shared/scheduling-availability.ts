/**
 * Scheduling Availability Resolution v1.0
 * 
 * PRODUCTION-GRADE: Resolves availability, resources, and durations
 * for scheduling actions. Agents NEVER guess or assume free slots.
 * 
 * PRINCIPLES:
 * - Availability comes from backend or external systems only
 * - Duration is resolved by backend, not AI
 * - Resource selection is deterministic
 * - No availability = no execution attempt
 */

import {
  checkSchedulingCapability,
} from './scheduling-capabilities.ts';
import {
  generateExecutionId,
} from './scheduling-credit-rules.ts';

// =============================================
// Types
// =============================================

export interface SchedulingResource {
  id: string;
  empresa_id: string;
  name: string;
  type: 'person' | 'room' | 'equipment';
  status: 'active' | 'inactive';
  default_appointment_duration_minutes: number;
  calendar_type: string;
  external_calendar_id: string | null;
  priority: number;
}

export interface AvailabilitySlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  resource_id: string;
  resource_name: string;
  duration_minutes: number;
}

export interface ViewAvailabilityInput {
  company_id: string;
  agent_id?: string;
  conversation_id?: string;
  resource_id?: string; // optional - if not provided, check all active resources
  service_id?: string;  // optional - resolve duration/resources from service
  date_from: string;    // ISO date (YYYY-MM-DD)
  date_to: string;      // ISO date (YYYY-MM-DD)
  duration_minutes?: number; // optional - resolved from service/resource/company/system default
}

export interface ViewAvailabilityOutput {
  success: boolean;
  slots: AvailabilitySlot[];
  resources_evaluated: string[];
  resolved_duration_minutes: number;
  message: string;
  error_code?: string;
}

export interface DurationResolution {
  duration_minutes: number;
  source: 'explicit' | 'resource_default' | 'company_default' | 'system_default';
}

// =============================================
// Types: Business Hours & Service
// =============================================

export interface BusinessHourRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

export interface SchedulingServiceRow {
  id: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
}

// =============================================
// Duration Resolution (MANDATORY ORDER)
// =============================================

const SYSTEM_DEFAULT_DURATION = 30;

/**
 * Resolve appointment duration in strict order:
 * 1. Explicit duration from input
 * 2. Service duration_minutes
 * 3. Resource default_appointment_duration_minutes
 * 4. System default (30 minutes)
 */
export function resolveDuration(
  explicitDuration?: number,
  resource?: SchedulingResource | null,
  service?: SchedulingServiceRow | null,
): DurationResolution {
  if (explicitDuration && explicitDuration > 0) {
    return { duration_minutes: explicitDuration, source: 'explicit' };
  }
  if (service?.duration_minutes) {
    return { duration_minutes: service.duration_minutes, source: 'explicit' };
  }
  if (resource?.default_appointment_duration_minutes) {
    return { duration_minutes: resource.default_appointment_duration_minutes, source: 'resource_default' };
  }
  return { duration_minutes: SYSTEM_DEFAULT_DURATION, source: 'system_default' };
}

// =============================================
// Resource Resolution
// =============================================

/**
 * Get active resources for a company, optionally filtered by resource_id.
 * Returns resources ordered by priority (ascending).
 */
// deno-lint-ignore no-explicit-any
export async function resolveResources(
  supabase: any,
  companyId: string,
  resourceId?: string
): Promise<{ resources: SchedulingResource[]; error?: string }> {
  try {
    let query = supabase
      .from('scheduling_resources')
      .select('*')
      .eq('empresa_id', companyId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('name', { ascending: true });

    if (resourceId) {
      query = query.eq('id', resourceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Availability] Failed to fetch resources:', error);
      return { resources: [], error: 'Failed to fetch resources' };
    }

    return { resources: (data || []) as SchedulingResource[] };
  } catch (err) {
    console.error('[Availability] Exception fetching resources:', err);
    return { resources: [], error: 'System error fetching resources' };
  }
}

// =============================================
// Internal Availability Engine
// =============================================

/**
 * Check availability using internal agendamentos table.
 * Returns free slots by checking existing appointments for conflicts.
 * 
 * For v1: Uses a simple gap-finding algorithm based on existing appointments.
 * Future: Will support external calendar queries via External Actions Bridge.
 */
// deno-lint-ignore no-explicit-any
async function getInternalAvailability(
  supabase: any,
  companyId: string,
  resource: SchedulingResource,
  dateFrom: string,
  dateTo: string,
  durationMinutes: number,
  businessHours: BusinessHourRow[],
  slotIncrementMinutes: number,
  bufferBefore: number = 0,
  bufferAfter: number = 0,
): Promise<AvailabilitySlot[]> {
  // Fetch existing appointments for this resource in the date range
  const { data: existingAppointments, error } = await supabase
    .from('agendamentos')
    .select('start_datetime, end_datetime, scheduling_state')
    .eq('empresa_id', companyId)
    .eq('resource_id', resource.id)
    .in('scheduling_state', ['requested', 'confirmed'])
    .gte('data', dateFrom)
    .lte('data', dateTo)
    .order('start_datetime', { ascending: true });

  if (error) {
    console.error('[Availability] Error fetching appointments:', error);
    return [];
  }

  // Build business hours lookup (day_of_week -> hours)
  const bhMap = new Map<number, BusinessHourRow>();
  for (const bh of businessHours) {
    bhMap.set(bh.day_of_week, bh);
  }

  // Helper: get Lisbon timezone components from a Date
  function toLisbonComponents(date: Date): { dayOfWeek: number; dateStr: string } {
    const lisbonStr = date.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
    const parts = lisbonStr.split(', ');
    const [day, month, year] = parts[0].split('/');
    const dateStr = `${year}-${month}-${day}`;
    const lisbonDate = new Date(`${dateStr}T12:00:00`);
    return { dayOfWeek: lisbonDate.getDay(), dateStr };
  }

  const slots: AvailabilitySlot[] = [];
  const startDate = new Date(dateFrom + 'T00:00:00');
  const endDate = new Date(dateTo + 'T23:59:59');

  const totalBlockMinutes = bufferBefore + durationMinutes + bufferAfter;
  const increment = slotIncrementMinutes > 0 ? slotIncrementMinutes : 15;

  const currentDay = new Date(startDate);
  while (currentDay <= endDate) {
    const dayStr = currentDay.toISOString().split('T')[0];
    const lisbonInfo = toLisbonComponents(currentDay);
    const dayOfWeek = lisbonInfo.dayOfWeek;

    // Use business hours if configured, otherwise default Mon-Fri 09-18
    const bh = bhMap.get(dayOfWeek);
    let workStartHour = 9, workStartMin = 0, workEndHour = 18, workEndMin = 0;
    let isClosed = dayOfWeek === 0 || dayOfWeek === 6; // default: weekends closed

    if (bh) {
      if (bh.is_closed) {
        isClosed = true;
      } else {
        isClosed = false;
        const [sh, sm] = bh.start_time.split(':').map(Number);
        const [eh, em] = bh.end_time.split(':').map(Number);
        workStartHour = sh; workStartMin = sm || 0;
        workEndHour = eh; workEndMin = em || 0;
      }
    }

    if (isClosed) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    // Get appointments for this day
    const dayAppointments = (existingAppointments || [])
      .filter((a: { start_datetime: string; end_datetime: string }) => {
        if (!a.start_datetime) return false;
        return a.start_datetime.startsWith(dayStr);
      })
      .map((a: { start_datetime: string; end_datetime: string }) => ({
        start: new Date(a.start_datetime),
        end: a.end_datetime ? new Date(a.end_datetime) : new Date(new Date(a.start_datetime).getTime() + durationMinutes * 60000),
      }))
      .sort((a: { start: Date }, b: { start: Date }) => a.start.getTime() - b.start.getTime());

    // Use local Lisbon time for day boundaries (not UTC)
    const dayStart = new Date(`${dayStr}T${String(workStartHour).padStart(2, '0')}:${String(workStartMin).padStart(2, '0')}:00`);
    const dayEnd = new Date(`${dayStr}T${String(workEndHour).padStart(2, '0')}:${String(workEndMin).padStart(2, '0')}:00`);

    // Skip past days
    const now = new Date();
    if (dayStart < now && dayStr === now.toISOString().split('T')[0]) {
      const minuteRound = Math.ceil(now.getMinutes() / increment) * increment;
      dayStart.setHours(now.getHours(), minuteRound, 0, 0);
      if (dayStart < now) dayStart.setMinutes(dayStart.getMinutes() + increment);
    } else if (dayEnd < now) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    let cursor = new Date(dayStart);

    for (const appt of dayAppointments) {
      const gapEnd = new Date(appt.start);
      while (cursor.getTime() + totalBlockMinutes * 60000 <= gapEnd.getTime() && cursor < dayEnd) {
        const slotStart = new Date(cursor.getTime() + bufferBefore * 60000);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
        if (slotEnd.getTime() + bufferAfter * 60000 <= dayEnd.getTime()) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            resource_id: resource.id,
            resource_name: resource.name,
            duration_minutes: durationMinutes,
          });
        }
        cursor = new Date(cursor.getTime() + increment * 60000);
      }
      if (appt.end > cursor) {
        cursor = new Date(appt.end);
      }
    }

    // Remaining time after last appointment
    while (cursor.getTime() + totalBlockMinutes * 60000 <= dayEnd.getTime()) {
      const slotStart = new Date(cursor.getTime() + bufferBefore * 60000);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        resource_id: resource.id,
        resource_name: resource.name,
        duration_minutes: durationMinutes,
      });
      cursor = new Date(cursor.getTime() + increment * 60000);
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return slots;
}

// =============================================
// Main Action: view_availability
// =============================================

/**
 * Execute the view_availability action.
 * Returns available time slots for the requested date range.
 * 
 * Costs 0 credits (view-only action).
 */
// deno-lint-ignore no-explicit-any
export async function executeViewAvailability(
  supabase: any,
  input: ViewAvailabilityInput
): Promise<ViewAvailabilityOutput> {
  const startTime = Date.now();

  console.log('[Availability] Executing view_availability:', {
    company_id: input.company_id,
    resource_id: input.resource_id || 'all',
    service_id: input.service_id || 'none',
    date_from: input.date_from,
    date_to: input.date_to,
  });

  // Step 0: Capability check
  const capCheck = await checkSchedulingCapability(supabase, input.company_id, 'view_availability');
  if (!capCheck.allowed) {
    return {
      success: false,
      slots: [],
      resources_evaluated: [],
      resolved_duration_minutes: 0,
      message: 'Viewing availability is not enabled for this company.',
      error_code: 'INTEGRATION_NOT_ACTIVE',
    };
  }

  // Step 0b: Fetch business hours for the company
  const { data: businessHoursData } = await supabase
    .from('scheduling_business_hours')
    .select('day_of_week, start_time, end_time, is_closed')
    .eq('empresa_id', input.company_id);
  const businessHours: BusinessHourRow[] = businessHoursData || [];

  // Step 0c: Fetch slot_increment_minutes from empresa
  const { data: empresaConfig } = await supabase
    .from('empresas')
    .select('slot_increment_minutes')
    .eq('id', input.company_id)
    .single();
  const slotIncrement = empresaConfig?.slot_increment_minutes || 15;

  // Step 0d: Resolve service if provided
  let service: SchedulingServiceRow | null = null;
  let serviceResourceIds: string[] | null = null;
  if (input.service_id) {
    const { data: svcData } = await supabase
      .from('scheduling_services')
      .select('id, duration_minutes, buffer_before_minutes, buffer_after_minutes')
      .eq('id', input.service_id)
      .eq('status', 'active')
      .single();
    if (svcData) {
      service = svcData as SchedulingServiceRow;
      // Check service-resource links
      const { data: svcResLinks } = await supabase
        .from('scheduling_service_resources')
        .select('resource_id')
        .eq('service_id', input.service_id);
      if (svcResLinks && svcResLinks.length > 0) {
        serviceResourceIds = svcResLinks.map((l: { resource_id: string }) => l.resource_id);
      }
    }
  }

  // Step 1: Resolve resources (filter by service resources if applicable)
  let resourceId = input.resource_id;
  const { resources, error: resourceError } = await resolveResources(
    supabase, input.company_id, resourceId
  );

  // Filter by service-linked resources if applicable
  let filteredResources = resources;
  if (serviceResourceIds && !resourceId) {
    filteredResources = resources.filter(r => serviceResourceIds!.includes(r.id));
    // If no matching resources, fall back to all
    if (filteredResources.length === 0) {
      filteredResources = resources;
    }
  }

  if (resourceError || filteredResources.length === 0) {
    return {
      success: true,
      slots: [],
      resources_evaluated: [],
      resolved_duration_minutes: input.duration_minutes || SYSTEM_DEFAULT_DURATION,
      message: filteredResources.length === 0
        ? 'No active scheduling resources found for this company.'
        : 'Failed to resolve resources.',
      error_code: filteredResources.length === 0 ? undefined : 'UNKNOWN_ERROR',
    };
  }

  // Step 2: Resolve duration (service > explicit > resource > system)
  const durationResult = resolveDuration(
    input.duration_minutes,
    filteredResources[0],
    service,
  );

  // Step 3: Get availability for each resource
  const allSlots: AvailabilitySlot[] = [];
  const resourceIds: string[] = [];

  const bufferBefore = service?.buffer_before_minutes || 0;
  const bufferAfter = service?.buffer_after_minutes || 0;

  for (const resource of filteredResources) {
    resourceIds.push(resource.id);
    const resourceDuration = resolveDuration(input.duration_minutes, resource, service);

    const slots = await getInternalAvailability(
      supabase,
      input.company_id,
      resource,
      input.date_from,
      input.date_to,
      resourceDuration.duration_minutes,
      businessHours,
      slotIncrement,
      bufferBefore,
      bufferAfter,
    );

    allSlots.push(...slots);
  }

  // Step 4: Sort by earliest availability
  allSlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Step 5: Log the availability request
  const executionTimeMs = Date.now() - startTime;
  try {
    await supabase.from('availability_logs').insert({
      empresa_id: input.company_id,
      requested_by: input.agent_id ? 'agent' : 'system',
      resource_ids: resourceIds,
      requested_date_from: input.date_from,
      requested_date_to: input.date_to,
      requested_duration_minutes: durationResult.duration_minutes,
      slots_returned: allSlots.length,
      execution_time_ms: executionTimeMs,
    });
  } catch (err) {
    console.error('[Availability] Failed to log availability request:', err);
  }

  // Step 6: Log to agent_action_logs
  try {
    await supabase.from('agent_action_logs').insert({
      empresa_id: input.company_id,
      agent_id: input.agent_id || null,
      conversation_id: input.conversation_id || null,
      action_type: 'view_availability',
      action_data: {
        resource_ids: resourceIds,
        date_from: input.date_from,
        date_to: input.date_to,
        duration_minutes: durationResult.duration_minutes,
        slots_returned: allSlots.length,
      },
      actor_type: 'ai',
      outcome: 'success',
      credits_consumed: 0,
      execution_id: generateExecutionId('view_availability', input.company_id),
    });
  } catch (err) {
    console.error('[Availability] Failed to log action:', err);
  }

  console.log(`[Availability] ✓ Found ${allSlots.length} slots across ${resourceIds.length} resources (${executionTimeMs}ms)`);

  return {
    success: true,
    slots: allSlots,
    resources_evaluated: resourceIds,
    resolved_duration_minutes: durationResult.duration_minutes,
    message: allSlots.length > 0
      ? `Found ${allSlots.length} available slots.`
      : 'No available slots found for the requested period.',
  };
}

// =============================================
// Shared Resource Conflict Check (SINGLE SOURCE OF TRUTH)
// =============================================

/**
 * Unified resource conflict check used by BOTH availability engine AND booking engine.
 * Checks legacy resource_id column AND appointment_resources (v2 multi-resource).
 * 
 * CRITICAL: This must be the ONLY function that determines if a resource is free.
 * Any change here automatically applies to availability checks AND booking validation.
 */
// deno-lint-ignore no-explicit-any
export async function isResourceFreeShared(
  supabase: any,
  resourceId: string,
  effectiveStart: Date,
  effectiveEnd: Date,
  excludeAppointmentId?: string,
): Promise<{ free: boolean; conflictIds: string[] }> {
  console.log(`[DEBUG] isResourceFreeShared called: resource=${resourceId}, window=${effectiveStart.toISOString()}→${effectiveEnd.toISOString()}, exclude=${excludeAppointmentId || 'none'}`);
  const conflictIds: string[] = [];

  // Check 1: Legacy resource_id on agendamentos
  let legacyQuery = supabase
    .from('agendamentos')
    .select('id')
    .eq('resource_id', resourceId)
    .in('scheduling_state', ['requested', 'confirmed'])
    .lt('start_datetime', effectiveEnd.toISOString())
    .gt('end_datetime', effectiveStart.toISOString())
    .limit(5);

  if (excludeAppointmentId) {
    legacyQuery = legacyQuery.neq('id', excludeAppointmentId);
  }

  const { data: legacyConflicts, error: err1 } = await legacyQuery;

  if (err1) {
    console.error('[SlotValidation] Legacy conflict query error:', err1);
    return { free: false, conflictIds: [] };
  }
  if (legacyConflicts && legacyConflicts.length > 0) {
    for (const c of legacyConflicts) conflictIds.push(c.id);
    console.log(`[SlotValidation] resource=${resourceId} LEGACY CONFLICT: ${conflictIds.join(', ')}`);
    return { free: false, conflictIds };
  }

  // Check 2: appointment_resources (v2 multi-resource)
  const { data: v2Links, error: err2 } = await supabase
    .from('appointment_resources')
    .select('appointment_id')
    .eq('resource_id', resourceId);

  if (err2) {
    console.warn('[SlotValidation] appointment_resources query error (non-blocking):', err2);
    return { free: true, conflictIds: [] };
  }

  if (v2Links && v2Links.length > 0) {
    const appointmentIds = v2Links.map((l: any) => l.appointment_id);
    // Filter out excluded appointment
    const filteredIds = excludeAppointmentId
      ? appointmentIds.filter((id: string) => id !== excludeAppointmentId)
      : appointmentIds;

    if (filteredIds.length > 0) {
      const { data: overlapping, error: err3 } = await supabase
        .from('agendamentos')
        .select('id')
        .in('id', filteredIds)
        .in('scheduling_state', ['requested', 'confirmed'])
        .lt('start_datetime', effectiveEnd.toISOString())
        .gt('end_datetime', effectiveStart.toISOString())
        .limit(5);

      if (!err3 && overlapping && overlapping.length > 0) {
        for (const c of overlapping) conflictIds.push(c.id);
        console.log(`[SlotValidation] resource=${resourceId} V2 CONFLICT: ${conflictIds.join(', ')}`);
        return { free: false, conflictIds };
      }
    }
  }

  return { free: true, conflictIds: [] };
}

// =============================================
// Availability Gatekeeping for create/reschedule
// =============================================

/**
 * Validate that a proposed slot doesn't conflict with existing appointments.
 * Uses the shared isResourceFreeShared function for consistency.
 */
// deno-lint-ignore no-explicit-any
export async function validateSlotAvailability(
  supabase: any,
  companyId: string,
  resourceId: string | null,
  startDatetime: string,
  endDatetime: string,
  excludeAppointmentId?: string,
): Promise<{ available: boolean; conflict_id?: string }> {
  if (!resourceId) {
    return { available: true };
  }

  try {
    const result = await isResourceFreeShared(
      supabase,
      resourceId,
      new Date(startDatetime),
      new Date(endDatetime),
      excludeAppointmentId,
    );
    if (!result.free) {
      return { available: false, conflict_id: result.conflictIds[0] };
    }
    return { available: true };
  } catch (err) {
    console.error('[Availability] Exception in conflict check:', err);
    return { available: true };
  }
}
