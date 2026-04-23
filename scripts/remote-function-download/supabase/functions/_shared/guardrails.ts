import { ConversationContext } from './types.ts';

interface GuardrailResult {
  allowed: boolean;
  reason: string | null;
}

export function guardBookingExecution(context: ConversationContext): GuardrailResult {
  if (!context.service_id) {
    return { allowed: false, reason: 'MISSING_SERVICE: service_id is required before booking' };
  }
  if (!context.selected_slot) {
    return { allowed: false, reason: 'MISSING_SLOT: selected_slot is required before booking' };
  }
  if (!context.customer_name) {
    return { allowed: false, reason: 'MISSING_NAME: customer_name is required before booking' };
  }
  if (!context.customer_email) {
    return { allowed: false, reason: 'MISSING_EMAIL: customer_email is required before booking' };
  }
  if (context.state !== 'awaiting_confirmation' && context.state !== 'booking_processing') {
    return { allowed: false, reason: `INVALID_STATE: cannot execute booking from state ${context.state}` };
  }
  return { allowed: true, reason: null };
}

export function guardSlotSelection(context: ConversationContext, slotIndex: number): GuardrailResult {
  if (!context.available_slots || context.available_slots.length === 0) {
    return { allowed: false, reason: 'NO_SLOTS: no available slots to select from' };
  }
  if (slotIndex < 0 || slotIndex >= context.available_slots.length) {
    return { allowed: false, reason: `INVALID_INDEX: slot index ${slotIndex} out of range` };
  }
  return { allowed: true, reason: null };
}

export function guardReschedule(context: ConversationContext): GuardrailResult {
  if (!context.reschedule_from_agendamento_id) {
    return { allowed: false, reason: 'MISSING_APPOINTMENT_ID: cannot reschedule without appointment_id' };
  }
  if (!context.reschedule_new_slot) {
    return { allowed: false, reason: 'MISSING_NEW_SLOT: new slot required for reschedule' };
  }
  return { allowed: true, reason: null };
}

export function guardConfirmation(context: ConversationContext): GuardrailResult {
  if (context.state !== 'awaiting_confirmation') {
    return { allowed: false, reason: `WRONG_STATE: confirmation only valid in awaiting_confirmation, current: ${context.state}` };
  }
  if (!context.selected_slot && !context.available_slots?.length) {
    return { allowed: false, reason: 'NO_SLOT_SELECTED: must have a slot before confirmation' };
  }
  return { allowed: true, reason: null };
}

export function guardCreditCheck(allowed: boolean, reason: string | null): GuardrailResult {
  if (!allowed) {
    return { allowed: false, reason: reason ?? 'INSUFFICIENT_CREDITS' };
  }
  return { allowed: true, reason: null };
}
