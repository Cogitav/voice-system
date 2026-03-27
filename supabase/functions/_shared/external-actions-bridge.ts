/**
 * External Actions Bridge v1.0
 * 
 * Generic gateway for platform ↔ external executor communication.
 * 
 * CORE PRINCIPLE:
 * - The platform DECIDES what action to perform
 * - The external executor ONLY EXECUTES the action
 * - The external executor NEVER decides behavior
 * - The agent only communicates CONFIRMED results
 * 
 * This bridge is designed to be:
 * - Generic: works for any action_type and provider
 * - Future-proof: new providers can be added without changing the contract
 * - Secure: all requests are scoped by company_id
 * - Observable: all actions are logged with full context
 */

// =============================================
// Types & Contracts (v1.0)
// =============================================

export const EXTERNAL_ACTIONS_VERSION = '1.0';

export type ExternalActionType = 
  | 'create_calendar_event'
  | 'update_calendar_event'
  | 'delete_calendar_event'
  | 'send_email'
  | 'create_crm_record'
  | 'update_crm_record';

export type ExternalProvider =
  | 'google_calendar'
  | 'outlook_calendar'
  | 'calendly'
  | 'gmail'
  | 'outlook_mail'
  | 'hubspot'
  | 'salesforce';

/**
 * Request payload sent from platform to external executor
 */
export interface ExternalActionRequest {
  version: string;
  action_id: string;
  action_type: ExternalActionType;
  provider: ExternalProvider;
  company_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  payload: Record<string, unknown>;
}

/**
 * Response payload from external executor to platform
 */
export interface ExternalActionResponse {
  action_id: string;
  success: boolean;
  provider: string;
  external_reference_id: string | null;
  error_code: ExternalActionErrorCode | null;
  error_message: string | null;
  executed_at: string;
}

export type ExternalActionErrorCode =
  | 'AUTH_ERROR'           // OAuth token expired or invalid
  | 'PERMISSION_DENIED'    // No permission to access resource
  | 'CALENDAR_CONFLICT'    // Time slot not available
  | 'RESOURCE_NOT_FOUND'   // Calendar/Event not found
  | 'VALIDATION_ERROR'     // Invalid payload data
  | 'RATE_LIMITED'         // Too many requests
  | 'PROVIDER_ERROR'       // Provider returned an error
  | 'TIMEOUT'              // Request timed out
  | 'NETWORK_ERROR'        // Network connectivity issues
  | 'UNKNOWN_ERROR';       // Catch-all

// =============================================
// Specific Payload Types
// =============================================

/**
 * Payload for create_calendar_event action
 */
export interface CreateCalendarEventPayload {
  title: string;
  description?: string;
  start_datetime: string;  // ISO8601
  end_datetime: string;    // ISO8601
  timezone: string;
  attendee_email: string;
  attendee_name?: string;
  location?: string;
  send_notifications?: boolean;
}

/**
 * Payload for update_calendar_event action
 */
export interface UpdateCalendarEventPayload {
  event_id: string;
  title?: string;
  description?: string;
  start_datetime?: string;
  end_datetime?: string;
  timezone?: string;
  location?: string;
}

/**
 * Payload for delete_calendar_event action
 */
export interface DeleteCalendarEventPayload {
  event_id: string;
  send_notifications?: boolean;
}

// =============================================
// Action Log Entry
// =============================================

export interface ExternalActionLogEntry {
  action_id: string;
  action_type: ExternalActionType;
  provider: ExternalProvider;
  company_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  request_payload: Record<string, unknown>;
  response_success: boolean;
  response_external_id: string | null;
  response_error_code: string | null;
  response_error_message: string | null;
  request_timestamp: string;
  response_timestamp: string;
  duration_ms: number;
}

// =============================================
// Configuration
// =============================================

interface ExternalActionsConfig {
  webhookUrl: string | null;
  timeoutMs: number;
  retryCount: number;
}

function getConfig(): ExternalActionsConfig {
  return {
    webhookUrl: Deno.env.get('EXTERNAL_EXECUTOR_WEBHOOK_URL') || null,
    timeoutMs: parseInt(Deno.env.get('EXTERNAL_ACTIONS_TIMEOUT_MS') || '30000'),
    retryCount: parseInt(Deno.env.get('EXTERNAL_ACTIONS_RETRY_COUNT') || '0'),
  };
}

