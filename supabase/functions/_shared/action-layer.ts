import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Agent Action Layer - Edge Function Utilities
 * 
 * Shared logic for executing and logging agent actions.
 * Used by chat-ai-response, public-chat, and other edge functions.
 */

// =============================================
// Types (mirrored from frontend for edge function use)
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

export interface ServicePermissions {
  service_chat_enabled: boolean;
  service_voice_enabled: boolean;
  service_scheduling_enabled: boolean;
  service_email_enabled: boolean;
}

export interface ActionContext {
  empresaId: string;
  agentId?: string;
  conversationId?: string;
  actorType: ActorType;
  referenceId?: string;
}

export interface ActionLogEntry {
  empresa_id: string;
  agent_id?: string;
  conversation_id?: string;
  action_type: AgentActionType;
  action_data: Record<string, unknown>;
  actor_type: ActorType;
  reference_id?: string;
  outcome: ActionOutcome;
  outcome_message?: string;
  credits_consumed: number;
}

// =============================================
// Action Catalog (Phase 1)
// =============================================

interface ActionDefinition {
  type: AgentActionType;
  requiredServices: ServiceFlag[];
  creditCost: number;
}

const ACTION_CATALOG: Record<AgentActionType, ActionDefinition> = {
  answer_information: {
    type: 'answer_information',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0,
  },
  collect_lead: {
    type: 'collect_lead',
    requiredServices: ['service_chat_enabled'],
    creditCost: 1,
  },
  send_link: {
    type: 'send_link',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0,
  },
  create_appointment: {
    type: 'create_appointment',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 2,
  },
  reschedule_appointment: {
    type: 'reschedule_appointment',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 1,
  },
  cancel_appointment: {
    type: 'cancel_appointment',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 0,
  },
  send_email: {
    type: 'send_email',
    requiredServices: ['service_email_enabled'],
    creditCost: 2,
  },
  handoff_to_human: {
    type: 'handoff_to_human',
    requiredServices: ['service_chat_enabled'],
    creditCost: 0,
  },
  // Scheduling Decision Engine actions
  create_appointment_real: {
    type: 'create_appointment_real',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 2,
  },
  create_appointment_request: {
    type: 'create_appointment_request',
    requiredServices: ['service_scheduling_enabled'],
    creditCost: 1,
  },
};

const SERVICE_NAMES: Record<ServiceFlag, string> = {
  service_chat_enabled: 'Chat',
  service_voice_enabled: 'Voz',
  service_scheduling_enabled: 'Agendamentos',
  service_email_enabled: 'Email',
};

// =============================================
// Permission Check
// =============================================

export function checkActionPermission(
  actionType: AgentActionType,
  permissions: ServicePermissions
): { allowed: boolean; blockedReason?: string } {
  const actionDef = ACTION_CATALOG[actionType];
  
  if (!actionDef) {
    return {
      allowed: false,
      blockedReason: 'Ação desconhecida ou não suportada.',
    };
  }

  const missingServices: ServiceFlag[] = [];
  
  for (const requiredService of actionDef.requiredServices) {
    if (!permissions[requiredService]) {
      missingServices.push(requiredService);
    }
  }

  if (missingServices.length > 0) {
    const serviceNames = missingServices
      .map(s => SERVICE_NAMES[s])
      .join(', ');
    
    return {
      allowed: false,
      blockedReason: `De momento, o serviço de ${serviceNames} não está ativo para esta empresa.`,
    };
  }

  return { allowed: true };
}

// =============================================
// Service Permissions Loader
// =============================================

// deno-lint-ignore no-explicit-any
export async function loadServicePermissions(
  supabase: any,
  empresaId: string
): Promise<ServicePermissions | null> {
  const { data: empresa, error } = await supabase
    .from('empresas')
    .select('service_chat_enabled, service_voice_enabled, service_scheduling_enabled, service_email_enabled')
    .eq('id', empresaId)
    .single();

  if (error || !empresa) {
    console.error('[ActionLayer] Failed to load service permissions:', error);
    return null;
  }

  return {
    service_chat_enabled: empresa.service_chat_enabled ?? false,
    service_voice_enabled: empresa.service_voice_enabled ?? false,
    service_scheduling_enabled: empresa.service_scheduling_enabled ?? false,
    service_email_enabled: empresa.service_email_enabled ?? false,
  };
}

// =============================================
// Action Logging (Audit Trail)
// =============================================

// deno-lint-ignore no-explicit-any
export async function logActionExecution(
  supabase: any,
  entry: ActionLogEntry
): Promise<void> {
  try {
    const { error } = await supabase
      .from('agent_action_logs')
      .insert({
        empresa_id: entry.empresa_id,
        agent_id: entry.agent_id || null,
        conversation_id: entry.conversation_id || null,
        action_type: entry.action_type,
        action_data: entry.action_data,
        actor_type: entry.actor_type,
        reference_id: entry.reference_id || null,
        outcome: entry.outcome,
        outcome_message: entry.outcome_message || null,
        credits_consumed: entry.credits_consumed,
      });

    if (error) {
      // Log but don't block - audit is important but not critical path
      console.error('[ActionLayer] Failed to log action:', error);
    } else {
      console.log(`[ActionLayer] ✓ Logged: ${entry.action_type} (${entry.outcome})`);
    }
  } catch (err) {
    console.error('[ActionLayer] Exception logging action:', err);
  }
}

