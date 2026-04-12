import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, BookingResult, SlotSuggestion } from './types.ts';
import { checkAvailability } from './availability-engine.ts';
import { guardReschedule } from './guardrails.ts';
import { consumeCredits } from './credit-manager.ts';
import { log, logAction } from './logger.ts';

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

  // Verify appointment exists and belongs to this empresa
  const { data: existing } = await db
    .from('agendamentos')
    .select('id, service_id, scheduling_state')
    .eq('id', appointmentId)
    .eq('empresa_id', empresaId)
    .single();

  if (!existing) {
    return { success: false, agendamento_id: null, error: 'Agendamento não encontrado.', error_code: 'NOT_FOUND' };
  }

  if (existing.scheduling_state === 'cancelled') {
    return { success: false, agendamento_id: null, error: 'Não é possível remarcar um agendamento cancelado.', error_code: 'ALREADY_CANCELLED' };
  }

  // Race condition check
  const recheck = await checkAvailability({
    empresa_id: empresaId,
    service_id: context.service_id ?? existing.service_id,
    date: newSlot.start.slice(0, 10),
    timezone: 'Europe/Lisbon',
  });

  const stillAvailable = recheck.slots.some(s => s.start === newSlot.start);
  if (!stillAvailable) {
    return { success: false, agendamento_id: null, error: 'Slot já não está disponível.', error_code: 'SLOT_CONFLICT' };
  }

  const startDate = new Date(newSlot.start);
  const dataStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const horaStr = startDate.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });

  const { error: updateError } = await db
    .from('agendamentos')
    .update({
      data: dataStr,
      hora: horaStr,
      start_datetime: newSlot.start,
      end_datetime: newSlot.end,
      resource_id: newSlot.resource_id || null,
      scheduling_state: 'confirmed',
      estado: 'remarcado',
    })
    .eq('id', appointmentId)
    .eq('empresa_id', empresaId);

  if (updateError) {
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

  return { success: true, agendamento_id: appointmentId, error: null, error_code: null };
}

export function resolveRescheduleSlot(
  context: ConversationContext,
  newDate: string | null,
  newTime: string | null
): Partial<ConversationContext> {
  const snapshot = context.confirmed_snapshot;

  // Preserve existing date if only time changed
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
