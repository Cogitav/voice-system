import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, BookingResult, CustomerData } from './types.ts';
import { checkAvailability } from './availability-engine.ts';
import { consumeCredits } from './credit-manager.ts';
import { log, logAction } from './logger.ts';
import { guardBookingExecution } from './guardrails.ts';
import { randomUUID } from 'https://deno.land/std@0.177.0/node/crypto.ts';

function redactBookingInsertPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    cliente_nome: payload.cliente_nome ? '[REDACTED]' : null,
    cliente_telefone: payload.cliente_telefone ? '[REDACTED]' : null,
    notas: payload.notas ? '[REDACTED]' : null,
  };
}

export async function executeBooking(
  context: ConversationContext,
  empresaId: string,
  agentId: string,
  conversationId: string
): Promise<BookingResult> {
  const guard = guardBookingExecution(context);
  if (!guard.allowed) {
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

  const { data: conflictRows } = await db
    .from('agendamentos')
    .select('id, start_datetime, end_datetime, resource_id, estado, scheduling_state')
    .eq('empresa_id', empresaId)
    .gte('start_datetime', bookingQueryFilters.start_gte)
    .lt('start_datetime', bookingQueryFilters.start_lt)
    .not('estado', 'eq', bookingQueryFilters.excluded_estado)
    .not('scheduling_state', 'eq', bookingQueryFilters.excluded_scheduling_state);

  const overlappingConflictRows = (conflictRows ?? []).filter((booking) => {
    const bookingStart = new Date(booking.start_datetime).getTime();
    const bookingEnd = new Date(booking.end_datetime).getTime();
    const slotStart = new Date(slot.start).getTime();
    const slotEnd = new Date(slot.end).getTime();
    return slotStart < bookingEnd && slotEnd > bookingStart;
  });

  console.log('[FLOW_DEBUG_BOOKING_CONFLICT_CHECK]', JSON.stringify({
    stage: 'before_recheck',
    start: slot.start,
    end: slot.end,
    resource_id: slot.resource_id ?? null,
    timezone: 'Europe/Lisbon',
    query_filters: bookingQueryFilters,
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
  const recheck = await checkAvailability({
    empresa_id: empresaId,
    service_id: context.service_id!,
    date: slot.start.slice(0, 10),
    timezone: 'Europe/Lisbon',
    preferred_time: slotTime,
  });

  const stillAvailable = recheck.slots.some(s => s.start === slot.start && s.end === slot.end);
  console.log('[FLOW_DEBUG_BOOKING_CONFLICT_CHECK]', JSON.stringify({
    stage: 'after_recheck',
    start: slot.start,
    end: slot.end,
    resource_id: slot.resource_id ?? null,
    timezone: 'Europe/Lisbon',
    query_filters: bookingQueryFilters,
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
    return { success: false, agendamento_id: null, error: 'Slot já não está disponível.', error_code: 'SLOT_CONFLICT' };
  }

  // Get service details
  const { data: service } = await db
    .from('scheduling_services')
    .select('duration_minutes, name')
    .eq('id', context.service_id!)
    .single();

  const startDate = new Date(slot.start);
  const dataStr = slot.start.slice(0, 10) || startDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const horaStr = slotTime ? `${slotTime}:00` : startDate.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });

  console.log('[FLOW_DEBUG_BOOKING_PERSISTENCE]', JSON.stringify({
    selected_slot_start: slot.start,
    selected_slot_end: slot.end,
    persisted_start_datetime: slot.start,
    persisted_end_datetime: slot.end,
    persisted_hora: horaStr,
    timezone_used: 'Europe/Lisbon',
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

  const { data: booking, error: bookingError } = await db
    .from('agendamentos')
    .insert(insertPayload)
    .select('id')
    .single();

  if (bookingError || !booking) {
    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'BOOKING_INSERT_FAILED',
      message: bookingError?.message ?? 'Unknown error',
      payload: {
        execution_id: executionId,
        booking_error: {
          message: bookingError?.message ?? null,
          code: bookingError?.code ?? null,
          details: bookingError?.details ?? null,
          hint: bookingError?.hint ?? null,
        },
        insert_payload: redactBookingInsertPayload(insertPayload),
      },
    }, 'error');
    return { success: false, agendamento_id: null, error: 'Erro ao criar agendamento.', error_code: 'DB_ERROR' };
  }

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

  return { success: true, agendamento_id: booking.id, error: null, error_code: null };
}
