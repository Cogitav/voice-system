import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent, TimelineEventType, TimelineOutcome } from '@/types/conversations';

type AnyRecord = Record<string, any>;

interface QueryResult<T> {
  data: T[];
  warning?: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_user_id: string | null;
  content: string | null;
  is_internal: boolean | null;
  created_at: string | null;
}

interface AgentLogRow {
  id: string;
  conversation_id: string | null;
  event_type: string | null;
  payload: AnyRecord | null;
  created_at: string | null;
}

interface AgentActionLogRow {
  id: string;
  conversation_id: string | null;
  action_type: string | null;
  actor_type: string | null;
  outcome: string | null;
  outcome_message: string | null;
  credits_consumed: number | null;
  reference_id: string | null;
  execution_id: string | null;
  action_data: AnyRecord | null;
  created_at: string | null;
}

interface CreditEventRow {
  id: string;
  event_type: string | null;
  credits_consumed: number | null;
  reference_id: string | null;
  metadata: AnyRecord | null;
  created_at: string | null;
}

const SENSITIVE_KEY_PATTERN = /(email|e-mail|phone|telefone|telemovel|telemóvel|mobile|client_identifier|customer_identifier)/i;

function redactEmail(value: string) {
  const [local, domain] = value.split('@');
  if (!local || !domain) return '[redacted]';
  return `${local.slice(0, 2)}***@${domain}`;
}

function redactMetadata(value: unknown, key = ''): unknown {
  if (value == null) return value;

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    if (typeof value === 'string' && value.includes('@')) return redactEmail(value);
    return '[redacted]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactMetadata(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as AnyRecord).map(([childKey, childValue]) => [
        childKey,
        redactMetadata(childValue, childKey),
      ])
    );
  }

  return value;
}

function toMetadata(value: unknown): AnyRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const redacted = redactMetadata(value);
  if (!redacted || typeof redacted !== 'object') return undefined;
  return redacted as AnyRecord;
}

function normalizeOutcome(value: unknown): TimelineOutcome | undefined {
  if (typeof value === 'boolean') return value ? 'success' : 'failed';
  if (value == null) return undefined;

  const normalized = String(value).toLowerCase();
  if (['success', 'succeeded', 'ok', 'completed', 'created'].some((token) => normalized.includes(token))) {
    return 'success';
  }
  if (['failed', 'failure', 'error', 'erro'].some((token) => normalized.includes(token))) {
    return 'failed';
  }
  if (['blocked', 'denied', 'not_allowed', 'insufficient'].some((token) => normalized.includes(token))) {
    return 'blocked';
  }

  return undefined;
}

function inferAgentLogType(eventType: string | null, payload: AnyRecord | null): TimelineEventType {
  const normalized = (eventType ?? '').toLowerCase();
  const payloadText = JSON.stringify(payload ?? {}).toLowerCase();

  if (normalized.includes('handoff') || payloadText.includes('handoff')) return 'handoff';
  if (normalized.includes('fallback')) return 'fallback';
  if (normalized.includes('error') || normalized.includes('failed') || payload?.error || payload?.result_success === false) {
    return 'error';
  }

  return 'agent_log';
}

function inferAgentActionType(row: AgentActionLogRow): TimelineEventType {
  const normalized = `${row.action_type ?? ''} ${row.outcome ?? ''}`.toLowerCase();
  if (normalized.includes('handoff')) return 'handoff';
  if (normalized.includes('error') || normalized.includes('failed')) return 'error';
  return 'agent_action';
}

function normalizeMessage(row: MessageRow): TimelineEvent {
  const typeBySender: Record<string, TimelineEventType> = {
    client: 'message_client',
    ai: 'message_ai',
    human: 'message_human',
  };

  const titleBySender: Record<string, string> = {
    client: 'Mensagem do cliente',
    ai: 'Mensagem da IA',
    human: 'Mensagem humana',
  };

  const senderType = row.sender_type ?? 'unknown';
  const type = typeBySender[senderType] ?? 'agent_log';

  return {
    id: `message:${row.id}`,
    timestamp: row.created_at ?? '',
    type,
    source: 'messages',
    title: titleBySender[senderType] ?? `Mensagem (${senderType})`,
    description: row.content ?? undefined,
    metadata: toMetadata({
      id: row.id,
      sender_type: row.sender_type,
      sender_user_id: row.sender_user_id,
      is_internal: row.is_internal,
    }),
  };
}

