/**
 * Agent Action Layer - Phase 1 (Core)
 * 
 * This module defines the official action catalog that AI agents can execute.
 * All actions are:
 * - Explicit and documented
 * - Auditable with full logging
 * - Cost-aware with credit tracking
 * - Service-dependent (gated by empresa service flags)
 */

// =============================================
// Action Type Definitions
// =============================================

export type AgentActionType = 
  | 'answer_information'
  | 'collect_lead'
  | 'send_link'
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'send_email'
  | 'handoff_to_human'
  // Scheduling Decision Engine actions
  | 'create_appointment_real'      // Real appointment created in system
  | 'create_appointment_request';  // Request collected for manual follow-up

export type ServiceFlag = 
  | 'service_chat_enabled'
  | 'service_voice_enabled'
  | 'service_scheduling_enabled'
  | 'service_email_enabled';

export type ActionOutcome = 'success' | 'blocked' | 'failed';
export type ActorType = 'ai' | 'human';

// =============================================
// Action Catalog Definition
// =============================================

export interface ActionDefinition {
  type: AgentActionType;
  name: string;
  description: string;
  requiredServices: ServiceFlag[];
  creditCost: number;
  requiresConfirmation: boolean;
  hasSideEffects: boolean;
}

export const ACTION_CATALOG: Record<AgentActionType, ActionDefinition> = {
  answer_information: {
    type: 'answer_information',
    name: 'Responder com Informação',
    description: 'Responde com informação da base de conhecimento ou fontes configuradas',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0, // No extra cost beyond standard chat
    requiresConfirmation: false,
    hasSideEffects: false,
  },
  collect_lead: {
    type: 'collect_lead',
    name: 'Recolher Lead',
    description: 'Recolhe nome, email, telefone e notas do visitante',
    requiredServices: ['service_chat_enabled'],
    creditCost: 1,
    requiresConfirmation: false,
    hasSideEffects: true,
  },
  send_link: {
    type: 'send_link',
    name: 'Enviar Link',
    description: 'Envia uma URL predefinida ou dinâmica ao utilizador',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0,
    requiresConfirmation: false,
    hasSideEffects: false,
  },
  create_appointment: {
    type: 'create_appointment',
    name: 'Criar Agendamento',
    description: 'Cria um novo agendamento com data, hora, nome e contacto',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 2,
    requiresConfirmation: true,
    hasSideEffects: true,
  },
  reschedule_appointment: {
    type: 'reschedule_appointment',
    name: 'Reagendar',
    description: 'Modifica um agendamento existente',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 1,
    requiresConfirmation: true,
    hasSideEffects: true,
  },
  cancel_appointment: {
    type: 'cancel_appointment',
    name: 'Cancelar Agendamento',
    description: 'Cancela um agendamento existente',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 1,
    requiresConfirmation: true,
    hasSideEffects: true,
  },
  send_email: {
    type: 'send_email',
    name: 'Enviar Email',
    description: 'Envia um email via sistema de email configurado',
    requiredServices: ['service_email_enabled'],
    creditCost: 2,
    requiresConfirmation: true,
    hasSideEffects: true,
  },
  handoff_to_human: {
    type: 'handoff_to_human',
    name: 'Transferir para Humano',
    description: 'Transfere a conversa para um operador humano',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0,
    requiresConfirmation: false,
    hasSideEffects: true,
  },
  // Scheduling Decision Engine actions
  create_appointment_real: {
    type: 'create_appointment_real',
    name: 'Agendamento Real',
    description: 'Cria agendamento real no sistema (requer sucesso técnico para confirmar)',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 2,
    requiresConfirmation: true,
    hasSideEffects: true,
  },
  create_appointment_request: {
    type: 'create_appointment_request',
    name: 'Pedido de Agendamento',
    description: 'Regista pedido de agendamento para follow-up manual',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 1,
    requiresConfirmation: false,
    hasSideEffects: true,
  },
};

// =============================================
// Action Request & Response Types
// =============================================

export interface ActionContext {
  empresaId: string;
  agentId?: string;
  conversationId?: string;
  actorType: ActorType;
  referenceId?: string;
}

// Specific action data types
export interface CollectLeadData {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface SendLinkData {
  url: string;
  title?: string;
  description?: string;
}

export interface CreateAppointmentData {
  date: string;
  time: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  notes?: string;
}

export interface RescheduleAppointmentData {
  appointmentId: string;
  newDate?: string;
  newTime?: string;
  notes?: string;
}

export interface CancelAppointmentData {
  appointmentId: string;
  reason?: string;
}

export interface SendEmailData {
  recipientEmail: string;
  templateId?: string;
  subject?: string;
  body?: string;
}

export interface HandoffToHumanData {
  reason?: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export interface AnswerInformationData {
  query?: string;
  sources?: string[];
}

// Scheduling Decision Engine specific data
export interface CreateAppointmentRealData extends CreateAppointmentData {
  // Additional fields for real scheduling
  provider?: 'internal' | 'google' | 'outlook' | 'calendly';
}

export interface CreateAppointmentRequestData {
  preferred_date?: string;
  preferred_time?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  notes?: string;
}

export type ActionData = 
  | { type: 'answer_information'; data: AnswerInformationData }
  | { type: 'collect_lead'; data: CollectLeadData }
  | { type: 'send_link'; data: SendLinkData }
  | { type: 'create_appointment'; data: CreateAppointmentData }
  | { type: 'reschedule_appointment'; data: RescheduleAppointmentData }
  | { type: 'cancel_appointment'; data: CancelAppointmentData }
  | { type: 'send_email'; data: SendEmailData }
  | { type: 'handoff_to_human'; data: HandoffToHumanData }
  | { type: 'create_appointment_real'; data: CreateAppointmentRealData }
  | { type: 'create_appointment_request'; data: CreateAppointmentRequestData };

export interface ActionRequest {
  context: ActionContext;
  action: ActionData;
}

export interface ActionResult {
  success: boolean;
  outcome: ActionOutcome;
  message: string;
  data?: Record<string, unknown>;
  creditsConsumed: number;
}

// =============================================
// Service Permission Check Types
// =============================================

export interface ServicePermissions {
  service_chat_enabled: boolean;
  service_voice_enabled: boolean;
  service_scheduling_enabled: boolean;
  service_email_enabled: boolean;
}

export interface ActionPermissionCheck {
  allowed: boolean;
  blockedReason?: string;
  missingServices: ServiceFlag[];
}
