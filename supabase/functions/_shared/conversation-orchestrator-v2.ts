/**
 * Conversation Orchestrator V2
 *
 * Single source of truth for conversation flow decisions.
 * Replaces: intent lock, stability layer, booking context cleanup,
 * commercial bridge, scheduling priority guard.
 *
 * This module is a PURE DECISION LAYER — no I/O, no DB writes, no HTTP responses.
 * All side effects are returned as instructions to the caller.
 */

import { type ConversationState } from './conversation-states.ts';
import {
  Intent,
  classifyIntent,
  classifyIntentDeterministic,
  isBookingIntent,
  BOOKING_INTENT_FAMILY,
} from './intent-router.ts';

// =============================================
// Types
// =============================================

export interface OrchestratorInput {
  message: string;
  currentState: ConversationState;
  currentContext: Record<string, unknown>;
  /** Fields extracted by the deterministic extractor in the current message */
  deterministicFields: Record<string, unknown>;
  /** Whether an active booking exists (appointment_id or booking_active state) */
  hasActiveBooking: boolean;
  /** Whether company has bookable services with resources */
  hasBookableServices: boolean;
}

export interface OrchestratorDecision {
  /** The effective intent to use for this message */
  effectiveIntent: Intent | string;
  /** Whether the state machine should run */
  runStateMachine: boolean;
  /** Whether the scheduling pipeline should be active */
  runSchedulingPipeline: boolean;
  /** Context fields to merge BEFORE state machine runs */
  contextUpdates: Record<string, unknown>;
  /** Whether to reset the conversation flow (topic change) */
  resetFlow: boolean;
  /** Fields to clear on reset */
  fieldsToClear?: string[];
  /** State to force (only on reset) */
  forcedState?: ConversationState;
  /** Whether to skip LLM intent classification entirely */
  skipIntentClassification: boolean;
  /** Debug log messages */
  logs: string[];
}

// =============================================
// Constants
// =============================================

const CRITICAL_BOOKING_STATES: ConversationState[] = [
  'booking_processing',
  'awaiting_slot_selection',
  'awaiting_confirmation',
];

const FLOW_ACTIVE_STATES: ConversationState[] = [
  'collecting_service',
  'collecting_data',
  'awaiting_slot_selection',
  'awaiting_confirmation',
  'booking_processing',
  'booking_active',
  'rescheduling',
];

const BOOKING_CONTEXT_SIGNALS = [
  'service_id',
  'reason_normalized',
  'preferred_date',
  'selected_datetime',
  'booking_in_progress',
  'conflict_suggestions',
];

const BOOKING_TRANSIENT_FIELDS = [
  'service_id', 'reason', 'reason_original', 'reason_normalized',
  'booking_in_progress', 'confirmed_start', 'confirmed_end', 'booking_id',
];

// =============================================
// Message Parser
// =============================================

export interface ParsedMessage {
  /** Whether this looks like a user confirmation */
  isConfirmation: boolean;
  /** Whether there are scheduling signal words */
  hasSchedulingSignals: boolean;
  /** Whether a date/time was extracted */
  hasDateExtracted: boolean;
  /** The classified intent from deterministic classification */
  deterministicIntent: Intent;
  /** The classified intent from keyword classification */
  keywordIntent: Intent;
}

export function parseMessage(
  message: string,
  deterministicFields: Record<string, unknown>,
): ParsedMessage {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const schedulingSignals = /\b(dia|data|disponibilidade|disponivel|visita|reuniao|agendar|marcar|falar com|quinta|sexta|segunda|terca|quarta|amanha|amanhã|hoje|semana que vem|proxima semana|de manha|de tarde|pela manha|pela tarde)\b/i;

  return {
    isConfirmation: false, // Handled by existing isUserConfirmation()
    hasSchedulingSignals: schedulingSignals.test(lower),
    hasDateExtracted: !!deterministicFields.preferred_date,
    deterministicIntent: classifyIntentDeterministic(message),
    keywordIntent: classifyIntent(message),
  };
}

// =============================================
// Orchestrator Core
// =============================================

