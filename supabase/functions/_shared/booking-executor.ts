import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, BookingResult, CustomerData } from './types.ts';
import { checkAvailability } from './availability-engine.ts';
import { consumeCredits } from './credit-manager.ts';
import { log, logAction } from './logger.ts';
import { guardBookingExecution } from './guardrails.ts';
import { randomUUID } from 'https://deno.land/std@0.177.0/node/crypto.ts';

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

  // Race condition guard — double check availability
  const recheck = await checkAvailability({
    empresa_id: empresaId,
    service_id: context.service_id!,
    date: slot.start.slice(0, 10),
    timezone: 'Europe/Lisbon',
    preferred_time: new Date(slot.start).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }),
  });

  const stillAvailable = recheck.slots.some(s => s.start === slot.start && s.end === slot.end);
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
  const dataStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const horaStr = startDate.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });

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

  // Insert booking
  const { data: booking, error: bookingError } = await db
    .from('agendamentos')
    .insert({
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
      cliente_email: context.customer_email,
      cliente_telefone: context.customer_phone ?? null,
      notas: context.customer_reason ?? null,
      execution_id: executionId,
      credits_consumed: 5,
    })
    .select('id')
    .single();

  if (bookingError || !booking) {
    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'BOOKING_INSERT_FAILED',
      message: bookingError?.message ?? 'Unknown error',
      payload: { executionId, service_id: context.service_id },
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
