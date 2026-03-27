/**
 * Credit Rules & Constants
 * 
 * Central configuration for credit consumption.
 * These values are approximate abstractions, not real cost mapping.
 * Easy to modify without changing multiple files.
 */

export type CreditEventType = 
  | 'call_completed'
  | 'call_short'
  | 'agent_test'
  | 'message'
  | 'email'
  | 'knowledge'
  | 'other';

export const CREDIT_RULES: Record<CreditEventType, number> = {
  call_completed: 30,
  call_short: 5,
  agent_test: 1,
  message: 1,
  email: 0,
  knowledge: 0,
  other: 0,
};

export const CREDIT_EVENT_LABELS: Record<CreditEventType, string> = {
  call_completed: 'Chamada concluída',
  call_short: 'Chamada curta/falhada',
  agent_test: 'Teste de agente',
  message: 'Mensagem',
  email: 'Email de follow-up',
  knowledge: 'Processamento de conhecimento',
  other: 'Outro',
};

export const DEFAULT_CREDIT_LIMIT = 1000;

/**
 * Alert Thresholds Configuration
 * Defines when notifications are triggered
 */
export const ALERT_THRESHOLDS = {
  SOFT: 70,      // Soft alert - admin only
  WARNING: 85,   // Warning - admin + company
  OVERAGE: 100,  // Overage - admin + company
} as const;

export type AlertThresholdType = 'soft_70' | 'warning_85' | 'overage_100';

export const ALERT_THRESHOLD_LABELS: Record<AlertThresholdType, string> = {
  soft_70: 'Alerta Suave (70%)',
  warning_85: 'Aviso (85%)',
  overage_100: 'Excedido (100%)',
};

/**
 * Credit Package Configuration
 * Manual packages admin can add
 */
export type CreditPackageType = 'EXTRA_S' | 'EXTRA_M' | 'EXTRA_L';

export const CREDIT_PACKAGES: Record<CreditPackageType, { 
  credits: number; 
  label: string;
  description: string;
}> = {
  EXTRA_S: { 
    credits: 1000, 
    label: 'EXTRA S',
    description: 'Pack pequeno para ajustes pontuais',
  },
  EXTRA_M: { 
    credits: 3000, 
    label: 'EXTRA M',
    description: 'Pack médio para campanhas ou picos',
  },
  EXTRA_L: { 
    credits: 5000, 
    label: 'EXTRA L',
    description: 'Pack grande para máxima flexibilidade',
  },
};

/**
 * Get credits consumed for a specific event type
 */
export function getCreditsForEvent(eventType: CreditEventType): number {
  return CREDIT_RULES[eventType] ?? 0;
}

/**
 * Get the current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculate usage percentage (allows > 100% for overage)
 */
export function getUsagePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((used / limit) * 100);
}

/**
 * Calculate effective limit including extra credits from packages
 */
export function getEffectiveLimit(baseLimit: number, extraCredits: number): number {
  return baseLimit + extraCredits;
}

/**
 * Get usage status based on percentage
 * Statuses: normal (<70%), warning (70-84%), critical (85-99%), exceeded (>=100%)
 */
export function getUsageStatus(percentage: number): 'normal' | 'warning' | 'critical' | 'exceeded' {
  if (percentage >= 100) return 'exceeded';
  if (percentage >= ALERT_THRESHOLDS.WARNING) return 'critical';
  if (percentage >= ALERT_THRESHOLDS.SOFT) return 'warning';
  return 'normal';
}

/**
 * Get color class based on usage status
 */
export function getUsageColorClass(status: ReturnType<typeof getUsageStatus>): string {
  switch (status) {
    case 'exceeded':
      return 'bg-destructive';
    case 'critical':
      return 'bg-destructive';
    case 'warning':
      return 'bg-yellow-500';
    case 'normal':
    default:
      return 'bg-green-500';
  }
}

/**
 * Get text color class based on usage status
 */
export function getUsageTextColorClass(status: ReturnType<typeof getUsageStatus>): string {
  switch (status) {
    case 'exceeded':
      return 'text-destructive';
    case 'critical':
      return 'text-destructive';
    case 'warning':
      return 'text-yellow-600';
    case 'normal':
    default:
      return 'text-green-600';
  }
}

/**
 * Get friendly status label
 */
export function getUsageStatusLabel(status: ReturnType<typeof getUsageStatus>): string {
  switch (status) {
    case 'exceeded':
      return 'Excedido';
    case 'critical':
      return 'Crítico';
    case 'warning':
      return 'Atenção';
    case 'normal':
    default:
      return 'Normal';
  }
}

/**
 * Check which thresholds have been crossed
 */
export function getTriggeredAlerts(percentage: number): AlertThresholdType[] {
  const triggered: AlertThresholdType[] = [];
  if (percentage >= ALERT_THRESHOLDS.SOFT) triggered.push('soft_70');
  if (percentage >= ALERT_THRESHOLDS.WARNING) triggered.push('warning_85');
  if (percentage >= ALERT_THRESHOLDS.OVERAGE) triggered.push('overage_100');
  return triggered;
}
