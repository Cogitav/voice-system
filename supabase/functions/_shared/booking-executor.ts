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

type EmailTemplate = {
  id: string;
  subject: string;
  body: string;
};

type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM_ADDRESS = Deno.env.get('EMAIL_FROM_ADDRESS') || 'onboarding@resend.dev';

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

function replaceTemplateVariables(template: string, replacements: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return output;
}

async function sendEmail(
  to: string,
  from: string,
  subject: string,
  text: string,
): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function sendBookingConfirmationEmail(params: {
  db: ReturnType<typeof getServiceClient>;
  context: ConversationContext;
  empresaId: string;
  bookingId: string;
  bookingCreatedAt: string;
  dataAgendamento: string;
  horaAgendamento: string;
  conversationId: string;
}): Promise<void> {
  const {
    db,
    context,
    empresaId,
    bookingId,
    bookingCreatedAt,
    dataAgendamento,
    horaAgendamento,
    conversationId,
  } = params;

  try {
    const recipientEmail = context.customer_email?.trim();
    if (!recipientEmail) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'missing_customer_email',
        booking_id: bookingId,
        conversation_id: conversationId,
      });
      return;
    }

    const { data: templates, error: templateError } = await db
      .from('email_templates')
      .select('id, subject, body')
      .eq('empresa_id', empresaId)
      .eq('intent', 'agendamento')
      .eq('is_active', true)
      .eq('recipient_type', 'client')
      .order('created_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_TEMPLATE_LOOKUP_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: templateError.message,
      });
      return;
    }

    const template = (templates?.[0] ?? null) as EmailTemplate | null;
    if (!template) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'no_active_client_agendamento_template',
        booking_id: bookingId,
        conversation_id: conversationId,
      });
      return;
    }

    const { data: existingLogs } = await db
      .from('email_logs')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('template_id', template.id)
      .eq('recipient_email', recipientEmail)
      .eq('status', 'sent')
      .gte('created_at', bookingCreatedAt)
      .limit(1);

    if (existingLogs?.length) {
      console.log('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'already_sent',
        booking_id: bookingId,
        email_log_id: existingLogs[0].id,
        conversation_id: conversationId,
      });
      return;
    }

    const { data: empresa } = await db
      .from('empresas')
      .select('nome')
      .eq('id', empresaId)
      .maybeSingle();

    const empresaNome = empresa?.nome || 'Empresa';
    const serviceName = context.service_name || context.confirmed_snapshot?.service_name || 'Serviço';
    const replacements = {
      '{{cliente_nome}}': context.customer_name || 'Cliente',
      '{{cliente_email}}': recipientEmail,
      '{{cliente_telefone}}': context.customer_phone || '',
      '{{empresa_nome}}': empresaNome,
      '{{data_agendamento}}': dataAgendamento,
      '{{hora_agendamento}}': horaAgendamento.slice(0, 5),
      '{{intent}}': serviceName,
      '{{servico_nome}}': serviceName,
      '{{nome_cliente}}': context.customer_name || 'Cliente',
      '{{email_cliente}}': recipientEmail,
      '{{telefone_cliente}}': context.customer_phone || '',
    };

    const subject = replaceTemplateVariables(template.subject, replacements);
    const body = replaceTemplateVariables(template.body, replacements);
    const emailResult = await sendEmail(
      recipientEmail,
      `${empresaNome} <${EMAIL_FROM_ADDRESS}>`,
      subject,
      body,
    );

    if (!emailResult.success) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: emailResult.error,
      });

      await db.from('email_logs').insert({
        chamada_id: null,
        template_id: template.id,
        empresa_id: empresaId,
        recipient_email: recipientEmail,
        subject,
        body,
        status: 'failed',
        error_message: emailResult.error ?? 'Failed to send email',
      });
      return;
    }

    const { data: emailLog, error: emailLogError } = await db
      .from('email_logs')
      .insert({
        chamada_id: null,
        template_id: template.id,
        empresa_id: empresaId,
        recipient_email: recipientEmail,
        subject,
        body,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (emailLogError || !emailLog?.id) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_LOG_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: emailLogError?.message ?? 'Missing email_log id',
      });
      return;
    }

    await consumeCredits(empresaId, 'email_send', emailLog.id);
    console.log('[BOOKING_CONFIRMATION_EMAIL_SENT]', {
      booking_id: bookingId,
      conversation_id: conversationId,
      email_log_id: emailLog.id,
      provider_email_id: emailResult.id ?? null,
    });
  } catch (error) {
    console.warn('[BOOKING_CONFIRMATION_EMAIL_ERROR]', {
      booking_id: bookingId,
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
    .select('id, created_at')
    .eq('execution_id', executionId)
    .single();

  if (existing) {
    await sendBookingConfirmationEmail({
      db,
      context,
      empresaId,
      bookingId: existing.id,
      bookingCreatedAt: existing.created_at,
      dataAgendamento: context.selected_slot?.start.slice(0, 10) ?? '',
      horaAgendamento: (context.selected_slot?.start.match(/T(\d{2}:\d{2})/)?.[1] ?? '').slice(0, 5),
      conversationId,
    });
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

  let booking: { id: string; created_at: string } | null = null;
  let bookingError: BookingInsertError | null = null;

  try {
    const insertResult = await db
      .from('agendamentos')
      .insert(insertPayload)
      .select('id, created_at')
      .single();

    booking = insertResult.data as { id: string; created_at: string } | null;
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

  await sendBookingConfirmationEmail({
    db,
    context,
    empresaId,
    bookingId: booking.id,
    bookingCreatedAt: booking.created_at,
    dataAgendamento: dataStr,
    horaAgendamento: horaStr,
    conversationId,
  });

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
