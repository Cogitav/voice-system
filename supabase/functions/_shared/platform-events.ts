/**
 * Platform Event System v2.0
 *
 * Centralized event emitter that routes platform actions
 * to the FollowUpRules engine for configurable email notifications.
 *
 * All events run asynchronously and never block the caller.
 *
 * Does NOT modify: intent router, booking engine, service resolver, state machine.
 */

import { executeFollowUpRules, type FollowUpEventPayload } from './follow-up-engine.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// =============================================
// Types
// =============================================

export type PlatformEventType =
  | 'booking_confirmed'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'conversation_closed'
  | 'human_handoff_completed';

export interface PlatformEventPayload {
  client_name?: string;
  service_name?: string;
  appointment_date?: string;
  appointment_time?: string;
  email?: string;
  summary?: string;
  empresa_nome?: string;
  empresa_email?: string;
  [key: string]: string | undefined;
}

export interface EmitPlatformEventParams {
  type: PlatformEventType;
  empresa_id: string;
  conversation_id?: string;
  payload: PlatformEventPayload;
  supabase?: SupabaseClient;
}

// =============================================
// Event → FollowUp Intent Mapping
// =============================================

const EVENT_TO_INTENT: Record<PlatformEventType, string | null> = {
  booking_confirmed: 'agendamento',
  booking_rescheduled: 'agendamento',
  booking_cancelled: 'cancelamento',
  conversation_closed: 'informacao',
  human_handoff_completed: null, // No follow-up for handoff
};

// =============================================
// Event Emitter
// =============================================

/**
 * Emit a platform event. This is fire-and-forget — never throws.
 * Routes events through the FollowUpRules engine instead of hardcoded templates.
 */
export async function emitPlatformEvent(params: EmitPlatformEventParams): Promise<void> {
  const { type, empresa_id, payload, supabase } = params;

  console.log(`[PlatformEvents] Event: ${type}, empresa: ${empresa_id}`);

  try {
    const intent = EVENT_TO_INTENT[type];
    if (!intent) {
      console.log(`[PlatformEvents] No follow-up intent for event: ${type} — skipping`);
      return;
    }

    if (!supabase) {
      console.warn(`[PlatformEvents] No supabase client — skipping follow-up execution`);
      return;
    }

    // Map platform event payload to follow-up engine payload
    const followUpPayload: FollowUpEventPayload = {
      cliente_nome: payload.client_name,
      empresa_nome: payload.empresa_nome,
      servico_nome: payload.service_name,
      data_agendamento: payload.appointment_date,
      hora_agendamento: payload.appointment_time,
      resumo_atendimento: payload.summary,
      contacto_empresa: payload.empresa_email,
      email: payload.email,
    };

    // Route through FollowUpRules engine
    await executeFollowUpRules({
      empresa_id,
      intent,
      payload: followUpPayload,
      supabase,
    });
  } catch (err) {
    // Never throw — events are non-blocking
    console.error(`[PlatformEvents] Error handling ${type}:`, err);
  }
}
