import { ConversationState } from './types.ts';
import { VALID_TRANSITIONS } from './constants.ts';

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

export function requiresHumanIntervention(state: ConversationState): boolean {
  return state === 'human_handoff';
}
