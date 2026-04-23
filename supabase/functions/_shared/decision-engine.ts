import { ActionType } from './action-types.ts';
import {
  DecisionEngineInput,
  DecisionEngineOutput,
} from './decision-types.ts';
import { ConversationContext, ConversationState, LLMExtraction } from './types.ts';

const ACTIVE_BOOKING_STATES = new Set<string>([
  'collecting_service',
  'collecting_date',
  'collecting_personal_data',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
  'booking_processing',
]);

function isShortConfirmationLike(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    'sim',
    'confirmo',
    'confirmar',
    'ok',
    'certo',
    'correto',
    'exato',
    'perfeito',
    'yes',
  ].includes(normalized);
}

function hasChangeSignal(extraction: LLMExtraction, userMessage: string): boolean {
  const lower = userMessage.toLowerCase();

  if (extraction.confirmation && extraction.confirmation !== 'CONFIRM') {
    return true;
  }

  if (extraction.intent === 'DATE_CHANGE' || extraction.intent === 'CORRECTION') {
    return true;
  }

  if (
    lower.includes('afinal') ||
    lower.includes('antes') ||
    lower.includes('depois') ||
    lower.includes('mudar') ||
    lower.includes('alterar') ||
    lower.includes('trocar')
  ) {
    return true;
  }

  if (extraction.date_parsed || extraction.time_parsed) {
    return true;
  }

  return false;
}

function hasRequiredPersonalData(
  context: ConversationContext,
  requirePhone: boolean
): boolean {
  if (!context.customer_name) return false;
  if (!context.customer_email) return false;
  if (requirePhone && !context.customer_phone) return false;
  return true;
}

function missingPersonalFields(
  context: ConversationContext,
  requirePhone: boolean
): string[] {
  const missing: string[] = [];
  if (!context.customer_name) missing.push('customer_name');
  if (!context.customer_email) missing.push('customer_email');
  if (requirePhone && !context.customer_phone) missing.push('customer_phone');
  return missing;
}

function shouldHandoff(context: ConversationContext, extraction: LLMExtraction): boolean {
  if (extraction.intent === 'HUMAN_REQUEST') return true;
  if (context.error_context?.consecutive_errors >= 3) return true;
  return false;
}

function isActiveBookingState(state: ConversationState | string): boolean {
  return ACTIVE_BOOKING_STATES.has(String(state));
}

function hasSoftServiceSignal(extraction: LLMExtraction): boolean {
  return Array.isArray(extraction.service_keywords) &&
    extraction.service_keywords.some((keyword) => typeof keyword === 'string' && keyword.trim().length > 0) &&
    extraction.confidence >= 0.5;
}

function shouldAnswerInfo(context: ConversationContext, extraction: LLMExtraction): boolean {
  if (isActiveBookingState(context.state)) return false;
  if (hasSoftServiceSignal(extraction)) return false;
  return extraction.intent === 'INFO_REQUEST';
}

function shouldStartCancel(extraction: LLMExtraction): boolean {
  return extraction.intent === 'CANCEL';
}

function shouldStartReschedule(extraction: LLMExtraction): boolean {
  return extraction.intent === 'RESCHEDULE';
}

function isCompletedState(state: ConversationState): boolean {
  return state === 'completed';
}

function hasSelectedSlot(context: ConversationContext): boolean {
  return !!context.selected_slot;
}

function hasAvailableSlots(context: ConversationContext): boolean {
  return Array.isArray(context.available_slots) && context.available_slots.length > 0;
}

function hasService(context: ConversationContext): boolean {
  return !!context.service_id;
}

function hasDate(context: ConversationContext): boolean {
  return !!context.preferred_date;
}

function needsReason(context: ConversationContext, requireReason: boolean): boolean {
  if (!requireReason) return false;
  return !context.customer_reason;
}

function hasClearConfirmation(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (context.state !== 'awaiting_confirmation') return false;
  if (!context.selected_slot) return false;
  if (hasChangeSignal(extraction, userMessage)) return false;

  if (extraction.confirmation === 'CONFIRM') return true;
  if (isShortConfirmationLike(userMessage)) return true;

  return false;
}

function canTrySlotSelection(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (!hasAvailableSlots(context)) return false;
  if (extraction.time_parsed) return false;

  if (context.state === 'awaiting_slot_selection') return true;

  if (
    context.state === 'awaiting_confirmation' &&
    hasChangeSignal(extraction, userMessage)
  ) {
    return true;
  }

  return false;
}

function canSearchSlotByTime(context: ConversationContext, extraction: LLMExtraction): boolean {
  return !!extraction.time_parsed && hasAvailableSlots(context);
}

