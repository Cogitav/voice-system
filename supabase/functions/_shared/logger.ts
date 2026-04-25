import { getServiceClient } from './supabase-client.ts';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  empresa_id: string;
  conversation_id?: string;
  event_type: string;
  message: string;
  payload?: Record<string, unknown>;
}

export async function log(entry: LogEntry, level: LogLevel = 'info'): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from('agent_runtime_logs').insert({
      empresa_id: entry.empresa_id,
      conversation_id: entry.conversation_id ?? null,
      event_type: entry.event_type,
      message: entry.message,
      payload: { ...entry.payload, level },
    });
  } catch {
    // Never throw from logger
    console.error('[LOGGER_FAILED]', entry.event_type, entry.message);
  }
}

export function logAgentEvent(
  event_type: string,
  payload: Record<string, unknown> = {},
  conversation_id?: string | null,
): Promise<void> {
  // TODO: Add a scheduled retention job to delete agent_logs older than 60 days.
  const write = async () => {
    try {
      const db = getServiceClient();
      await db.from('agent_logs').insert({
        conversation_id: conversation_id ?? null,
        event_type,
        payload,
      });
    } catch {
      // Observability must never affect the conversation flow.
    }
  };

  const task = write();
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  };
  runtime.EdgeRuntime?.waitUntil?.(task);
  return task;
}

export async function logAction(params: {
  empresa_id: string;
  agent_id: string;
  conversation_id: string;
  action_type: string;
  action_data: Record<string, unknown>;
  outcome: 'success' | 'blocked' | 'failed';
  outcome_message?: string;
  credits_consumed?: number;
}): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from('agent_action_logs').insert({
      empresa_id: params.empresa_id,
      agent_id: params.agent_id,
      conversation_id: params.conversation_id,
      action_type: params.action_type,
      action_data: params.action_data,
      actor_type: 'ai',
      outcome: params.outcome,
      outcome_message: params.outcome_message ?? null,
      credits_consumed: params.credits_consumed ?? 0,
    });
  } catch {
    console.error('[ACTION_LOG_FAILED]', params.action_type);
  }
}
