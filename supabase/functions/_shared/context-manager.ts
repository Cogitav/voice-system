import { getServiceClient } from './supabase-client.ts';
import { ConversationContext, ConversationState, ErrorState, CorrectionType } from './types.ts';
import { CONTEXT_RESET_RULES } from './constants.ts';

export function createEmptyContext(): ConversationContext {
  return {
    state: 'idle',
    previous_state: null,
    current_intent: null,
    service_id: null,
    service_name: null,
    service_source: null,
    service_locked: false,
    preferred_date: null,
    preferred_time: null,
    available_slots: [],
    selected_slot: null,
    slots_page: 0,
    slots_generated_for_date: null,
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_reason: null,
    booking_lifecycle_id: null,
    execution_id: null,
    agendamento_id: null,
    reschedule_from_agendamento_id: null,
    reschedule_new_date: null,
    reschedule_new_time: null,
    reschedule_new_slot: null,
    confirmed_snapshot: null,
    fields_collected: [],
    fields_missing: [],
    consecutive_errors: 0,
    last_error: null,
    language: 'pt-PT',
    context_version: 1,
    updated_at: new Date().toISOString(),
    error_context: {
      consecutive_errors: 0,
      field_attempts: {
        customer_email: 0,
        customer_phone: 0,
        customer_name: 0,
        preferred_date: 0,
      },
      frustration_consecutive: 0,
      last_error_type: null,
      last_error_timestamp: null,
    },
  };
}

export async function getContext(conversationId: string): Promise<ConversationContext> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('conversations')
    .select('conversation_context, context_version')
    .eq('id', conversationId)
    .single();

  if (error || !data) throw new Error(`Failed to load context for ${conversationId}`);

  const stored = data.conversation_context as Partial<ConversationContext>;
  const empty = createEmptyContext();
  return {
    ...empty,
    ...stored,
    context_version: data.context_version ?? 1,
  };
}

export async function updateContext(
  conversationId: string,
  updates: Partial<ConversationContext>,
  currentVersion: number
): Promise<ConversationContext> {
  const db = getServiceClient();

  const current = await getContext(conversationId);

  if (current.context_version !== currentVersion) {
    throw new Error(`Context version conflict: expected ${currentVersion}, got ${current.context_version}`);
  }

  // If preferred_date changed, clear slot-related fields
  if (updates.preferred_date && updates.preferred_date !== current.preferred_date) {
    updates.available_slots = [];
    updates.selected_slot = null;
    updates.slots_page = 0;
    updates.slots_generated_for_date = null;
  }

  const newContext: ConversationContext = {
    ...current,
    ...updates,
    previous_state: updates.state ? current.state : current.previous_state,
    context_version: currentVersion + 1,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('conversations')
    .update({
      conversation_context: newContext,
      conversation_state: newContext.state,
      context_version: newContext.context_version,
    })
    .eq('id', conversationId)
    .eq('context_version', currentVersion);

  if (error) throw new Error(`Failed to update context: ${error.message}`);

  return newContext;
}

export async function setConversationState(
  conversationId: string,
  newState: ConversationState,
  currentVersion: number
): Promise<ConversationContext> {
  return updateContext(conversationId, { state: newState }, currentVersion);
}

export function resetPartialContext(
  context: ConversationContext,
  correctionType: CorrectionType
): ConversationContext {
  const rules = CONTEXT_RESET_RULES[correctionType];
  if (rules.clear.includes('ALL')) {
    return {
      ...createEmptyContext(),
      language: context.language,
      context_version: context.context_version,
      updated_at: context.updated_at,
    };
  }
  const updated = { ...context };
  for (const field of rules.clear) {
    (updated as any)[field] = null;
  }
  return updated;
}

export function accumulateField(
  context: ConversationContext,
  field: keyof ConversationContext,
  value: unknown
): ConversationContext {
  if (value === null || value === undefined || value === '') return context;
  const updated = { ...context, [field]: value };
  const fieldStr = field as string;
  if (!updated.fields_collected.includes(fieldStr)) {
    updated.fields_collected = [...updated.fields_collected, fieldStr];
  }
  updated.fields_missing = updated.fields_missing.filter(f => f !== fieldStr);
  return updated;
}

export function getGroupedMissingFields(context: ConversationContext): string[] {
  const required = ['customer_name', 'customer_email', 'customer_phone', 'service_id', 'preferred_date'];
  return required.filter(field => {
    const value = (context as any)[field];
    return value === null || value === undefined || value === '';
  });
}
