/**
 * Conversation State Machine — State Definitions v3.0
 *
 * Deterministic state machine for structured conversation flow.
 * Used by chat-ai-response and conversation-context helpers.
 */

export type ConversationState =
  | 'idle'
  | 'collecting_service'
  | 'collecting_data'
  | 'awaiting_confirmation'
  | 'booking_processing'
  | 'booking_active'
  | 'rescheduling'
  | 'awaiting_slot_selection';

export const VALID_STATES: ConversationState[] = [
  'idle',
  'collecting_service',
  'collecting_data',
  'awaiting_confirmation',
  'booking_processing',
  'booking_active',
  'rescheduling',
  'awaiting_slot_selection',
];

/**
 * Valid state transitions. Key = current state, Value = allowed next states.
 */
export const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ['collecting_data', 'collecting_service', 'booking_active'],
  collecting_service: ['collecting_data'],
  collecting_data: ['awaiting_confirmation', 'awaiting_slot_selection'],
  awaiting_confirmation: ['booking_processing', 'collecting_data', 'rescheduling'],
  booking_processing: ['booking_active', 'collecting_data', 'awaiting_slot_selection'],
  booking_active: ['rescheduling', 'collecting_data', 'idle'],
  rescheduling: ['awaiting_confirmation', 'booking_active'],
  awaiting_slot_selection: ['awaiting_confirmation', 'collecting_data'],
};

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