// =============================================
// Bridge Execution
// =============================================

/**
 * Execute an external action via the bridge
 * 
 * This is the ONLY gateway for all external actions.
 * Returns a standardized response regardless of provider.
 */
export async function executeExternalAction(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  request: Omit<ExternalActionRequest, 'version' | 'action_id'>
): Promise<ExternalActionResponse> {
  const config = getConfig();
  const actionId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString();

  const fullRequest: ExternalActionRequest = {
    version: EXTERNAL_ACTIONS_VERSION,
    action_id: actionId,
    ...request,
  };

  console.log(`[ExternalActions] Executing ${request.action_type} via ${request.provider}:`, {
    action_id: actionId,
    company_id: request.company_id,
  });

  // Check if webhook is configured
  if (!config.webhookUrl) {
    console.warn('[ExternalActions] No webhook URL configured, using dummy executor');
    
    // DUMMY EXECUTOR: For development/testing
    const dummyResponse = await executeDummyAction(fullRequest);
    
    await logExternalAction(supabase, {
      action_id: actionId,
      action_type: request.action_type,
      provider: request.provider,
      company_id: request.company_id,
      conversation_id: request.conversation_id,
      agent_id: request.agent_id,
      request_payload: request.payload,
      response_success: dummyResponse.success,
      response_external_id: dummyResponse.external_reference_id,
      response_error_code: dummyResponse.error_code,
      response_error_message: dummyResponse.error_message,
      request_timestamp: requestTimestamp,
      response_timestamp: dummyResponse.executed_at,
      duration_ms: 0,
    });

    return dummyResponse;
  }

  // Execute via webhook
  try {
    const startTime = Date.now();
    
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-External-Actions-Version': EXTERNAL_ACTIONS_VERSION,
      },
      body: JSON.stringify(fullRequest),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    const duration = Date.now() - startTime;
    const responseTimestamp = new Date().toISOString();

    if (!response.ok) {
      console.error(`[ExternalActions] Webhook returned ${response.status}`);
      
      const errorResponse: ExternalActionResponse = {
        action_id: actionId,
        success: false,
        provider: request.provider,
        external_reference_id: null,
        error_code: 'PROVIDER_ERROR',
        error_message: `Webhook returned HTTP ${response.status}`,
        executed_at: responseTimestamp,
      };

      await logExternalAction(supabase, {
        action_id: actionId,
        action_type: request.action_type,
        provider: request.provider,
        company_id: request.company_id,
        conversation_id: request.conversation_id,
        agent_id: request.agent_id,
        request_payload: request.payload,
        response_success: false,
        response_external_id: null,
        response_error_code: 'PROVIDER_ERROR',
        response_error_message: `HTTP ${response.status}`,
        request_timestamp: requestTimestamp,
        response_timestamp: responseTimestamp,
        duration_ms: duration,
      });

      return errorResponse;
    }

    const result: ExternalActionResponse = await response.json();

    // Validate response
    if (result.action_id !== actionId) {
      console.warn('[ExternalActions] Response action_id mismatch, using request id');
      result.action_id = actionId;
    }

    await logExternalAction(supabase, {
      action_id: actionId,
      action_type: request.action_type,
      provider: request.provider,
      company_id: request.company_id,
      conversation_id: request.conversation_id,
      agent_id: request.agent_id,
      request_payload: request.payload,
      response_success: result.success,
      response_external_id: result.external_reference_id,
      response_error_code: result.error_code,
      response_error_message: result.error_message,
      request_timestamp: requestTimestamp,
      response_timestamp: result.executed_at || responseTimestamp,
      duration_ms: duration,
    });

    console.log(`[ExternalActions] ✓ Completed: ${result.success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);

    return result;

  } catch (err) {
    const responseTimestamp = new Date().toISOString();
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    let errorCode: ExternalActionErrorCode = 'UNKNOWN_ERROR';
    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      errorCode = 'TIMEOUT';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorCode = 'NETWORK_ERROR';
    }

    console.error(`[ExternalActions] Exception: ${errorMessage}`);

    const errorResponse: ExternalActionResponse = {
      action_id: actionId,
      success: false,
      provider: request.provider,
      external_reference_id: null,
      error_code: errorCode,
      error_message: errorMessage,
      executed_at: responseTimestamp,
    };

    await logExternalAction(supabase, {
      action_id: actionId,
      action_type: request.action_type,
      provider: request.provider,
      company_id: request.company_id,
      conversation_id: request.conversation_id,
      agent_id: request.agent_id,
      request_payload: request.payload,
      response_success: false,
      response_external_id: null,
      response_error_code: errorCode,
      response_error_message: errorMessage,
      request_timestamp: requestTimestamp,
      response_timestamp: responseTimestamp,
      duration_ms: 0,
    });

    return errorResponse;
  }
}

// =============================================
// Dummy Executor (Development/Testing)
// =============================================

/**
 * Dummy executor for development when no webhook is configured.
 * Always returns success with a mock external_reference_id.
 */
async function executeDummyAction(
  request: ExternalActionRequest
): Promise<ExternalActionResponse> {
  console.log('[ExternalActions] DUMMY EXECUTOR - Simulating action:', request.action_type);
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 100));

  // For testing purposes, you can modify this to return failures
  // based on certain conditions in the payload
  const shouldFail = (request.payload as Record<string, unknown>)?._force_fail === true;

  if (shouldFail) {
    return {
      action_id: request.action_id,
      success: false,
      provider: request.provider,
      external_reference_id: null,
      error_code: 'PROVIDER_ERROR',
      error_message: 'Forced failure for testing',
      executed_at: new Date().toISOString(),
    };
  }

  return {
    action_id: request.action_id,
    success: true,
    provider: request.provider,
    external_reference_id: `dummy_${request.provider}_${Date.now()}`,
    error_code: null,
    error_message: null,
    executed_at: new Date().toISOString(),
  };
}

// =============================================
// Logging
// =============================================

/**
 * Log external action to agent_action_logs
 */
async function logExternalAction(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  log: ExternalActionLogEntry
): Promise<void> {
  try {
    await supabase.from('agent_action_logs').insert({
      empresa_id: log.company_id,
      agent_id: log.agent_id || null,
      conversation_id: log.conversation_id || null,
      action_type: `external_${log.action_type}`,
      action_data: {
        provider: log.provider,
        action_id: log.action_id,
        request_payload: log.request_payload,
        response_external_id: log.response_external_id,
        response_error_code: log.response_error_code,
        duration_ms: log.duration_ms,
      },
      actor_type: 'ai',
      reference_id: log.action_id,
      outcome: log.response_success ? 'success' : 'failed',
      outcome_message: log.response_error_message || null,
      credits_consumed: 0, // Credits are consumed by the calling action, not here
    });

    console.log(`[ExternalActions] Logged: ${log.action_type} (${log.response_success ? 'success' : 'failed'})`);
  } catch (err) {
    console.error('[ExternalActions] Failed to log action:', err);
  }
}

// =============================================
// Helper: Create Calendar Event via Bridge
// =============================================

/**
 * Convenience function to create a calendar event via the bridge
 */
export async function createCalendarEventViaBridge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: {
    company_id: string;
    conversation_id?: string;
    agent_id?: string;
    provider: 'google_calendar' | 'outlook_calendar';
    event: CreateCalendarEventPayload;
  }
): Promise<ExternalActionResponse> {
  return executeExternalAction(supabase, {
    action_type: 'create_calendar_event',
    provider: params.provider,
    company_id: params.company_id,
    conversation_id: params.conversation_id || null,
    agent_id: params.agent_id || null,
    payload: params.event,
  });
}

// =============================================
// Check Bridge Availability
// =============================================

/**
 * Check if the external actions bridge is properly configured
 */
export function isBridgeConfigured(): boolean {
  const config = getConfig();
  return config.webhookUrl !== null && config.webhookUrl.length > 0;
}

/**
 * Get bridge configuration info for debugging
 */
export function getBridgeInfo(): {
  configured: boolean;
  webhookUrl: string | null;
  timeoutMs: number;
  version: string;
} {
  const config = getConfig();
  return {
    configured: config.webhookUrl !== null,
    webhookUrl: config.webhookUrl ? '***configured***' : null,
    timeoutMs: config.timeoutMs,
    version: EXTERNAL_ACTIONS_VERSION,
  };
}
