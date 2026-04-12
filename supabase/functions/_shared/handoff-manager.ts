import { getServiceClient } from './supabase-client.ts';
import { ConversationContext } from './types.ts';
import { log } from './logger.ts';

export async function triggerHandoff(
  conversationId: string,
  empresaId: string,
  context: ConversationContext,
  reason: string
): Promise<void> {
  const db = getServiceClient();

  await db
    .from('conversations')
    .update({
      status: 'waiting_human',
      owner: 'human',
      conversation_state: 'human_handoff',
    })
    .eq('id', conversationId)
    .eq('empresa_id', empresaId);

  await log({
    empresa_id: empresaId,
    conversation_id: conversationId,
    event_type: 'HANDOFF_TRIGGERED',
    message: reason,
    payload: {
      previous_state: context.state,
      intent: context.current_intent,
      consecutive_errors: context.consecutive_errors,
    },
  });
}

export async function returnToAI(
  conversationId: string,
  empresaId: string
): Promise<void> {
  const db = getServiceClient();

  await db
    .from('conversations')
    .update({
      status: 'ai_active',
      owner: 'ai',
      conversation_state: 'idle',
    })
    .eq('id', conversationId)
    .eq('empresa_id', empresaId);
}

export function shouldAutoHandoff(context: ConversationContext): boolean {
  return context.consecutive_errors >= 3;
}