function hasServiceResolutionSignal(
  extraction: LLMExtraction,
  userMessage: string
): boolean {
  if (Array.isArray(extraction.service_keywords) && extraction.service_keywords.some((keyword) => typeof keyword === 'string' && keyword.trim().length > 0)) {
    return true;
  }

  if (!userMessage.trim()) return false;
  if (isShortConfirmationLike(userMessage)) return false;
  if (extraction.date_parsed || extraction.time_parsed) return false;
  if (extraction.intent === 'CANCEL' || extraction.intent === 'RESCHEDULE' || extraction.intent === 'HUMAN_REQUEST') {
    return false;
  }

  const normalized = userMessage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /[A-Za-z0-9]/.test(normalized);
}

function buildDecision(
  action: ActionType,
  proposed_state: ConversationState,
  confidence: number,
  reason: string,
  payload?: Record<string, unknown>
): DecisionEngineOutput {
  return {
    action,
    proposed_state,
    confidence,
    reason,
    payload,
  };
}

function decideFromActiveBookingState(
  context: ConversationContext,
  extraction: LLMExtraction,
  userMessage: string,
  requirePhone: boolean,
  requireReason: boolean
): DecisionEngineOutput | null {
  const state = String(context.state);
  if (!isActiveBookingState(state)) return null;

  const missingPersonal = missingPersonalFields(context, requirePhone);
  const missingReason = needsReason(context, requireReason);

  if (state === 'collecting_service' && !hasService(context)) {
    const looksLikeServiceAnswer = hasServiceResolutionSignal(extraction, userMessage);
    return buildDecision(
      'ASK_SERVICE',
      'collecting_service',
      looksLikeServiceAnswer ? 0.98 : 0.95,
      looksLikeServiceAnswer
        ? 'Active collecting_service state: treat current message as a service resolution attempt until a service is clearly resolved'
        : 'Active collecting_service state: service is still missing'
    );
  }

  if (
    (state === 'collecting_date' || state === 'collecting_data') &&
    hasService(context) &&
    !hasDate(context)
  ) {
    return buildDecision(
      'ASK_DATE',
      'collecting_data',
      0.96,
      'Active date collection state: continue collecting preferred_date before handling other intents'
    );
  }

  if (
    (state === 'collecting_personal_data' || state === 'collecting_data') &&
    hasService(context) &&
    hasDate(context) &&
    (missingPersonal.length > 0 || missingReason)
  ) {
    return buildDecision(
      'ASK_PERSONAL_DATA',
      'collecting_personal_data',
      0.96,
      'Active personal data collection state: continue collecting required booking data',
      { missing_fields: missingReason ? [...missingPersonal, 'customer_reason'] : missingPersonal }
    );
  }

  if (state === 'awaiting_slot_selection') {
    if (canSearchSlotByTime(context, extraction)) {
      return buildDecision(
        'SLOT_SEARCH_BY_TIME',
        'awaiting_confirmation',
        0.94,
        'Active awaiting_slot_selection state: user provided a specific time, resolve by time before index selection'
      );
    }

    if (canTrySlotSelection(context, extraction, userMessage)) {
      return buildDecision(
        'SELECT_SLOT',
        'awaiting_confirmation',
        0.9,
        'Active awaiting_slot_selection state: resolve the user message against the available slots first'
      );
    }

    if (hasAvailableSlots(context)) {
      return buildDecision(
        'SHOW_SLOTS',
        'awaiting_slot_selection',
        0.9,
        'Active awaiting_slot_selection state: keep the user focused on choosing one of the available slots'
      );
    }
  }

  if (state === 'awaiting_confirmation') {
    if (hasClearConfirmation(context, extraction, userMessage)) {
      return buildDecision(
        'CREATE_BOOKING',
        'booking_processing',
        0.96,
        'Active awaiting_confirmation state: explicit confirmation should create the booking'
      );
    }

    if (canSearchSlotByTime(context, extraction)) {
      return buildDecision(
        'SLOT_SEARCH_BY_TIME',
        'awaiting_confirmation',
        0.94,
        'Active awaiting_confirmation state: user provided a time correction, resolve by time'
      );
    }

    if (canTrySlotSelection(context, extraction, userMessage)) {
      return buildDecision(
        'SELECT_SLOT',
        'awaiting_confirmation',
        0.9,
        'Active awaiting_confirmation state: treat corrections as slot changes before anything else'
      );
    }

    if (missingPersonal.length > 0) {
      return buildDecision(
        'ASK_PERSONAL_DATA',
        'collecting_personal_data',
        0.96,
        'Active awaiting_confirmation state: required personal data is still missing',
        { missing_fields: missingPersonal }
      );
    }

    if (missingReason) {
      return buildDecision(
        'ASK_PERSONAL_DATA',
        'collecting_personal_data',
        0.84,
        'Active awaiting_confirmation state: required booking reason is still missing',
        { missing_fields: ['customer_reason'] }
      );
    }

    if (hasSelectedSlot(context)) {
      return buildDecision(
        'CONFIRM_BOOKING',
        'awaiting_confirmation',
        0.94,
        'Active awaiting_confirmation state: keep the confirmation step in place'
      );
    }
  }

  return null;
}

