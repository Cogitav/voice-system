import {
  ErrorState,
  SystemErrorType,
  RecoveryAction,
  CorrectionType,
  FieldAttemptTracker,
  ConversationContext,
} from './types.ts';
import { HANDOFF_RULES, ERROR_MESSAGES } from './constants.ts';
import { resetPartialContext } from './context-manager.ts';

// ─── 1. createEmptyErrorState ───────────────────────────────────────────────

export function createEmptyErrorState(): ErrorState {
  return {
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
  };
}

// ─── 2. handleValidationIssue ───────────────────────────────────────────────

// Per-field attempt messages. Keys match FieldAttemptTracker exactly.
// Attempt 1 = index 0, Attempt 2 = index 1. Attempt 3+ → accept and advance.
const FIELD_ATTEMPT_MESSAGES: Record<keyof FieldAttemptTracker, [string, string]> = {
  customer_email: [
    ERROR_MESSAGES.validation.email_attempt_1,
    ERROR_MESSAGES.validation.email_attempt_2,
  ],
  customer_phone: [
    ERROR_MESSAGES.validation.phone_attempt_1,
    ERROR_MESSAGES.validation.phone_attempt_2,
  ],
  customer_name: [
    'O nome que indicou não parece válido. Pode confirmar?',
    'Preciso de pelo menos um nome (pode ser só o primeiro nome).',
  ],
  preferred_date: [
    ERROR_MESSAGES.validation.date_ambiguous,
    ERROR_MESSAGES.validation.date_past,
  ],
};

export function handleValidationIssue(
  errorState: ErrorState,
  field: keyof FieldAttemptTracker
): { updatedErrorState: ErrorState; message: string; accept: boolean } {
  // Increment field attempt counter — NEVER touch consecutive_errors (§7.1)
  const newAttemptCount = (errorState.field_attempts[field] ?? 0) + 1;

  const updatedErrorState: ErrorState = {
    ...errorState,
    field_attempts: {
      ...errorState.field_attempts,
      [field]: newAttemptCount,
    },
    // consecutive_errors deliberately NOT modified
  };

  // Attempt 3+: accept and advance regardless
  if (newAttemptCount >= 3) {
    return {
      updatedErrorState,
      message: ERROR_MESSAGES.correction.acknowledged,
      accept: true,
    };
  }

  // Attempt 1 (index 0) or Attempt 2 (index 1)
  const message = FIELD_ATTEMPT_MESSAGES[field][newAttemptCount - 1];

  return { updatedErrorState, message, accept: false };
}

// ─── 3. handleUserCorrection ────────────────────────────────────────────────

export function handleUserCorrection(
  context: ConversationContext,
  correctionType: CorrectionType
): ConversationContext {
  // Partial context reset — preserves non-affected fields (§7.3)
  // consecutive_errors NEVER incremented for user corrections (§7.1)
  return resetPartialContext(context, correctionType);
}

// ─── 4. handleSystemError ───────────────────────────────────────────────────

// Recovery action mapping — covers all SystemErrorType values (§7.4)
function resolveRecoveryAction(
  errorType: SystemErrorType,
  recoverable: boolean
): RecoveryAction {
  switch (errorType) {
    case 'slot_conflict':
      return 'suggest_alternatives';

    case 'availability_api_failure':
      return 'ask_new_date';

    case 'booking_creation_failed':
      return 'suggest_alternatives';

    case 'llm_failure':
    case 'llm_invalid_response':
      return 'apologize_and_retry';

    case 'service_unavailable':
      return 'handoff';

    case 'database_error':
    case 'unknown':
      return recoverable ? 'retry_once' : 'handoff';

    default:
      return recoverable ? 'retry_once' : 'handoff';
  }
}

export function handleSystemError(
  errorState: ErrorState,
  errorType: SystemErrorType,
  recoverable: boolean
): { updatedErrorState: ErrorState; recoveryAction: RecoveryAction; shouldHandoff: boolean } {
  const newConsecutiveErrors = errorState.consecutive_errors + 1;

  const updatedErrorState: ErrorState = {
    ...errorState,
    consecutive_errors: newConsecutiveErrors,
    last_error_type: errorType,
    last_error_timestamp: new Date().toISOString(),
  };

  const recoveryAction = resolveRecoveryAction(errorType, recoverable);

  const shouldHandoff =
    newConsecutiveErrors >= HANDOFF_RULES.system_error_threshold ||
    recoveryAction === 'handoff';

  return { updatedErrorState, recoveryAction, shouldHandoff };
}

// ─── 5. resetErrorCount ─────────────────────────────────────────────────────

export function resetErrorCount(errorState: ErrorState): ErrorState {
  // Called on successful recovery — resets consecutive_errors only (§7.4)
  // Preserves field_attempts and frustration_consecutive
  return {
    ...errorState,
    consecutive_errors: 0,
    last_error_type: null,
    last_error_timestamp: null,
  };
}

// ─── 6. handleFrustration ───────────────────────────────────────────────────

export function handleFrustration(
  errorState: ErrorState
): { updatedErrorState: ErrorState; shouldHandoff: boolean } {
  const newFrustrationCount = errorState.frustration_consecutive + 1;

  const updatedErrorState: ErrorState = {
    ...errorState,
    frustration_consecutive: newFrustrationCount,
  };

  const shouldHandoff = newFrustrationCount >= HANDOFF_RULES.frustration_threshold;

  return { updatedErrorState, shouldHandoff };
}
