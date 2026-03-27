/**
 * Scheduling Credit Rules v1.0
 * 
 * Centralized credit cost configuration for all scheduling actions.
 * Credits are consumed ONLY on successful execution.
 * 
 * RULES:
 * - Blocked actions = 0 credits
 * - Failed actions = 0 credits
 * - View-only actions = 0 credits
 * - Only success = true triggers credit consumption
 */

export type SchedulingActionType =
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'view_availability';

export const SCHEDULING_CREDIT_COSTS: Record<SchedulingActionType, number> = {
  create_appointment: 2,
  reschedule_appointment: 1,
  cancel_appointment: 1,
  view_availability: 0,
};

/**
 * Get credit cost for a scheduling action.
 * Returns 0 for unknown action types (fail safe).
 */
export function getSchedulingCreditCost(actionType: SchedulingActionType): number {
  return SCHEDULING_CREDIT_COSTS[actionType] ?? 0;
}

/**
 * Scheduling states for appointments
 */
export type SchedulingState = 'requested' | 'confirmed' | 'cancelled' | 'failed';

/**
 * External execution states
 */
export type ExternalExecutionState = 'not_attempted' | 'success' | 'failed';

/**
 * State transition rules:
 * - confirmed ONLY if external_execution_state = 'success'
 * - cancelled ONLY if cancel execution succeeds
 * - failed actions preserve previous valid state
 */
export function isValidStateTransition(
  current: SchedulingState,
  next: SchedulingState,
  externalState: ExternalExecutionState
): boolean {
  // Can only confirm if external succeeded
  if (next === 'confirmed' && externalState !== 'success') return false;

  // Cannot transition from cancelled
  if (current === 'cancelled') return false;

  // Cannot go from confirmed to requested
  if (current === 'confirmed' && next === 'requested') return false;

  return true;
}

/**
 * Generate a unique execution_id for idempotency
 */
export function generateExecutionId(
  actionType: SchedulingActionType,
  companyId: string
): string {
  return `sched_${actionType}_${companyId}_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
}
