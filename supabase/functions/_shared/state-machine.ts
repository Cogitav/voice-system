import { ConversationState } from './types.ts';

const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ['collecting_data', 'human_handoff'],
  collecting_data: ['awaiting_slot_selection', 'awaiting_confirmation', 'human_handoff', 'error'],
  awaiting_slot_selection: ['collecting_data', 'awaiting_confirmation', 'human_handoff', 'error'],
  awaiting_confirmation: ['booking_processing', 'collecting_data', 'awaiting_slot_selection', 'human_handoff'],
  booking_processing: ['completed', 'awaiting_slot_selection', 'error'],
  completed: ['idle', 'collecting_data'],
  reschedule_pending: ['reschedule_confirm', 'collecting_data', 'error'],
  reschedule_confirm: ['completed', 'reschedule_pending', 'error'],
  cancel_pending: ['completed', 'collecting_data', 'error'],
  human_handoff: ['idle', 'collecting_data'],
  error: ['collecting_data', 'idle', 'human_handoff'],
};

export interface TransitionResult {
  valid: boolean;
  next_state: ConversationState;
  reason: string | null;
}

export function transition(current: ConversationState, next: ConversationState): TransitionResult {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  if (allowed.includes(next)) {
    return { valid: true, next_state: next, reason: null };
  }
  return {
    valid: false,
    next_state: current,
    reason: `Transition ${current} → ${next} is not allowed`,
  };
}

export function canTransition(current: ConversationState, next: ConversationState): boolean {
  return (VALID_TRANSITIONS[current] ?? []).includes(next);
}

export function getAllowedTransitions(current: ConversationState): ConversationState[] {
  return VALID_TRANSITIONS[current] ?? [];
}

export function isTerminalState(state: ConversationState): boolean {
  return state === 'completed';
}

export function isErrorState(state: ConversationState): boolean {
  return state === 'error';
}

export function requiresHumanIntervention(state: ConversationState): boolean {
  return state === 'human_handoff';
}
