/**
 * Conversation Context Helpers
 *
 * Read / update conversation_state and conversation_context
 * without touching any booking or AI prompt logic.
 */

import { type ConversationState, VALID_STATES, isValidTransition } from './conversation-states.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ConversationContext {
  conversation_state: ConversationState;
  conversation_context: Record<string, unknown>;
}

/**
 * Fetch current state + context for a conversation.
 */
export async function getConversationContext(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<ConversationContext | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('conversation_state, conversation_context')
    .eq('id', conversationId)
    .single();

  if (error || !data) {
    console.error('[ConversationContext] Failed to fetch:', error);
    return null;
  }

  return {
    conversation_state: data.conversation_state as ConversationState,
    conversation_context: (data.conversation_context ?? {}) as Record<string, unknown>,
  };
}

/**
 * Set conversation_state to a new value.
 */
export async function updateConversationState(
  supabase: SupabaseClient,
  conversationId: string,
  newState: ConversationState,
): Promise<boolean> {
  if (!VALID_STATES.includes(newState)) {
    console.error(`[ConversationState] Invalid state: ${newState}`);
    return false;
  }

  const { error } = await supabase
    .from('conversations')
    .update({ conversation_state: newState })
    .eq('id', conversationId);

  if (error) {
    console.error('[ConversationState] Update failed:', error);
    return false;
  }

  console.log(`[ConversationState] Updated to: ${newState}`);
  return true;
}

/**
 * Merge partial data into conversation_context (shallow merge).
 * Fetches existing context, merges, and writes back.
 */
/**
 * Critical fields that must NEVER be overwritten with null/undefined
 * once they hold a value in the existing context.
 */
const CRITICAL_FIELDS = [
  'service_id',
  'reason_normalized',
  'booking_in_progress',
  'preferred_date',
  'selected_datetime',
  'confirmed_snapshot',
  'appointment_id',
  'booking_id',
  'reason_original',
];

export async function mergeConversationContext(
  supabase: SupabaseClient,
  conversationId: string,
  partialContext: Record<string, unknown>,
): Promise<boolean> {
  const existing = await getConversationContext(supabase, conversationId);

  if (!existing) {
    console.error('[ConversationContext] Cannot merge — conversation not found');
    return false;
  }

  const existingCtx = existing.conversation_context;

  // 1) Filter undefined values & protect critical fields
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partialContext)) {
    // Skip undefined always
    if (value === undefined) {
      console.log(`[ContextIntegrityGuard] Skipping undefined key "${key}"`);
      continue;
    }
    // Protect critical fields from null if they already have a value
    if (value === null && CRITICAL_FIELDS.includes(key) && existingCtx[key] != null) {
      console.log(`[ContextIntegrityGuard] Prevented overwrite of ${key} (current: ${existingCtx[key]})`);
      continue;
    }
    // Skip null for non-critical fields too — never overwrite with empty
    if (value === null) {
      console.log(`[ContextIntegrityGuard] Skipping null value for key "${key}"`);
      continue;
    }
    sanitized[key] = value;
  }

  // 4) Service consistency guard — preserve service_id if reason_normalized exists
  if (existingCtx.service_id && !sanitized.service_id) {
    // Ensure service_id is never lost
    sanitized.service_id = existingCtx.service_id;
  }
  if (existingCtx.reason_normalized && !sanitized.reason_normalized) {
    sanitized.reason_normalized = existingCtx.reason_normalized;
  }

  if (Object.keys(sanitized).length === 0) {
    console.log('[ConversationContext] No valid fields to merge after sanitization');
    return true;
  }

  // 3) Safe merge — spread existing first, then filtered updates
  const merged = { ...existingCtx, ...sanitized };

  const { error } = await supabase
    .from('conversations')
    .update({ conversation_context: merged })
    .eq('id', conversationId);

  if (error) {
    console.error('[ConversationContext] Merge failed:', error);
    return false;
  }

  const updatedKeys = Object.keys(sanitized).join(', ');
  console.log(`[ConversationContext] Updated keys: ${updatedKeys}`);
  return true;
}
