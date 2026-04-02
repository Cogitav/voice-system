/**
 * Auto-Close Layer
 *
 * Automatically closes conversations and generates AI summaries
 * when the interaction logically finishes.
 *
 * Triggers:
 * - BookingEngine SUCCESS_CONFIRMED
 * - Booking cancel confirmed
 * - Human handoff completed (optional)
 * - Voice call ended (completed/failed/no-answer/busy)
 * - Idle timeout
 *
 * Does NOT modify: intent router, booking engine, service resolver.
 */

import { emitPlatformEvent, type PlatformEventType } from './platform-events.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type AutoCloseReason =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'human_handoff_completed'
  | 'voice_call_ended'
  | 'idle_timeout';

interface AutoCloseResult {
  closed: boolean;
  summary?: {
    summary: string;
    main_intent: string;
    result: string;
    next_action: string;
  };
  error?: string;
}

/**
 * Auto-close a conversation and generate an AI summary.
 */
export async function autoCloseConversation(
  supabase: SupabaseClient,
  conversationId: string,
  reason: AutoCloseReason,
  options?: {
    closedBy?: string;  // user id if applicable
    skipSummary?: boolean;
  },
): Promise<AutoCloseResult> {
  console.log(`[AutoClose] Closing conversation ${conversationId}, reason: ${reason}`);

  // Fetch conversation with messages for summary
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, empresa_id, status, conversation_state')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    console.error('[AutoClose] Conversation not found:', convError);
    return { closed: false, error: 'Conversation not found' };
  }

  // Skip if already closed
  if (conversation.status === 'closed') {
    console.log('[AutoClose] Already closed — skipping');
    return { closed: true };
  }

  // Generate summary
  let summaryData = {
    summary: mapReasonToDefaultSummary(reason),
    main_intent: mapReasonToIntent(reason),
    result: mapReasonToResult(reason),
    next_action: 'Nenhuma ação necessária',
  };

  if (!options?.skipSummary) {
    try {
      const aiSummary = await generateAutoCloseSummary(supabase, conversationId, reason);
      if (aiSummary) {
        summaryData = aiSummary;
      }
    } catch (e) {
      console.error('[AutoClose] Summary generation failed (non-blocking):', e);
    }
  }

  // Close the conversation
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: options?.closedBy || null,
      closure_reason: reason,
      summary: summaryData.summary,
      main_intent: summaryData.main_intent,
      result: summaryData.result,
      next_action: summaryData.next_action,
    })
    .eq('id', conversationId);

  if (updateError) {
    console.error('[AutoClose] Failed to close:', updateError);
    return { closed: false, error: 'Failed to update conversation' };
  }

  // Insert system message
  const closureLabel = mapReasonToLabel(reason);
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    content: `Conversa encerrada automaticamente: ${closureLabel}`,
    is_internal: false,
  });

  console.log(`[AutoClose] Conversation ${conversationId} closed successfully`);

  // Emit platform event (async, non-blocking)
  const eventType = mapReasonToEventType(reason);
  if (eventType) {
    emitPlatformEvent({
      type: eventType,
      empresa_id: conversation.empresa_id,
      conversation_id: conversationId,
      payload: {
        summary: summaryData.summary,
      },
      supabase,
    }).catch(e => console.warn('[AutoClose] Platform event failed (non-blocking):', e));
  }

  return { closed: true, summary: summaryData };
}

// =============================================
// AI Summary Generator
// =============================================

