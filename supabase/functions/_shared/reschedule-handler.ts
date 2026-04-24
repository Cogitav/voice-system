import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, BookingResult } from './types.ts';
import { checkAvailability } from './availability-engine.ts';
import { guardReschedule } from './guardrails.ts';
import { consumeCredits } from './credit-manager.ts';
import { logAction } from './logger.ts';

export async function executeReschedule(
  context: ConversationContext,
  empresaId: string,
  agentId: string,
  conversationId: string
): Promise<BookingResult> {
  const guard = guardReschedule(context);
  if (!guard.allowed) {
    return { success: false, agendamento_id: null, error: guard.reason, error_code: 'GUARD_FAILED' };
  }

  const db = getServiceClient();
  const appointmentId = context.reschedule_from_agendamento_id!;
  const newSlot = context.reschedule_new_slot!;

  const { data: existing } = await db
    .from('agendamentos')
    .select('id, service_id, start_datetime, end_datetime, estado, scheduling_state')
    .eq('id', appointmentId)
    .eq('empresa_id', empresaId)
    .single();

  if (!existing) {
    return { success: false, agendamento_id: null, error: 'Agendamento nao encontrado.', error_code: 'NOT_FOUND' };
  }

  if (existing.scheduling_state === 'cancelled') {
    return { success: false, agendamento_id: null, error: 'Nao e possivel remarcar um agendamento cancelado.', error_code: 'ALREADY_CANCELLED' };
  }

  const requestedTime = newSlot.start.match(/T(\d{2}:\d{2})/)?.[1];
  const recheck = await checkAvailability({
    empresa_id: empresaId,
    service_id: context.service_id ?? existing.service_id,
    date: newSlot.start.slice(0, 10),
    timezone: 'Europe/Lisbon',
    preferred_time: requestedTime,
    exclude_booking_id: appointmentId,
  });

  const stillAvailable = recheck.slots.some((slot) =>
    slot.start === newSlot.start &&
    slot.end === newSlot.end &&
    ((slot.resource_id ?? null) === (newSlot.resource_id ?? null) || !newSlot.resource_id)
  );

  console.log('[FLOW_RESCHEDULE_CONFLICT_CHECK]', JSON.stringify({
    original_agendamento_id: appointmentId,
    excluded_agendamento_id: appointmentId,
    new_slot_start: newSlot.start,
    new_slot_end: newSlot.end,
    new_slot_resource_id: newSlot.resource_id ?? null,
    returned_slots: recheck.slots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      resource_id: slot.resource_id ?? null,
    })),
    still_available: stillAvailable,
  }));

  if (!stillAvailable) {
    console.log('[FLOW_RESCHEDULE_SLOT_CONFLICT]', JSON.stringify({
      original_agendamento_id: appointmentId,
      excluded_agendamento_id: appointmentId,
      new_slot_start: newSlot.start,
      new_slot_resource_id: newSlot.resource_id ?? null,
    }));
    return { success: false, agendamento_id: null, error: 'Slot ja nao esta disponivel.', error_code: 'SLOT_CONFLICT' };
  }

  const dataStr = newSlot.start.slice(0, 10);
  const horaStr = `${requestedTime ?? '00:00'}:00`;
  const previousBookingStatus = {
    estado: existing.estado ?? null,
    scheduling_state: existing.scheduling_state ?? null,
  };
  const finalBookingStatus = {
    estado: 'confirmado',
    scheduling_state: 'confirmed',
  };

  const { error: updateError } = await db
    .from('agendamentos')
    .update({
      data: dataStr,
      hora: horaStr,
      start_datetime: newSlot.start,
      end_datetime: newSlot.end,
      resource_id: newSlot.resource_id || null,
      scheduling_state: 'confirmed',
      estado: 'confirmado',
    })
    .eq('id', appointmentId)
    .eq('empresa_id', empresaId);

  if (updateError) {
    if (updateError.code === '23505') {
      console.log('[FLOW_RESCHEDULE_SLOT_CONFLICT]', JSON.stringify({
        original_agendamento_id: appointmentId,
        excluded_agendamento_id: appointmentId,
        new_slot_start: newSlot.start,
        new_slot_resource_id: newSlot.resource_id ?? null,
        error: {
          message: updateError.message ?? null,
          code: updateError.code ?? null,
          details: updateError.details ?? null,
          hint: updateError.hint ?? null,
        },
      }));
      return { success: false, agendamento_id: null, error: 'Slot ja nao esta disponivel.', error_code: 'SLOT_CONFLICT' };
    }

    console.log('[FLOW_DEBUG_RESCHEDULE]', JSON.stringify({
      original_agendamento_id: appointmentId,
      new_agendamento_id: null,
      old_slot_start: existing.start_datetime ?? null,
      new_slot_start: newSlot.start,
      previous_booking_status: previousBookingStatus,
      final_booking_status: null,
      reschedule_success: false,
    }));
    return { success: false, agendamento_id: null, error: 'Erro ao remarcar.', error_code: 'DB_ERROR' };
  }

  await consumeCredits(empresaId, 'booking_reschedule', appointmentId);

  await logAction({
    empresa_id: empresaId,
    agent_id: agentId,
    conversation_id: conversationId,
    action_type: 'BOOKING_RESCHEDULED',
    action_data: { agendamento_id: appointmentId, new_slot: newSlot },
    outcome: 'success',
    credits_consumed: 3,
  });

  console.log('[FLOW_DEBUG_RESCHEDULE]', JSON.stringify({
    original_agendamento_id: appointmentId,
    new_agendamento_id: appointmentId,
    old_slot_start: existing.start_datetime ?? null,
    new_slot_start: newSlot.start,
    previous_booking_status: previousBookingStatus,
    final_booking_status: finalBookingStatus,
    reschedule_success: true,
  }));

  console.log('[FLOW_RESCHEDULE_SUCCESS]', JSON.stringify({
    original_agendamento_id: appointmentId,
    new_agendamento_id: appointmentId,
    old_slot_start: existing.start_datetime ?? null,
    new_slot_start: newSlot.start,
    new_slot_resource_id: newSlot.resource_id ?? null,
    reschedule_success: true,
  }));

  return { success: true, agendamento_id: appointmentId, error: null, error_code: null };
}

export function resolveRescheduleSlot(
  context: ConversationContext,
  newDate: string | null,
  newTime: string | null
): Partial<ConversationContext> {
  const snapshot = context.confirmed_snapshot;
  const resolvedDate = newDate ?? context.reschedule_new_date ?? snapshot?.start?.slice(0, 10) ?? context.preferred_date;
  const resolvedTime = newTime ?? context.reschedule_new_time;

  return {
    reschedule_new_date: resolvedDate,
    reschedule_new_time: resolvedTime,
    available_slots: [],
    selected_slot: null,
    reschedule_new_slot: null,
  };
}