/**
 * Central decision function. Pure logic — no side effects.
 *
 * Determines:
 * 1. What intent to use
 * 2. Whether the state machine should run
 * 3. Whether context needs updates before state machine
 * 4. Whether a flow reset is needed
 */
export function orchestrate(input: OrchestratorInput): OrchestratorDecision {
  const {
    message,
    currentState,
    currentContext,
    deterministicFields,
    hasActiveBooking,
    hasBookableServices,
  } = input;

  const parsed = parseMessage(message, deterministicFields);
  const logs: string[] = [];
  const contextUpdates: Record<string, unknown> = {};

  const previousIntent = currentContext.current_intent as Intent | undefined;
  const bookingInProgress = currentContext.booking_in_progress === true;
  const isCriticalState = CRITICAL_BOOKING_STATES.includes(currentState);
  const isFlowActive = FLOW_ACTIVE_STATES.includes(currentState);

  // Check if booking context signals exist
  const hasBookingSignals = BOOKING_CONTEXT_SIGNALS.some(key => {
    const val = currentContext[key];
    if (val === null || val === undefined || val === false) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  // =============================================
  // RULE 1: BOOKING FLOW LOCK
  // When booking is in progress, freeze intent classification
  // =============================================
  if (bookingInProgress) {
    logs.push(`[Orchestrator] BookingFlowLock: booking_in_progress=true — intent frozen`);
    return {
      effectiveIntent: previousIntent || Intent.BOOKING_NEW,
      runStateMachine: true,
      runSchedulingPipeline: true,
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: true,
      logs,
    };
  }

  // =============================================
  // RULE 2: CRITICAL STATE FREEZE
  // In booking_processing, awaiting_slot_selection, awaiting_confirmation:
  // Only allow date/time corrections, never change intent
  // =============================================
  if (isCriticalState) {
    const hasDateCorrection = parsed.hasDateExtracted;
    if (hasDateCorrection) {
      logs.push(`[Orchestrator] CriticalState: date correction detected in ${currentState} — allowing state machine`);
    } else {
      logs.push(`[Orchestrator] CriticalState: ${currentState} — intent frozen, no date correction`);
    }
    return {
      effectiveIntent: previousIntent || (currentContext.current_intent as string) || Intent.BOOKING_NEW,
      runStateMachine: true,
      runSchedulingPipeline: true,
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: true,
      logs,
    };
  }

  // =============================================
  // RULE 3: ACTIVE FLOW — TOPIC CHANGE DETECTION
  // For non-critical active states, detect genuine topic changes
  // =============================================

  // Non-disruptive intents: informational queries that should NOT reset booking flow
  const NON_DISRUPTIVE_INTENTS = new Set([
    Intent.PRICE_REQUEST,
    Intent.COMMERCIAL_INFO,
    Intent.OTHER,
  ]);

  if (isFlowActive && currentState !== 'idle') {
    // Idle Reset Guard: if booking context fields exist, don't reset
    if (hasBookingSignals) {
      logs.push(`[Orchestrator] FlowActive: booking signals exist in ${currentState} — flow protected`);
      return {
        effectiveIntent: previousIntent || Intent.BOOKING_NEW,
        runStateMachine: true,
        runSchedulingPipeline: true,
        contextUpdates,
        resetFlow: false,
        skipIntentClassification: true,
        logs,
      };
    }

    // Check for genuine topic change (non-booking intent replacing booking intent)
    const peekedIntent = parsed.keywordIntent;
    const bothBookingFamily = BOOKING_INTENT_FAMILY.has(peekedIntent) &&
      BOOKING_INTENT_FAMILY.has(previousIntent as Intent);

    if (bothBookingFamily) {
      logs.push(`[Orchestrator] FlowActive: same booking family (${previousIntent} → ${peekedIntent}) — flow continues`);
      return {
        effectiveIntent: previousIntent || peekedIntent,
        runStateMachine: true,
        runSchedulingPipeline: true,
        contextUpdates,
        resetFlow: false,
        skipIntentClassification: true,
        logs,
      };
    }

    // NON-DISRUPTIVE INTENT GUARD: Price requests, commercial info, etc.
    // These are informational side-questions that should NOT break the booking flow.
    // The booking pipeline continues; the caller handles the interrupt response.
    if (NON_DISRUPTIVE_INTENTS.has(peekedIntent)) {
      logs.push(`[Orchestrator] NonDisruptiveInterrupt: ${peekedIntent} during ${currentState} — flow preserved (intent stays ${previousIntent})`);
      return {
        effectiveIntent: previousIntent || Intent.BOOKING_NEW,
        runStateMachine: true,
        runSchedulingPipeline: isBookingIntent(previousIntent as Intent),
        contextUpdates,
        resetFlow: false,
        skipIntentClassification: true,
        logs,
      };
    }

    if (
      peekedIntent !== Intent.OTHER &&
      previousIntent &&
      peekedIntent !== previousIntent &&
      !BOOKING_INTENT_FAMILY.has(peekedIntent)
    ) {
      // Genuine topic change — reset flow
      logs.push(`[Orchestrator] TopicChange: ${previousIntent} → ${peekedIntent} in ${currentState} — resetting flow`);
      return {
        effectiveIntent: peekedIntent,
        runStateMachine: true,
        runSchedulingPipeline: false,
        contextUpdates: { current_intent: peekedIntent },
        resetFlow: true,
        fieldsToClear: BOOKING_TRANSIENT_FIELDS,
        forcedState: 'idle',
        skipIntentClassification: false,
        logs,
      };
    }

    // Default: continue flow
    logs.push(`[Orchestrator] FlowActive: continuing ${currentState} (locked intent: ${previousIntent || 'none'})`);
    return {
      effectiveIntent: previousIntent || Intent.OTHER,
      runStateMachine: true,
      runSchedulingPipeline: isBookingIntent(previousIntent as Intent),
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: true,
      logs,
    };
  }

  // =============================================
  // RULE 4: IDLE STATE — FULL CLASSIFICATION
  // Run full intent classification and determine routing
  // =============================================
  const classifiedIntent = parsed.keywordIntent;
  logs.push(`[Orchestrator] Idle: classified intent = ${classifiedIntent}`);

  // Smart fallback: OTHER → COMMERCIAL when idle and no booking signals
  let effectiveIntent = classifiedIntent;
  if (effectiveIntent === Intent.OTHER && !hasBookingSignals) {
    effectiveIntent = Intent.COMMERCIAL_INFO;
    logs.push(`[Orchestrator] IntentGate: OTHER → COMMERCIAL_INFO (idle, no booking signals)`);
  }

  contextUpdates.current_intent = effectiveIntent;

  // =============================================
  // RULE 5: COMMERCIAL → BOOKING BRIDGE
  // If commercial intent + bookable services → bridge to booking
  // =============================================
  const isCommercial = effectiveIntent === Intent.COMMERCIAL_INFO;
  const isBooking = isBookingIntent(effectiveIntent as Intent);

  if (isCommercial && hasBookableServices) {
    // Commercial intent with bookable services → bridge to booking pipeline
    // NOTE: booking_in_progress is NOT set here — only the tool handler sets it atomically
    logs.push(`[Orchestrator] CommercialBridge: COMMERCIAL + bookable services → BOOKING_NEW`);
    contextUpdates.current_intent = Intent.BOOKING_NEW;
    return {
      effectiveIntent: Intent.BOOKING_NEW,
      runStateMachine: true,
      runSchedulingPipeline: true,
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: false,
      logs,
    };
  }

  if (isBooking) {
    logs.push(`[Orchestrator] BookingIntent: ${effectiveIntent} — scheduling pipeline active`);
    return {
      effectiveIntent,
      runStateMachine: true,
      runSchedulingPipeline: true,
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: false,
      logs,
    };
  }

  // Non-booking intent — check if booking signals force scheduling
  if (hasBookingSignals) {
    logs.push(`[Orchestrator] SchedulingPriority: non-booking intent but booking signals exist — forcing pipeline`);
    return {
      effectiveIntent,
      runStateMachine: true,
      runSchedulingPipeline: true,
      contextUpdates,
      resetFlow: false,
      skipIntentClassification: false,
      logs,
    };
  }

  // Pure non-booking flow
  logs.push(`[Orchestrator] NonBooking: ${effectiveIntent} — state machine bypassed`);
  return {
    effectiveIntent,
    runStateMachine: false,
    runSchedulingPipeline: false,
    contextUpdates,
    resetFlow: false,
    skipIntentClassification: false,
    logs,
  };
}

// =============================================
// Booking Orchestrator — Deterministic Pipeline
// =============================================

export type BookingAction =
  | 'collect_service'
  | 'collect_data'
  | 'check_availability'
  | 'await_slot_selection'
  | 'await_confirmation'
  | 'booking_processing'
  | 'no_action';

export interface BookingOrchestratorResult {
  action: BookingAction;
  derivedState: ConversationState;
  reason: string;
}

/**
 * Deterministic booking pipeline.
 * Evaluates context fields in strict order and returns the SINGLE next action.
 * 
 * This function is the SOLE AUTHORITY on what happens next in the booking flow.
 * The state machine must NOT trigger availability checks — only this function can.
 * 
 * Pure function — no I/O.
 */
export function bookingOrchestrator(ctx: Record<string, unknown>): BookingOrchestratorResult {
  const hasService = !!ctx.service_id;
  const hasName = !!ctx.customer_name;
  const hasEmail = !!ctx.customer_email;
  const hasPhone = !!ctx.customer_phone;
  const hasCustomerData = hasName && hasEmail && hasPhone;
  const hasDate = !!ctx.preferred_date;
  const preferredDateStr = String(ctx.preferred_date || '');
  const preferredDateHasTime = preferredDateStr.includes('T');
  const hasSelectedSlot = !!ctx.selected_datetime || !!ctx.confirmed_start;
  // If preferred_date has time AND slot_confirmed is true, treat as having a selected slot
  // This handles the case where availability already confirmed this datetime
  const hasEffectiveSlot = hasSelectedSlot || (preferredDateHasTime && ctx.slot_confirmed === true);
  const hasConfirmedSnapshot = !!ctx.confirmed_snapshot;
  const hasSuggestions = Array.isArray(ctx.conflict_suggestions) && (ctx.conflict_suggestions as unknown[]).length > 0;

  console.log(`[BookingOrchestrator] Fields: service=${hasService}, date=${hasDate}, dateHasTime=${preferredDateHasTime}, selectedSlot=${hasSelectedSlot}, effectiveSlot=${hasEffectiveSlot}, suggestions=${hasSuggestions}, customer=${hasCustomerData}, snapshot=${hasConfirmedSnapshot}`);

  // Step 1: Service required
  if (!hasService) {
    return {
      action: 'collect_service',
      derivedState: 'collecting_service',
      reason: 'service_id missing',
    };
  }

  // Step 2: Date required (BEFORE customer data)
  if (!hasDate) {
    return {
      action: 'collect_data',
      derivedState: 'collecting_data',
      reason: 'preferred_date missing',
    };
  }

  // Step 3: If we have suggestions but no selected slot → user must pick
  if (hasSuggestions && !hasEffectiveSlot) {
    return {
      action: 'await_slot_selection',
      derivedState: 'awaiting_slot_selection',
      reason: 'suggestions exist, no slot selected',
    };
  }

  // Step 4: No selected slot and no suggestions → run availability
  if (!hasEffectiveSlot) {
    return {
      action: 'check_availability',
      derivedState: 'collecting_data', // state stays until availability resolves
      reason: 'service + date present, need availability check',
    };
  }

  // Step 5: Customer data required (AFTER slot selection)
  if (!hasCustomerData) {
    return {
      action: 'collect_data',
      derivedState: 'collecting_data',
      reason: `missing customer fields: ${[!hasName && 'name', !hasEmail && 'email', !hasPhone && 'phone'].filter(Boolean).join(', ')}`,
    };
  }

  // Step 6: Slot selected but not confirmed
  if (!hasConfirmedSnapshot) {
    return {
      action: 'await_confirmation',
      derivedState: 'awaiting_confirmation',
      reason: 'slot selected, awaiting user confirmation',
    };
  }

  // Step 7: Everything ready
  return {
    action: 'booking_processing',
    derivedState: 'booking_processing',
    reason: 'all fields present and confirmed',
  };
}

// =============================================
// Early Service Resolution Decision
// =============================================

/**
 * Determine if service resolution should run before the state machine.
 */
export function shouldResolveServiceEarly(
  effectiveIntent: Intent | string,
  currentContext: Record<string, unknown>,
  message: string,
): boolean {
  if (currentContext.service_id) return false;
  if (!message) return false;

  const resolvableIntents = new Set([
    Intent.COMMERCIAL_INFO,
    Intent.BOOKING_NEW,
    Intent.AVAILABILITY_REQUEST,
  ]);

  return resolvableIntents.has(effectiveIntent as Intent);
}

// =============================================
// Booking Context Cleanup Decision
// =============================================

/**
 * Determine if booking transient fields should be cleaned.
 * Only cleans when in idle with non-booking intent.
 */
export function shouldCleanBookingContext(
  effectiveIntent: Intent | string,
  currentState: ConversationState,
  currentContext: Record<string, unknown>,
): { shouldClean: boolean; fieldsToRemove: string[] } {
  if (currentState !== 'idle') return { shouldClean: false, fieldsToRemove: [] };
  if (isBookingIntent(effectiveIntent as Intent)) return { shouldClean: false, fieldsToRemove: [] };

  const fieldsToRemove = BOOKING_TRANSIENT_FIELDS.filter(
    f => currentContext[f] !== undefined && currentContext[f] !== null
  );

  return { shouldClean: fieldsToRemove.length > 0, fieldsToRemove };
}

// =============================================
// State Reconciliation
// =============================================

export interface ReconciliationResult {
  reconciledState: ConversationState;
  changed: boolean;
  reason: string;
}

/**
 * Derive the correct conversation state from the current context fields.
 * Must run BEFORE the state machine to fix state/context drift.
 *
 * Pure function — no I/O.
 */
export function reconcileState(
  currentState: ConversationState,
  ctx: Record<string, unknown>,
): ReconciliationResult {
  // Never touch terminal/active booking states — those are engine-driven
  const engineStates: ConversationState[] = ['booking_processing', 'booking_active', 'rescheduling'];
  if (engineStates.includes(currentState)) {
    return { reconciledState: currentState, changed: false, reason: 'engine-driven state — skip reconciliation' };
  }

  const bookingInProgress = ctx.booking_in_progress === true;
  const hasService = !!ctx.service_id;
  const hasDate = !!ctx.preferred_date;

  // Only reconcile if we're in a booking flow
  if (!bookingInProgress && !hasService && !hasDate) {
    return { reconciledState: currentState, changed: false, reason: 'no booking signals — skip' };
  }

  // Use bookingOrchestrator as the single source of truth for derived state
  const decision = bookingOrchestrator(ctx);
  const derivedState = decision.derivedState;

  if (derivedState === currentState) {
    return { reconciledState: currentState, changed: false, reason: `aligned: ${decision.reason}` };
  }

  const stateOrder: Record<ConversationState, number> = {
    'idle': 0,
    'collecting_service': 1,
    'collecting_data': 2,
    'awaiting_slot_selection': 3,
    'awaiting_confirmation': 4,
    'booking_processing': 5,
    'booking_active': 6,
    'rescheduling': 3,
  };

  const currentOrder = stateOrder[currentState] ?? 0;
  const derivedOrder = stateOrder[derivedState] ?? 0;

  // Allow forward jumps
  if (derivedOrder > currentOrder) {
    return { reconciledState: derivedState, changed: true, reason: `${currentState} → ${derivedState}: ${decision.reason}` };
  }

  // Allow backward corrections when the orchestrator detects missing data
  // e.g., awaiting_confirmation but customer data missing → collecting_data
  if (derivedOrder < currentOrder && (
    decision.action === 'collect_data' ||
    decision.action === 'collect_service' ||
    decision.action === 'check_availability'
  )) {
    return { reconciledState: derivedState, changed: true, reason: `backward correction: ${currentState} → ${derivedState}: ${decision.reason}` };
  }

  return { reconciledState: currentState, changed: false, reason: decision.reason };
}
