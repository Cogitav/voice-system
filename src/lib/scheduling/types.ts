/**
 * Scheduling Decision Engine - Types
 * 
 * PRODUCTION-GRADE: Defines scheduling capability states and rules for AI agents.
 * Agents NEVER confirm appointments without explicit backend success confirmation.
 */

// =============================================
// Scheduling States (PRODUCTION-GRADE)
// =============================================

export type SchedulingState = 
  | 'REAL_TIME_SCHEDULING_ACTIVE'  // Can create real appointments (requires backend confirmation)
  | 'REQUEST_ONLY'                  // Can collect request, but never confirm
  | 'SCHEDULING_DISABLED';          // Cannot schedule at all

// Legacy aliases for backwards compatibility
export type LegacySchedulingState = 
  | 'CAN_SCHEDULE_REAL'         // Maps to REAL_TIME_SCHEDULING_ACTIVE
  | 'CAN_COLLECT_REQUEST_ONLY'  // Maps to REQUEST_ONLY
  | 'SCHEDULING_DISABLED';      // Same

// =============================================
// Scheduling Provider (Future-Proofing)
// =============================================

export type SchedulingProviderType = 
  | 'internal'    // Built-in scheduling (agendamentos table)
  | 'google'      // Google Calendar (future)
  | 'outlook'     // Outlook Calendar (future)
  | 'calendly'    // Calendly (future)
  | 'sheets';     // Google Sheets (future)

export interface SchedulingProvider {
  provider: SchedulingProviderType;
  status: 'active' | 'inactive' | 'not_configured';
  can_create_events: boolean;
}

// =============================================
// Scheduling Context for AI Prompts
// =============================================

export interface SchedulingContext {
  state: SchedulingState;
  providers: SchedulingProvider[];
  rules: SchedulingRules;
}

export interface SchedulingRules {
  canAskForDetails: boolean;
  canConfirmAppointment: boolean;
  canCollectPreferences: boolean;
  mustUseCautionLanguage: boolean;
  mustWaitForBackendConfirmation: boolean;
  requiresEmail: boolean;  // MANDATORY - always true
  allowedPhrases: string[];
  forbiddenPhrases: string[];
}

// =============================================
// Required Data Configuration
// =============================================

export interface RequiredSchedulingData {
  name: boolean;
  email: boolean;  // MANDATORY - always true
  phone: boolean;  // Recommended but not blocking
  date_time: boolean;
}

export const SCHEDULING_DATA_REQUIREMENTS: RequiredSchedulingData = {
  name: true,
  email: true,    // MANDATORY - NO EXCEPTIONS
  phone: false,   // Recommended
  date_time: true,
};

// =============================================
// Scheduling Action Types
// =============================================

export type SchedulingActionType = 
  | 'create_appointment_real'     // Real appointment created
  | 'create_appointment_request'; // Request collected only

export type SchedulingActionOutcome = 
  | 'success'   // Action succeeded (only case where confirmation is allowed)
  | 'blocked'   // Service disabled or no integration
  | 'failed';   // Technical error

export type SchedulingBlockReason =
  | 'service_disabled'       // service_scheduling_enabled = false
  | 'capability_not_enabled' // Specific capability flag is false
  | 'no_integration'         // No active scheduling provider
  | 'technical_error'        // System error during execution
  | 'validation_error'       // Missing required data
  | 'missing_required_data'  // Missing email or other mandatory fields
  | 'duplicate_execution'    // Idempotency: execution_id already processed
  | 'appointment_not_found'; // Referenced appointment does not exist

// =============================================
// Scheduling Request Data
// =============================================

export interface SchedulingRequestData {
  preferred_date?: string;
  preferred_time?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;  // MANDATORY
  notes?: string;
  // Metadata
  conversation_id?: string;
  agent_id?: string;
}

// =============================================
// Scheduling Action Result
// =============================================

export interface SchedulingActionResult {
  success: boolean;
  outcome: SchedulingActionOutcome;
  reason?: SchedulingBlockReason;
  message: string;
  appointment_id?: string;
  request_id?: string;
  credits_consumed: number;
}

// =============================================
// Validation Result
// =============================================

export interface SchedulingValidationResult {
  valid: boolean;
  missingFields: string[];
  message?: string;
}
