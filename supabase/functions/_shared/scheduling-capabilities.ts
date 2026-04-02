/**
 * Scheduling Capabilities - Backend Enforcement
 * 
 * Checks capability flags before allowing scheduling actions.
 * This is the single source of truth for what actions are permitted.
 */

export type SchedulingActionType = 
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'view_availability';

export interface SchedulingCapabilities {
  allow_create_appointment: boolean;
  allow_reschedule_appointment: boolean;
  allow_cancel_appointment: boolean;
  allow_view_availability: boolean;
}

const CAPABILITY_MAP: Record<SchedulingActionType, keyof SchedulingCapabilities> = {
  create_appointment: 'allow_create_appointment',
  reschedule_appointment: 'allow_reschedule_appointment',
  cancel_appointment: 'allow_cancel_appointment',
  view_availability: 'allow_view_availability',
};

export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
  action_type: SchedulingActionType;
}

/**
 * Check if a scheduling action is allowed for a company.
 * Returns allowed=false with reason if blocked.
 */
// deno-lint-ignore no-explicit-any
export async function checkSchedulingCapability(
  supabase: any,
  companyId: string,
  actionType: SchedulingActionType
): Promise<CapabilityCheckResult> {
  try {
    const { data, error } = await supabase
      .from('scheduling_capabilities')
      .select('*')
      .eq('empresa_id', companyId)
      .maybeSingle();

    if (error) {
      console.error('[SchedulingCapabilities] DB error:', error);
      // Fail closed - deny action on error
      return {
        allowed: false,
        reason: 'capability_check_error',
        action_type: actionType,
      };
    }

    if (!data) {
      // No capabilities row = use defaults (only create allowed)
      const defaultAllowed = actionType === 'create_appointment';
      return {
        allowed: defaultAllowed,
        reason: defaultAllowed ? undefined : 'capability_not_enabled',
        action_type: actionType,
      };
    }

    const flagKey = CAPABILITY_MAP[actionType];
    const allowed = data[flagKey] === true;

    return {
      allowed,
      reason: allowed ? undefined : 'capability_not_enabled',
      action_type: actionType,
    };
  } catch (err) {
    console.error('[SchedulingCapabilities] Exception:', err);
    return {
      allowed: false,
      reason: 'capability_check_error',
      action_type: actionType,
    };
  }
}

/**
 * Get all capabilities for a company (for AI prompt context)
 */
// deno-lint-ignore no-explicit-any
export async function getCompanyCapabilities(
  supabase: any,
  companyId: string
): Promise<SchedulingCapabilities> {
  try {
    const { data } = await supabase
      .from('scheduling_capabilities')
      .select('allow_create_appointment, allow_reschedule_appointment, allow_cancel_appointment, allow_view_availability')
      .eq('empresa_id', companyId)
      .maybeSingle();

    if (data) return data as SchedulingCapabilities;
  } catch (err) {
    console.error('[SchedulingCapabilities] Failed to fetch:', err);
  }

  // Defaults
  return {
    allow_create_appointment: true,
    allow_reschedule_appointment: false,
    allow_cancel_appointment: false,
    allow_view_availability: false,
  };
}
