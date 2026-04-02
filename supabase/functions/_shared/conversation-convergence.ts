/**
 * Conversation Convergence Engine (CCE) v2.0
 *
 * Deterministically detects when all required booking fields are present
 * and triggers booking automatically — regardless of message order or state.
 *
 * v2.0: Uses booking_active instead of completed. Blocks if appointment_id exists.
 */

// deno-lint-ignore no-explicit-any
export function shouldTriggerBooking(
  context: any,
  state: string,
): boolean {
  if (!context) return false;

  // Do not re-trigger if booking is already active
  if (state === 'booking_active') return false;

  // Prevent duplicate execution
  if (context.booking_id) return false;
  if (context.appointment_id) return false;
  if (context.booking_in_progress) return false;

  const hasRequiredFields =
    !!context.reason &&
    !!context.customer_name &&
    !!context.customer_email &&
    !!context.customer_phone &&
    !!context.preferred_date;

  if (!hasRequiredFields) return false;

  return true;
}