function normalizeAgentLog(row: AgentLogRow): TimelineEvent {
  const payload = toMetadata(row.payload);
  const outcome = normalizeOutcome(row.payload?.outcome ?? row.payload?.result_success ?? row.payload?.success);

  if (row.event_type === 'STATE_CHANGED') {
    const previousState = typeof row.payload?.previous_state === 'string' ? row.payload.previous_state : undefined;
    const nextState = typeof row.payload?.next_state === 'string' ? row.payload.next_state : undefined;

    return {
      id: `agent_log:${row.id}`,
      timestamp: row.created_at ?? '',
      type: 'state_change',
      source: 'agent_logs',
      title: 'State changed',
      description: previousState && nextState ? `${previousState} → ${nextState}` : undefined,
      metadata: payload,
    };
  }

  return {
    id: `agent_log:${row.id}`,
    timestamp: row.created_at ?? '',
    type: inferAgentLogType(row.event_type, row.payload),
    source: 'agent_logs',
    title: row.event_type || 'Agent log',
    outcome,
    metadata: payload,
  };
}

function normalizeAgentAction(row: AgentActionLogRow): TimelineEvent {
  return {
    id: `agent_action:${row.id}`,
    timestamp: row.created_at ?? '',
    type: inferAgentActionType(row),
    source: 'agent_action_logs',
    title: row.action_type || 'Agent action',
    description: row.outcome_message ?? undefined,
    outcome: normalizeOutcome(row.outcome),
    credits: row.credits_consumed ?? undefined,
    metadata: toMetadata({
      actor_type: row.actor_type,
      reference_id: row.reference_id,
      execution_id: row.execution_id,
      action_data: row.action_data,
    }),
  };
}

function normalizeCreditEvent(row: CreditEventRow): TimelineEvent {
  return {
    id: `credit_event:${row.id}`,
    timestamp: row.created_at ?? '',
    type: 'credit_event',
    source: 'credits_events',
    title: row.event_type || 'Credit event',
    credits: row.credits_consumed ?? undefined,
    metadata: toMetadata({
      reference_id: row.reference_id,
      metadata: row.metadata,
    }),
  };
}

function sortTimelineEvents(events: TimelineEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const aTime = Date.parse(a.event.timestamp);
      const bTime = Date.parse(b.event.timestamp);
      const safeATime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
      const safeBTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
      return safeATime - safeBTime || a.index - b.index;
    })
    .map(({ event }) => event);
}

async function safeQuery<T>(source: string, query: PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>): Promise<QueryResult<T>> {
  try {
    const { data, error } = await query;
    if (error) {
      return {
        data: [],
        warning: `${source}: ${error.message || error.code || 'query failed'}`,
      };
    }

    return { data: data ?? [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'query failed';
    return { data: [], warning: `${source}: ${message}` };
  }
}

export function useConversationDebugTimeline(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['conversation-debug-timeline', conversationId],
    enabled: !!conversationId && enabled,
    queryFn: async () => {
      if (!conversationId) return { events: [] as TimelineEvent[], warnings: [] as string[] };

      const [messages, agentLogs, agentActions, creditEvents] = await Promise.all([
        safeQuery<MessageRow>(
          'messages',
          supabase
            .from('messages')
            .select('id, conversation_id, sender_type, sender_user_id, content, is_internal, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }) as any
        ),
        safeQuery<AgentLogRow>(
          'agent_logs',
          supabase
            .from('agent_logs')
            .select('id, conversation_id, event_type, payload, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }) as any
        ),
        safeQuery<AgentActionLogRow>(
          'agent_action_logs',
          supabase
            .from('agent_action_logs')
            .select('id, conversation_id, action_type, actor_type, outcome, outcome_message, credits_consumed, reference_id, execution_id, action_data, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }) as any
        ),
        safeQuery<CreditEventRow>(
          'credits_events',
          supabase
            .from('credits_events')
            .select('id, event_type, credits_consumed, reference_id, metadata, created_at')
            .eq('reference_id', conversationId)
            .order('created_at', { ascending: true }) as any
        ),
      ]);

      const events = sortTimelineEvents([
        ...messages.data.map(normalizeMessage),
        ...agentLogs.data.map(normalizeAgentLog),
        ...agentActions.data.map(normalizeAgentAction),
        ...creditEvents.data.map(normalizeCreditEvent),
      ]);

      const warnings = [messages.warning, agentLogs.warning, agentActions.warning, creditEvents.warning].filter(Boolean) as string[];

      return { events, warnings };
    },
  });
}
