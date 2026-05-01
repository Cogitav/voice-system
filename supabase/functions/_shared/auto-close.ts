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

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type PlatformEventType =
  | 'booking_confirmed'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'conversation_closed'
  | 'human_handoff_completed';

export type AutoCloseReason =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'human_handoff_completed'
  | 'voice_call_ended'
  | 'idle_timeout'
  | 'auto_closed_idle';

interface AutoCloseResult {
  closed: boolean;
  skipped?: boolean;
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
    .select('id, empresa_id, status, owner, assigned_user_id, conversation_state, conversation_context')
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

  if (reason === 'auto_closed_idle' && isProtectedFromIdleAutoClose(conversation)) {
    console.log('[AutoClose] Active booking or human handoff detected - skipping idle auto-close', {
      conversation_id: conversationId,
      status: conversation.status,
      owner: conversation.owner,
      assigned_user_id: conversation.assigned_user_id,
      conversation_state: conversation.conversation_state,
      context_state: getContextState(conversation.conversation_context),
    });
    return { closed: false, skipped: true, error: 'Conversation is active or human-owned' };
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

  // Close the conversation. Idle auto-close keeps a defensive write guard
  // so a conversation that moved to human ownership between read/write is not closed.
  let updateQuery = supabase
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

  if (reason === 'auto_closed_idle') {
    updateQuery = updateQuery
      .in('status', ['ai_active', 'completed'])
      .neq('owner', 'human')
      .is('assigned_user_id', null);
  }

  const { data: updatedConversation, error: updateError } = await updateQuery
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('[AutoClose] Failed to close:', updateError);
    return { closed: false, error: 'Failed to update conversation' };
  }

