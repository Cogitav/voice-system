import { ActionType } from './action-types.ts';
import { ConversationContext, ConversationState, LLMExtraction } from './types.ts';

export interface DecisionEngineConfig {
  requirePhone: boolean;
  requireReason: boolean;
  // Passed by the live router today even though the decision engine does not use them yet.
  allowSameDayBooking?: boolean;
  minimumAdvanceMinutes?: number;
}

export interface DecisionEngineInput {
  context: ConversationContext;
  extraction: LLMExtraction;
  userMessage: string;
  config: DecisionEngineConfig;
}

export interface DecisionEngineOutput {
  action: ActionType;
  proposed_state: ConversationState;
  confidence: number;
  reason: string;
  payload?: Record<string, unknown>;
}
