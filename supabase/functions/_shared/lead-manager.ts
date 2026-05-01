import { getServiceClient } from './supabase-client.ts';
import { ConversationContext } from './types.ts';
import { logAgentEvent } from './logger.ts';

export async function createLeadIfEligible(
  context: ConversationContext,
  empresaId: string,
  agentId: string,
  conversationId: string
): Promise<string | null> {
  try {
    if (!context.customer_name && !context.customer_email && !context.customer_phone) {
      return null;
    }

    const db = getServiceClient();
    const hasConfirmedBooking = !!context.agendamento_id || !!context.confirmed_snapshot;
    const initialStatus = hasConfirmedBooking ? 'qualified' : 'new';

    // Check if lead already exists for this conversation
    const { data: existing, error: existingError } = await db
      .from('leads')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (existingError) {
      console.warn('[LEAD_LOOKUP_FAILED]', existingError.message);
      return null;
    }

    if (existing) {
      if (hasConfirmedBooking && ['new', 'contacted'].includes(existing.status)) {
        const { error: updateError } = await db
          .from('leads')
          .update({ status: 'qualified' })
          .eq('id', existing.id)
          .in('status', ['new', 'contacted']);

        if (updateError) {
          console.warn('[LEAD_STATUS_UPDATE_FAILED]', updateError.message);
        }
      }
      return existing.id;
    }

    const { data: lead, error: insertError } = await db
      .from('leads')
      .insert({
        empresa_id: empresaId,
        conversation_id: conversationId,
        agent_id: agentId,
        name: context.customer_name ?? null,
        email: context.customer_email ?? null,
        phone: context.customer_phone ?? null,
        notes: context.customer_reason ?? null,
        source: 'chat',
        status: initialStatus,
      })
      .select('id')
      .single();

    if (insertError) {
      console.warn('[LEAD_CREATE_FAILED]', insertError.message);
      return null;
    }

    return lead?.id ?? null;
  } catch (error) {
    console.warn('[LEAD_CREATE_FAILED]', error);
    void logAgentEvent('LEAD_CREATE_FAILED', {
      conversation_id: conversationId,
      empresa_id: empresaId,
      error_message: error instanceof Error ? error.message : String(error),
    }, conversationId);
    return null;
  }
}

export async function updateLeadStatus(
  conversationId: string,
  status: string
): Promise<void> {
  const db = getServiceClient();
  await db
    .from('leads')
    .update({ status })
    .eq('conversation_id', conversationId);
}

export async function qualifyLeadAfterBooking(
  conversationId: string,
  agendamentoId: string,
): Promise<void> {
  if (!conversationId) return;

  try {
    const db = getServiceClient();
    const { error } = await db
      .from('leads')
      .update({ status: 'qualified' })
      .eq('conversation_id', conversationId)
      .in('status', ['new', 'contacted']);

    if (error) {
      console.warn('[LEAD_STATUS_UPDATE_FAILED]', error.message);
      void logAgentEvent('LEAD_STATUS_UPDATE_FAILED', {
        conversation_id: conversationId,
        agendamento_id: agendamentoId,
        target_status: 'qualified',
        allowed_previous_statuses: ['new', 'contacted'],
        error_message: error.message,
        error_code: error.code ?? null,
      }, conversationId);
    }
  } catch (error) {
    console.warn('[LEAD_STATUS_UPDATE_FAILED]', error);
    void logAgentEvent('LEAD_STATUS_UPDATE_FAILED', {
      conversation_id: conversationId,
      agendamento_id: agendamentoId,
      target_status: 'qualified',
      allowed_previous_statuses: ['new', 'contacted'],
      error_message: error instanceof Error ? error.message : String(error),
    }, conversationId);
  }
}