  if (reason === 'auto_closed_idle' && !updatedConversation) {
    console.log('[AutoClose] Idle auto-close skipped by write guard', {
      conversation_id: conversationId,
    });
    return { closed: false, skipped: true, error: 'Conversation no longer eligible' };
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
  if (eventType && reason !== 'auto_closed_idle') {
    const platformEventsModule = './platform-events.ts';
    import(platformEventsModule)
      .then(({ emitPlatformEvent }) => emitPlatformEvent({
        type: eventType,
        empresa_id: conversation.empresa_id,
        conversation_id: conversationId,
        payload: {
          summary: summaryData.summary,
        },
        supabase,
      }))
      .catch(e => console.warn('[AutoClose] Platform event failed (non-blocking):', e));
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
  if (reason === 'auto_closed_idle') return 'Conversa encerrada automaticamente por inatividade.';
  const map: Partial<Record<AutoCloseReason, string>> = {
    booking_confirmed: 'Agendamento confirmado com sucesso.',
    booking_cancelled: 'Agendamento cancelado pelo cliente.',
    human_handoff_completed: 'Conversa transferida para operador humano.',
    voice_call_ended: 'Chamada de voz concluída.',
    idle_timeout: 'Conversa encerrada por inatividade.',
  };
  return map[reason] || 'Conversa encerrada.';
}

function mapReasonToIntent(reason: AutoCloseReason): string {
  if (reason === 'auto_closed_idle') return 'Nao determinado';
  const map: Partial<Record<AutoCloseReason, string>> = {
    booking_confirmed: 'Agendamento',
    booking_cancelled: 'Cancelamento',
    human_handoff_completed: 'Atendimento humano',
    voice_call_ended: 'Chamada de voz',
    idle_timeout: 'Não determinado',
  };
  return map[reason] || 'Não determinado';
}

function mapReasonToResult(reason: AutoCloseReason): string {
  if (reason === 'auto_closed_idle') return 'Sem resposta';
  const map: Partial<Record<AutoCloseReason, string>> = {
    booking_confirmed: 'Resolvido',
    booking_cancelled: 'Cancelado',
    human_handoff_completed: 'Transferido',
    voice_call_ended: 'Concluído',
    idle_timeout: 'Sem resposta',
  };
  return map[reason] || 'Encerrado';
}

function mapReasonToLabel(reason: AutoCloseReason): string {
  if (reason === 'auto_closed_idle') return 'Inatividade';
  const map: Partial<Record<AutoCloseReason, string>> = {
    booking_confirmed: 'Agendamento confirmado',
    booking_cancelled: 'Agendamento cancelado',
    human_handoff_completed: 'Transferência concluída',
    voice_call_ended: 'Chamada finalizada',
    idle_timeout: 'Inatividade',
  };
  return map[reason] || reason;
}

function mapReasonToEventType(reason: AutoCloseReason): PlatformEventType | null {
  if (reason === 'auto_closed_idle') return 'conversation_closed';
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

const IDLE_TIMEOUT_MINUTES = 24 * 60;

const ACTIVE_BOOKING_STATES = new Set([
  'collecting_service',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
  'booking_processing',
]);

const HUMAN_HANDOFF_STATES = new Set([
  'human_handoff',
]);

function getContextState(context: unknown): string | null {
  if (!context || typeof context !== 'object') return null;
  const state = (context as { state?: unknown }).state;
  return typeof state === 'string' ? state : null;
}

function isProtectedFromIdleAutoClose(conversation: {
  status?: string | null;
  owner?: string | null;
  assigned_user_id?: string | null;
  conversation_state?: string | null;
  conversation_context?: unknown;
}): boolean {
  const persistedState = conversation.conversation_state ?? null;
  const contextState = getContextState(conversation.conversation_context);

  return (
    conversation.status === 'waiting_human' ||
    conversation.status === 'human_active' ||
    conversation.owner === 'human' ||
    !!conversation.assigned_user_id ||
    (persistedState != null && ACTIVE_BOOKING_STATES.has(persistedState)) ||
    (persistedState != null && HUMAN_HANDOFF_STATES.has(persistedState)) ||
    (contextState != null && ACTIVE_BOOKING_STATES.has(contextState)) ||
    (contextState != null && HUMAN_HANDOFF_STATES.has(contextState))
  );
}

/**
 * Scan for conversations that have been inactive beyond the timeout
 * and auto-close them with reason 'auto_closed_idle'.
 *
 * Applies only to conversations with status = 'ai_active' or 'completed'.
 * Skips active booking states and human-owned/handoff conversations.
 */
export async function closeIdleConversations(
  supabase: SupabaseClient,
): Promise<{ closed: number; skipped: number; errors: number }> {
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: idle, error } = await supabase
    .from('conversations')
    .select('id, status, owner, assigned_user_id, conversation_state, conversation_context')
    .in('status', ['ai_active', 'completed'])
    .lt('last_message_at', cutoff)
    .is('deleted_at', null)
    .limit(50);

  if (error || !idle?.length) {
    if (error) console.error('[IdleTimeout] Query failed:', error);
    else console.log('[IdleTimeout] No idle conversations found');
    return { closed: 0, skipped: 0, errors: error ? 1 : 0 };
  }

  console.log(`[IdleTimeout] Found ${idle.length} idle conversation candidates`);

  let closed = 0;
  let skipped = 0;
  let errors = 0;

  for (const conv of idle) {
    if (isProtectedFromIdleAutoClose(conv)) {
      skipped++;
      console.log('[IdleTimeout] Skipping protected conversation', {
        conversation_id: conv.id,
        status: conv.status,
        owner: conv.owner,
        assigned_user_id: conv.assigned_user_id,
        conversation_state: conv.conversation_state,
        context_state: getContextState(conv.conversation_context),
      });
      continue;
    }

    const result = await autoCloseConversation(supabase, conv.id, 'auto_closed_idle', {
      skipSummary: true,
    });
    if (result.closed) {
      closed++;
    } else if (result.skipped) {
      skipped++;
    } else {
      errors++;
    }
  }

  console.log(`[IdleTimeout] Done: ${closed} closed, ${skipped} skipped, ${errors} errors`);
  return { closed, skipped, errors };
}