async function generateAutoCloseSummary(
  supabase: SupabaseClient,
  conversationId: string,
  reason: AutoCloseReason,
): Promise<{ summary: string; main_intent: string; result: string; next_action: string } | null> {
  // Fetch only meaningful dialogue messages (exclude system/tool/internal)
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('content, sender_type')
    .eq('conversation_id', conversationId)
    .eq('is_internal', false)
    .in('sender_type', ['client', 'ai', 'human'])
    .order('created_at', { ascending: true })
    .limit(30);

  if (msgError || !messages?.length) {
    return null;
  }

  const conversationText = messages
    .map((m: { sender_type: string; content: string }) =>
      `${m.sender_type === 'client' ? 'Cliente' : m.sender_type === 'ai' ? 'IA' : m.sender_type === 'human' ? 'Operador' : 'Sistema'}: ${m.content}`
    )
    .join('\n');

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return null;

  try {
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `Analisa a conversa e retorna JSON com:
- summary: resumo conciso (máx 100 palavras)
- main_intent: intenção principal do cliente
- result: resultado da conversa
- next_action: próxima ação sugerida
Responde APENAS com o JSON.`,
          },
          {
            role: 'user',
            content: `Motivo de encerramento: ${reason}\n\nConversa:\n${conversationText}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) return null;

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || mapReasonToDefaultSummary(reason),
        main_intent: parsed.main_intent || mapReasonToIntent(reason),
        result: parsed.result || mapReasonToResult(reason),
        next_action: parsed.next_action || 'Nenhuma ação necessária',
      };
    }
  } catch (e) {
    console.error('[AutoClose] AI summary error:', e);
  }

  return null;
}

// =============================================
// Mapping Helpers
// =============================================

function mapReasonToDefaultSummary(reason: AutoCloseReason): string {
  const map: Record<AutoCloseReason, string> = {
    booking_confirmed: 'Agendamento confirmado com sucesso.',
    booking_cancelled: 'Agendamento cancelado pelo cliente.',
    human_handoff_completed: 'Conversa transferida para operador humano.',
    voice_call_ended: 'Chamada de voz concluída.',
    idle_timeout: 'Conversa encerrada por inatividade.',
  };
  return map[reason] || 'Conversa encerrada.';
}

function mapReasonToIntent(reason: AutoCloseReason): string {
  const map: Record<AutoCloseReason, string> = {
    booking_confirmed: 'Agendamento',
    booking_cancelled: 'Cancelamento',
    human_handoff_completed: 'Atendimento humano',
    voice_call_ended: 'Chamada de voz',
    idle_timeout: 'Não determinado',
  };
  return map[reason] || 'Não determinado';
}

function mapReasonToResult(reason: AutoCloseReason): string {
  const map: Record<AutoCloseReason, string> = {
    booking_confirmed: 'Resolvido',
    booking_cancelled: 'Cancelado',
    human_handoff_completed: 'Transferido',
    voice_call_ended: 'Concluído',
    idle_timeout: 'Sem resposta',
  };
  return map[reason] || 'Encerrado';
}

function mapReasonToLabel(reason: AutoCloseReason): string {
  const map: Record<AutoCloseReason, string> = {
    booking_confirmed: 'Agendamento confirmado',
    booking_cancelled: 'Agendamento cancelado',
    human_handoff_completed: 'Transferência concluída',
    voice_call_ended: 'Chamada finalizada',
    idle_timeout: 'Inatividade',
  };
  return map[reason] || reason;
}

function mapReasonToEventType(reason: AutoCloseReason): PlatformEventType | null {
  // booking_confirmed is intentionally excluded — email is sent by BookingEngine
  const map: Partial<Record<AutoCloseReason, PlatformEventType>> = {
    booking_cancelled: 'booking_cancelled',
    human_handoff_completed: 'human_handoff_completed',
    voice_call_ended: 'conversation_closed',
    idle_timeout: 'conversation_closed',
  };
  return map[reason] ?? null;
}

// =============================================
// Idle Timeout Scanner
// =============================================

const IDLE_TIMEOUT_MINUTES = 60;

/**
 * Scan for conversations that have been inactive beyond the timeout
 * and auto-close them with reason 'idle_timeout'.
 *
 * Applies to conversations with status = 'ai_active' or 'completed'.
 * Skips 'waiting_human' and 'closed'.
 */
export async function closeIdleConversations(
  supabase: SupabaseClient,
): Promise<{ closed: number; errors: number }> {
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: idle, error } = await supabase
    .from('conversations')
    .select('id')
    .in('status', ['ai_active', 'completed'])
    .lt('last_message_at', cutoff)
    .is('deleted_at', null)
    .limit(50);

  if (error || !idle?.length) {
    if (error) console.error('[IdleTimeout] Query failed:', error);
    else console.log('[IdleTimeout] No idle conversations found');
    return { closed: 0, errors: error ? 1 : 0 };
  }

  console.log(`[IdleTimeout] Found ${idle.length} idle conversations to close`);

  let closed = 0;
  let errors = 0;

  for (const conv of idle) {
    const result = await autoCloseConversation(supabase, conv.id, 'idle_timeout', {
      skipSummary: true,
    });
    if (result.closed) {
      closed++;
    } else {
      errors++;
    }
  }

  console.log(`[IdleTimeout] Done: ${closed} closed, ${errors} errors`);
  return { closed, errors };
}