// =============================================
// Action Execution Wrapper
// =============================================

export interface ExecuteActionParams {
  context: ActionContext;
  actionType: AgentActionType;
  actionData: Record<string, unknown>;
  permissions: ServicePermissions;
  // deno-lint-ignore no-explicit-any
  executor: () => Promise<{ success: boolean; message: string; data?: any }>;
}

export interface ExecuteActionResult {
  success: boolean;
  outcome: ActionOutcome;
  message: string;
  // deno-lint-ignore no-explicit-any
  data?: any;
  creditsConsumed: number;
}

// deno-lint-ignore no-explicit-any
export async function executeAction(
  supabase: any,
  params: ExecuteActionParams
): Promise<ExecuteActionResult> {
  const { context, actionType, actionData, permissions, executor } = params;
  const actionDef = ACTION_CATALOG[actionType];

  // Check permission first
  const permCheck = checkActionPermission(actionType, permissions);
  
  if (!permCheck.allowed) {
    // Log blocked action
    await logActionExecution(supabase, {
      empresa_id: context.empresaId,
      agent_id: context.agentId,
      conversation_id: context.conversationId,
      action_type: actionType,
      action_data: actionData,
      actor_type: context.actorType,
      reference_id: context.referenceId,
      outcome: 'blocked',
      outcome_message: permCheck.blockedReason,
      credits_consumed: 0,
    });

    return {
      success: false,
      outcome: 'blocked',
      message: permCheck.blockedReason || 'Ação bloqueada.',
      creditsConsumed: 0,
    };
  }

  // Execute the action
  try {
    const result = await executor();

    if (result.success) {
      // Log successful action
      await logActionExecution(supabase, {
        empresa_id: context.empresaId,
        agent_id: context.agentId,
        conversation_id: context.conversationId,
        action_type: actionType,
        action_data: actionData,
        actor_type: context.actorType,
        reference_id: context.referenceId,
        outcome: 'success',
        outcome_message: result.message,
        credits_consumed: actionDef.creditCost,
      });

      return {
        success: true,
        outcome: 'success',
        message: result.message,
        data: result.data,
        creditsConsumed: actionDef.creditCost,
      };
    } else {
      // Log failed action
      await logActionExecution(supabase, {
        empresa_id: context.empresaId,
        agent_id: context.agentId,
        conversation_id: context.conversationId,
        action_type: actionType,
        action_data: actionData,
        actor_type: context.actorType,
        reference_id: context.referenceId,
        outcome: 'failed',
        outcome_message: result.message,
        credits_consumed: 0, // No credits on failure
      });

      return {
        success: false,
        outcome: 'failed',
        message: result.message,
        creditsConsumed: 0,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    // Log failed action
    await logActionExecution(supabase, {
      empresa_id: context.empresaId,
      agent_id: context.agentId,
      conversation_id: context.conversationId,
      action_type: actionType,
      action_data: actionData,
      actor_type: context.actorType,
      reference_id: context.referenceId,
      outcome: 'failed',
      outcome_message: errorMessage,
      credits_consumed: 0,
    });

    return {
      success: false,
      outcome: 'failed',
      message: 'Ocorreu um erro ao executar esta ação. Por favor, tente novamente.',
      creditsConsumed: 0,
    };
  }
}

// =============================================
// Lead Collection Action
// =============================================

export interface CollectLeadParams {
  empresaId: string;
  conversationId?: string;
  agentId?: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

// deno-lint-ignore no-explicit-any
export async function collectLead(
  supabase: any,
  params: CollectLeadParams
): Promise<{ success: boolean; message: string; leadId?: string }> {
  const { empresaId, conversationId, agentId, name, email, phone, notes } = params;

  if (!name && !email && !phone) {
    return {
      success: false,
      message: 'Por favor, forneça pelo menos um dado de contacto (nome, email ou telefone).',
    };
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      empresa_id: empresaId,
      conversation_id: conversationId || null,
      agent_id: agentId || null,
      name: name || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      source: 'chat',
      status: 'new',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ActionLayer] Failed to collect lead:', error);
    return {
      success: false,
      message: 'Não foi possível guardar os dados de contacto.',
    };
  }

  return {
    success: true,
    message: 'Dados de contacto registados com sucesso.',
    leadId: data.id,
  };
}

// =============================================
// Handoff to Human Action
// =============================================

// deno-lint-ignore no-explicit-any
export async function handoffToHuman(
  supabase: any,
  conversationId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase
    .from('conversations')
    .update({
      status: 'waiting_human',
      owner: 'human',
    })
    .eq('id', conversationId);

  if (error) {
    console.error('[ActionLayer] Failed to handoff:', error);
    return {
      success: false,
      message: 'Não foi possível transferir para um operador.',
    };
  }

  // Insert system message about handoff
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    content: reason 
      ? `Conversa transferida para operador humano. Motivo: ${reason}`
      : 'Conversa transferida para operador humano.',
    is_internal: false,
  });

  return {
    success: true,
    message: 'A conversa foi transferida para um operador humano. Por favor, aguarde.',
  };
}