export function decideNextAction(input: DecisionEngineInput): DecisionEngineOutput {
  const { context, extraction, userMessage, config } = input;

  if (shouldHandoff(context, extraction)) {
    return buildDecision(
      'HANDOFF',
      'handoff',
      1,
      'Human requested or system error threshold reached'
    );
  }

  if (shouldStartCancel(extraction)) {
    return buildDecision(
      'START_CANCEL',
      'cancel_collecting_target',
      0.98,
      'User requested cancellation'
    );
  }

  if (shouldStartReschedule(extraction)) {
    return buildDecision(
      'START_RESCHEDULE',
      'reschedule_collecting_target',
      0.98,
      'User requested reschedule'
    );
  }

  if (isCompletedState(context.state)) {
    if (extraction.intent === 'BOOKING_NEW') {
      return buildDecision(
        'RESET_FLOW',
        'idle',
        0.95,
        'Completed conversation received a new booking intent'
      );
    }

    if (extraction.intent === 'INFO_REQUEST') {
      return buildDecision(
        'ANSWER_INFO',
        'completed',
        0.9,
        'Completed conversation with informational question'
      );
    }

    if (
      extraction.intent === 'UNCLEAR' ||
      extraction.intent === 'CORRECTION' ||
      extraction.intent === 'DATE_CHANGE' ||
      extraction.intent === 'CONFIRMATION'
    ) {
      return buildDecision(
        'ASK_CLARIFICATION',
        'completed',
        0.65,
        'Completed conversation received ambiguous follow-up'
      );
    }
  }

  const activeStateDecision = decideFromActiveBookingState(
    context,
    extraction,
    userMessage,
    config.requirePhone,
    config.requireReason
  );
  if (activeStateDecision) {
    return activeStateDecision;
  }

  if (
    shouldAnswerInfo(context, extraction) &&
    context.state !== 'awaiting_confirmation' &&
    context.state !== 'booking_processing' &&
    !context.selected_slot
  ) {
    return buildDecision(
      'ANSWER_INFO',
      context.state,
      0.92,
      'Informational request outside critical booking step'
    );
  }

  if (hasClearConfirmation(context, extraction, userMessage)) {
    return buildDecision(
      'CREATE_BOOKING',
      'booking_processing',
      0.96,
      'Explicit confirmation detected in awaiting_confirmation state'
    );
  }

  if (canSearchSlotByTime(context, extraction)) {
    return buildDecision(
      'SLOT_SEARCH_BY_TIME',
      'awaiting_confirmation',
      0.92,
      'Time-based slot selection should be resolved by closest available slot'
    );
  }

  if (canTrySlotSelection(context, extraction, userMessage)) {
    return buildDecision(
      'SELECT_SLOT',
      'awaiting_confirmation',
      0.88,
      'Slot selection or slot change should be resolved against current available slots'
    );
  }

  if (!hasService(context)) {
    return buildDecision(
      'ASK_SERVICE',
      'collecting_service',
      0.95,
      'Missing service_id in booking flow'
    );
  }

  if (hasSelectedSlot(context)) {
    const missingPersonalForSelectedSlot = missingPersonalFields(context, config.requirePhone);
    if (missingPersonalForSelectedSlot.length > 0) {
      return buildDecision(
        'ASK_PERSONAL_DATA',
        'collecting_personal_data',
        0.95,
        'Selected slot exists but required personal data is missing',
        { missing_fields: missingPersonalForSelectedSlot }
      );
    }

    if (needsReason(context, config.requireReason)) {
      return buildDecision(
        'ASK_PERSONAL_DATA',
        'collecting_personal_data',
        0.82,
        'Selected slot exists but required booking reason is missing',
        { missing_fields: ['customer_reason'] }
      );
    }

    if (hasRequiredPersonalData(context, config.requirePhone)) {
      return buildDecision(
        'CONFIRM_BOOKING',
        'awaiting_confirmation',
        0.94,
        'Booking has selected slot and required personal data'
      );
    }
  }

  if (hasAvailableSlots(context)) {
    return buildDecision(
      'SHOW_SLOTS',
      'awaiting_slot_selection',
      0.9,
      'Available slots already exist in context'
    );
  }

  if (!hasDate(context)) {
    return buildDecision(
      'ASK_DATE',
      'collecting_date',
      0.95,
      'Missing preferred_date in booking flow'
    );
  }

  const missingPersonal = missingPersonalFields(context, config.requirePhone);
  if (missingPersonal.length > 0) {
    return buildDecision(
      'ASK_PERSONAL_DATA',
      'collecting_personal_data',
      0.95,
      'Missing required personal data',
      { missing_fields: missingPersonal }
    );
  }

  if (needsReason(context, config.requireReason)) {
    return buildDecision(
      'ASK_PERSONAL_DATA',
      'collecting_personal_data',
      0.82,
      'Missing required booking reason',
      { missing_fields: ['customer_reason'] }
    );
  }

  return buildDecision(
    'GENERATE_SLOTS',
    'awaiting_slot_selection',
    0.9,
    'Service, date and required personal data exist; next step is slot generation'
  );
}
