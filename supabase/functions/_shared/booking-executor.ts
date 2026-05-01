import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, BookingResult, CustomerData } from './types.ts';
import { checkAvailability } from './availability-engine.ts';
import { consumeCredits } from './credit-manager.ts';
import { log, logAction, logAgentEvent } from './logger.ts';
import { guardBookingExecution } from './guardrails.ts';
import { qualifyLeadAfterBooking } from './lead-manager.ts';
import { randomUUID } from 'https://deno.land/std@0.177.0/node/crypto.ts';

type BookingInsertError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function redactBookingInsertPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    cliente_nome: payload.cliente_nome ? '[REDACTED]' : null,
    cliente_telefone: payload.cliente_telefone ? '[REDACTED]' : null,
    notas: payload.notas ? '[REDACTED]' : null,
  };
}

function serializeBookingError(error: BookingInsertError | null): BookingInsertError {
  return {
    message: error?.message ?? null,
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

function normalizeUnknownError(error: unknown): BookingInsertError {
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function isSlotUniquenessError(error: BookingInsertError | null): boolean {
  const text = [
    error?.message,
    error?.code,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ').toLowerCase();

  return (
    error?.code === '23505' &&
    (
      text.includes('idx_agendamentos_resource_start_unique') ||
      text.includes('start_datetime')
    )
  );
}

function bookingOverlapsSlot(
  booking: { start_datetime: string | null; end_datetime: string | null },
  slotStartISO: string,
  slotEndISO: string,
): boolean {
  if (!booking.start_datetime || !booking.end_datetime) return false;
  const bookingStart = new Date(booking.start_datetime).getTime();
  const bookingEnd = new Date(booking.end_datetime).getTime();
  const slotStart = new Date(slotStartISO).getTime();
  const slotEnd = new Date(slotEndISO).getTime();
  if ([bookingStart, bookingEnd, slotStart, slotEnd].some(Number.isNaN)) return false;
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function summarizeSlot(slot: ConversationContext['selected_slot']): Record<string, unknown> | null {
  if (!slot) return null;
  return {
    start: slot.start ?? null,
    end: slot.end ?? null,
    resource_id: slot.resource_id ?? null,
  };
}

function logBookingFlowEvent(
  eventType: string,
  context: ConversationContext,
  conversationId: string,
  extras: Record<string, unknown> = {},
): void {
  void logAgentEvent(
    eventType,
    {
      conversation_id: conversationId,
      state: context.state ?? null,
      current_intent: context.current_intent ?? null,
      service_id: context.service_id ?? null,
      selected_slot: summarizeSlot(context.selected_slot),
      required_fields_missing: context.fields_missing ?? null,
      decision_action: extras.decision_action ?? null,
      ...extras,
    },
    conversationId,
  );
}

export async function executeBooking(
  context: ConversationContext,
  empresaId: string,
  agentId: string,
  conversationId: string,
  timezone: string
): Promise<BookingResult> {
  logBookingFlowEvent('FLOW_BOOKING_ATTEMPT', context, conversationId, {
    execution_id: context.execution_id ?? null,
  });

  const guard = guardBookingExecution(context);
  if (!guard.allowed) {
    logBookingFlowEvent('FLOW_BOOKING_FAILURE', context, conversationId, {
      reason: 'guard_failed',
      error_code: 'GUARD_FAILED',
      error: guard.reason,
    });
    return { success: false, agendamento_id: null, error: guard.reason, error_code: 'GUARD_FAILED' };
  }

  const slot = context.selected_slot!;
  const executionId = context.execution_id ?? crypto.randomUUID();

  // Check for duplicate execution
  const db = getServiceClient();
  const { data: existing } = await db
    .from('agendamentos')
    .select('id')
    .eq('execution_id', executionId)
    .single();

  if (existing) {
    logBookingFlowEvent('FLOW_BOOKING_SUCCESS', context, conversationId, {
      reason: 'duplicate_execution',
      agendamento_id: existing.id,
      execution_id: executionId,
    });
    return { success: true, agendamento_id: existing.id, error: null, error_code: null };
  }

  const slotTime = slot.start.match(/T(\d{2}:\d{2})/)?.[1];
  const bookingQueryFilters = {
    empresa_id: empresaId,
    date: slot.start.slice(0, 10),
    start_gte: slot.start.slice(0, 10) + 'T00:00:00Z',
    start_lt: slot.start.slice(0, 10) + 'T23:59:59Z',
    excluded_estado: 'cancelado',
    excluded_scheduling_state: 'cancelled',
    preferred_time: slotTime ?? null,
  };

  let conflictQuery = db
    .from('agendamentos')
    .select('id, start_datetime, end_datetime, resource_id, estado, scheduling_state')
    .eq('empresa_id', empresaId)
    .gte('start_datetime', bookingQueryFilters.start_gte)
    .lt('start_datetime', bookingQueryFilters.start_lt)
    .not('estado', 'eq', bookingQueryFilters.excluded_estado)
    .not('scheduling_state', 'eq', bookingQueryFilters.excluded_scheduling_state);

  conflictQuery = slot.resource_id
    ? conflictQuery.eq('resource_id', slot.resource_id)
    : conflictQuery.is('resource_id', null);

  const { data: conflictRows } = await conflictQuery;

  const overlappingConflictRows = (conflictRows ?? []).filter((booking) =>
    bookingOverlapsSlot(booking, slot.start, slot.end)
  );

  console.log('[FLOW_DEBUG_BOOKING_CONFLICT_CHECK]', JSON.stringify({
    stage: 'before_recheck',
    start: slot.start,
    end: slot.end,
    resource_id: slot.resource_id ?? null,
    timezone,
    query_filters: bookingQueryFilters,
    conflict_scope: 'resource_id',
    blocks_booking: overlappingConflictRows.length > 0,
    conflicting_rows: overlappingConflictRows.map((booking) => ({
      id: booking.id,
      start: booking.start_datetime,
      end: booking.end_datetime,
      resource_id: booking.resource_id,
      estado: booking.estado ?? null,
      scheduling_state: booking.scheduling_state ?? null,
    })),
  }));

  // Race condition guard — double check availability using the same slot-time normalization
  if (overlappingConflictRows.length > 0) {
    const conflictPayload = {
      start: slot.start,
      end: slot.end,
      resource_id: slot.resource_id ?? null,
      service_id: context.service_id,
      conflict_scope: 'resource_id',
      conflicting_rows: overlappingConflictRows.map((booking) => ({
        id: booking.id,
        start: booking.start_datetime,
        end: booking.end_datetime,
        resource_id: booking.resource_id,
        estado: booking.estado ?? null,
        scheduling_state: booking.scheduling_state ?? null,
      })),
    };

    console.log('[BOOKING_CONFLICT_RESOURCE_SCOPED]', JSON.stringify(conflictPayload));

    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'BOOKING_CONFLICT_RESOURCE_SCOPED',
      message: 'Slot blocked by existing booking on the same resource',
      payload: conflictPayload,
    });
    logBookingFlowEvent('FLOW_BOOKING_FAILURE', context, conversationId, {
      reason: 'resource_scoped_conflict',
      error_code: 'SLOT_CONFLICT',
      conflict_payload: conflictPayload,
    });
    return { success: false, agendamento_id: null, error: 'Slot ja nao esta disponivel.', error_code: 'SLOT_CONFLICT' };
  }

  const recheck = await checkAvailability({
    empresa_id: empresaId,
    service_id: context.service_id!,
    date: slot.start.slice(0, 10),
    timezone,
    preferred_time: slotTime,
  });

  const stillAvailable = recheck.slots.some((s) =>
    s.start === slot.start &&
    s.end === slot.end &&
    ((s.resource_id ?? null) === (slot.resource_id ?? null) || !slot.resource_id)
  );
  console.log('[FLOW_DEBUG_BOOKING_CONFLICT_CHECK]', JSON.stringify({
    stage: 'after_recheck',
    start: slot.start,
    end: slot.end,
    resource_id: slot.resource_id ?? null,
    timezone,
    query_filters: bookingQueryFilters,
    conflict_scope: 'resource_id',
    blocks_booking: overlappingConflictRows.length > 0,
    conflicting_rows: overlappingConflictRows.map((booking) => ({
      id: booking.id,
      start: booking.start_datetime,
      end: booking.end_datetime,
      resource_id: booking.resource_id,
      estado: booking.estado ?? null,
      scheduling_state: booking.scheduling_state ?? null,
    })),
    returned_slots: recheck.slots.map((candidate) => ({
      start: candidate.start,
      end: candidate.end,
      resource_id: candidate.resource_id ?? null,
    })),
    still_available: stillAvailable,
  }));
  if (!stillAvailable) {
    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'BOOKING_SLOT_CONFLICT',
      message: 'Slot no longer available at execution time',
      payload: { slot, service_id: context.service_id },
    });
    logBookingFlowEvent('FLOW_BOOKING_FAILURE', context, conversationId, {
      reason: 'availability_recheck_failed',
      error_code: 'SLOT_CONFLICT',
    });
    return { success: false, agendamento_id: null, error: 'Slot já não está disponível.', error_code: 'SLOT_CONFLICT' };
  }

  // Get service details
  const { data: service } = await db
    .from('scheduling_services')
    .select('duration_minutes, name')
    .eq('id', context.service_id!)
    .single();

  const startDate = new Date(slot.start);
  const dataStr = slot.start.slice(0, 10) || startDate.toLocaleDateString('en-CA', { timeZone: timezone });
  const horaStr = slotTime ? `${slotTime}:00` : startDate.toLocaleTimeString('pt-PT', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });

  console.log('[FLOW_DEBUG_BOOKING_PERSISTENCE]', JSON.stringify({
    selected_slot_start: slot.start,
    selected_slot_end: slot.end,
    persisted_start_datetime: slot.start,
    persisted_end_datetime: slot.end,
    persisted_hora: horaStr,
    timezone_used: timezone,
  }));

  // Upsert customer
  let customerId: string | null = null;
  if (context.customer_email) {
    const { data: existingCustomer } = await db
      .from('customers')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('email', context.customer_email)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer } = await db
        .from('customers')
        .insert({
          empresa_id: empresaId,
          name: context.customer_name,
          email: context.customer_email,
          phone: context.customer_phone ?? null,
        })
        .select('id')
        .single();
      customerId = newCustomer?.id ?? null;
    }
  }

  // Insert booking. Keep this payload aligned with the real agendamentos schema.
  const insertPayload = {
    empresa_id: empresaId,
    service_id: context.service_id,
    resource_id: slot.resource_id || null,
    agente_id: agentId,
    data: dataStr,
    hora: horaStr,
    start_datetime: slot.start,
    end_datetime: slot.end,
    duration_minutes: service?.duration_minutes ?? 30,
    estado: 'confirmado',
    scheduling_state: 'confirmed',
    cliente_nome: context.customer_name,
    cliente_telefone: context.customer_phone ?? null,
    notas: context.customer_reason ?? null,
    execution_id: executionId,
    credits_consumed: 5,
  };

  let booking: { id: string } | null = null;
  let bookingError: BookingInsertError | null = null;

  try {
    const insertResult = await db
      .from('agendamentos')
      .insert(insertPayload)
      .select('id')
      .single();

    booking = insertResult.data as { id: string } | null;
    bookingError = insertResult.error;
  } catch (error) {
    bookingError = normalizeUnknownError(error);
  }

  if (bookingError || !booking) {
    const failurePayload = {
      execution_id: executionId,
      booking_error: serializeBookingError(bookingError),
      insert_payload: redactBookingInsertPayload(insertPayload),
    };

    console.error('[BOOKING_INSERT_FAILED]', JSON.stringify(failurePayload));

    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'BOOKING_INSERT_FAILED',
      message: bookingError?.message ?? 'Unknown error',
      payload: failurePayload,
    }, 'error');

    if (isSlotUniquenessError(bookingError)) {
      logBookingFlowEvent('FLOW_BOOKING_FAILURE', context, conversationId, {
        reason: 'slot_uniqueness_error',
        error_code: 'SLOT_CONFLICT',
        booking_error: serializeBookingError(bookingError),
      });
      return { success: false, agendamento_id: null, error: 'Slot ja nao esta disponivel.', error_code: 'SLOT_CONFLICT' };
    }

    logBookingFlowEvent('FLOW_BOOKING_FAILURE', context, conversationId, {
      reason: 'insert_failed',
      error_code: 'DB_ERROR',
      booking_error: serializeBookingError(bookingError),
    });
    return { success: false, agendamento_id: null, error: 'Erro ao criar agendamento.', error_code: 'DB_ERROR' };
  }

  await qualifyLeadAfterBooking(conversationId, booking.id);

  // Insert booking lifecycle
  await db.from('booking_lifecycle').insert({
    empresa_id: empresaId,
    conversation_id: conversationId,
    current_state: 'confirmed',
    service_id: context.service_id,
    selected_slot: slot.start,
    customer_name: context.customer_name,
    customer_email: context.customer_email,
    customer_phone: context.customer_phone ?? null,
  });

  // Consume credits
  await consumeCredits(empresaId, 'booking_create', booking.id);

  // Log action
  await logAction({
    empresa_id: empresaId,
    agent_id: agentId,
    conversation_id: conversationId,
    action_type: 'BOOKING_CREATED',
    action_data: { agendamento_id: booking.id, slot, service_id: context.service_id },
    outcome: 'success',
    credits_consumed: 5,
  });

  logBookingFlowEvent('FLOW_BOOKING_SUCCESS', context, conversationId, {
    reason: 'created',
    agendamento_id: booking.id,
    execution_id: executionId,
  });

  return { success: true, agendamento_id: booking.id, error: null, error_code: null };
}
