import { getServiceClient } from './supabase-client.ts';
import { ConversationContext } from './types.ts';

export async function createLeadIfEligible(
  context: ConversationContext,
  empresaId: string,
  agentId: string,
  conversationId: string
): Promise<string | null> {
  if (!context.customer_name && !context.customer_email && !context.customer_phone) {
    return null;
  }

  const db = getServiceClient();

  // Check if lead already exists for this conversation
  const { data: existing } = await db
    .from('leads')
    .select('id')
    .eq('conversation_id', conversationId)
    .single();

  if (existing) return existing.id;

  const { data: lead } = await db
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
      status: 'new',
    })
    .select('id')
    .single();

  return lead?.id ?? null;
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
