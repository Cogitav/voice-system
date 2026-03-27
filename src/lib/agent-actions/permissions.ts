/**
 * Action Permission Checker
 * 
 * Validates whether an action can be executed based on:
 * - Service flags enabled for the empresa
 * - Action catalog requirements
 */

import { 
  AgentActionType, 
  ACTION_CATALOG, 
  ServicePermissions, 
  ActionPermissionCheck,
  ServiceFlag 
} from './types';

// =============================================
// Service Name Mappings (for user-friendly messages)
// =============================================

const SERVICE_NAMES: Record<ServiceFlag, string> = {
  service_chat_enabled: 'Chat',
  service_voice_enabled: 'Voz',
  service_scheduling_enabled: 'Agendamentos',
  service_email_enabled: 'Email',
};

// =============================================
// Permission Check Functions
// =============================================

/**
 * Check if an action is allowed based on empresa service permissions
 */
export function checkActionPermission(
  actionType: AgentActionType,
  permissions: ServicePermissions
): ActionPermissionCheck {
  const actionDef = ACTION_CATALOG[actionType];
  
  if (!actionDef) {
    return {
      allowed: false,
      blockedReason: 'Ação desconhecida ou não suportada.',
      missingServices: [],
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
      blockedReason: `De momento, o serviço de ${serviceNames} não está ativo para esta empresa. Por favor, contacte o administrador.`,
      missingServices,
    };
  }

  return {
    allowed: true,
    missingServices: [],
  };
}

/**
 * Get all actions available for a given set of service permissions
 */
export function getAvailableActions(
  permissions: ServicePermissions
): AgentActionType[] {
  return Object.keys(ACTION_CATALOG).filter(actionType => {
    const check = checkActionPermission(actionType as AgentActionType, permissions);
    return check.allowed;
  }) as AgentActionType[];
}

/**
 * Get blocked actions with reasons
 */
export function getBlockedActions(
  permissions: ServicePermissions
): Array<{ action: AgentActionType; reason: string }> {
  const blocked: Array<{ action: AgentActionType; reason: string }> = [];
  
  for (const actionType of Object.keys(ACTION_CATALOG) as AgentActionType[]) {
    const check = checkActionPermission(actionType, permissions);
    if (!check.allowed && check.blockedReason) {
      blocked.push({
        action: actionType,
        reason: check.blockedReason,
      });
    }
  }
  
  return blocked;
}

/**
 * Convert empresa service flags to ServicePermissions object
 */
export function empresaToServicePermissions(empresa: {
  service_chat_enabled?: boolean;
  service_voice_enabled?: boolean;
  service_scheduling_enabled?: boolean;
  service_email_enabled?: boolean;
}): ServicePermissions {
  return {
    service_chat_enabled: empresa.service_chat_enabled ?? false,
    service_voice_enabled: empresa.service_voice_enabled ?? false,
    service_scheduling_enabled: empresa.service_scheduling_enabled ?? false,
    service_email_enabled: empresa.service_email_enabled ?? false,
  };
}

/**
 * Check if an action requires user confirmation before execution
 */
export function actionRequiresConfirmation(actionType: AgentActionType): boolean {
  return ACTION_CATALOG[actionType]?.requiresConfirmation ?? false;
}

/**
 * Check if an action has side effects (modifies data)
 */
export function actionHasSideEffects(actionType: AgentActionType): boolean {
  return ACTION_CATALOG[actionType]?.hasSideEffects ?? false;
}

/**
 * Get the credit cost for an action
 */
export function getActionCreditCost(actionType: AgentActionType): number {
  return ACTION_CATALOG[actionType]?.creditCost ?? 0;
}
