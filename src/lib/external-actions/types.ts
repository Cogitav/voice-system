/**
 * External Actions Bridge - Frontend Types
 * 
 * These types mirror the backend contracts for type safety
 * when interacting with the external actions system.
 */

export const EXTERNAL_ACTIONS_VERSION = '1.0';

// =============================================
// Action Types & Providers
// =============================================

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

// =============================================
// Request & Response Contracts
// =============================================

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
  | 'AUTH_ERROR'
  | 'PERMISSION_DENIED'
  | 'CALENDAR_CONFLICT'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// =============================================
// Payload Types
// =============================================

export interface CreateCalendarEventPayload {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  attendee_email: string;
  attendee_name?: string;
  location?: string;
  send_notifications?: boolean;
}

export interface UpdateCalendarEventPayload {
  event_id: string;
  title?: string;
  description?: string;
  start_datetime?: string;
  end_datetime?: string;
  timezone?: string;
  location?: string;
}

export interface DeleteCalendarEventPayload {
  event_id: string;
  send_notifications?: boolean;
}

// =============================================
// Bridge Status
// =============================================

export interface ExternalActionsBridgeInfo {
  configured: boolean;
  webhookUrl: string | null;
  timeoutMs: number;
  version: string;
}

export interface ExternalActionsBridgeStatus {
  status: 'ok' | 'error';
  bridge: ExternalActionsBridgeInfo;
  timestamp: string;
}

// =============================================
// Error Descriptions (for UI)
// =============================================

export const ERROR_CODE_DESCRIPTIONS: Record<ExternalActionErrorCode, string> = {
  AUTH_ERROR: 'Erro de autenticação. A integração pode ter expirado.',
  PERMISSION_DENIED: 'Sem permissão para realizar esta ação.',
  CALENDAR_CONFLICT: 'Horário já ocupado no calendário.',
  RESOURCE_NOT_FOUND: 'Recurso não encontrado.',
  VALIDATION_ERROR: 'Dados inválidos.',
  RATE_LIMITED: 'Demasiadas requisições. Tente novamente mais tarde.',
  PROVIDER_ERROR: 'Erro do provedor externo.',
  TIMEOUT: 'Tempo limite excedido.',
  NETWORK_ERROR: 'Erro de rede.',
  UNKNOWN_ERROR: 'Erro desconhecido.',
};

// =============================================
// Provider Labels (for UI)
// =============================================

export const PROVIDER_LABELS: Record<ExternalProvider, string> = {
  google_calendar: 'Google Calendar',
  outlook_calendar: 'Outlook Calendar',
  calendly: 'Calendly',
  gmail: 'Gmail',
  outlook_mail: 'Outlook Mail',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
};

export const ACTION_TYPE_LABELS: Record<ExternalActionType, string> = {
  create_calendar_event: 'Criar Evento',
  update_calendar_event: 'Atualizar Evento',
  delete_calendar_event: 'Eliminar Evento',
  send_email: 'Enviar Email',
  create_crm_record: 'Criar Registo CRM',
  update_crm_record: 'Atualizar Registo CRM',
};
