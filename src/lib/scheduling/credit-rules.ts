/**
 * Scheduling Credit Rules - Frontend Reference
 * 
 * Mirrors backend credit costs for display purposes.
 * Backend is the source of truth for actual credit consumption.
 */

export type SchedulingActionType =
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'view_availability';

export const SCHEDULING_CREDIT_COSTS: Record<SchedulingActionType, number> = {
  create_appointment: 2,
  reschedule_appointment: 1,
  cancel_appointment: 1,
  view_availability: 0,
};

export const SCHEDULING_ACTION_LABELS: Record<SchedulingActionType, string> = {
  create_appointment: 'Criar Agendamento',
  reschedule_appointment: 'Reagendar',
  cancel_appointment: 'Cancelar Agendamento',
  view_availability: 'Ver Disponibilidade',
};

export type SchedulingState = 'requested' | 'confirmed' | 'cancelled' | 'failed';

export const SCHEDULING_STATE_LABELS: Record<SchedulingState, string> = {
  requested: 'Pedido',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  failed: 'Falhado',
};

export type ExternalExecutionState = 'not_attempted' | 'success' | 'failed';

export const EXTERNAL_EXECUTION_STATE_LABELS: Record<ExternalExecutionState, string> = {
  not_attempted: 'Não Tentado',
  success: 'Sucesso',
  failed: 'Falhado',
};
