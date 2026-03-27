import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SchedulingState = 
  | 'REAL_TIME_SCHEDULING_ACTIVE'
  | 'REQUEST_ONLY'
  | 'SCHEDULING_DISABLED';

export interface SchedulingStatusInfo {
  state: SchedulingState;
  has_calendar_integration: boolean;
  calendar_provider?: string;
  status_label: string;
  status_description: string;
  can_confirm_appointments: boolean;
}

/**
 * Check if a company has an active calendar integration
 */
async function checkCalendarIntegration(empresaId: string): Promise<{
  active: boolean;
  provider?: string;
}> {
  const { data: sources } = await supabase
    .from('external_data_sources')
    .select('id, source_type, source_name, is_active')
    .eq('empresa_id', empresaId)
    .in('source_type', ['google_calendar', 'outlook_calendar', 'calendly'])
    .eq('is_active', true);

  if (sources && sources.length > 0) {
    return { active: true, provider: sources[0].source_type };
  }

  return { active: false };
}

/**
 * Get scheduling status for a company
 */
async function getSchedulingStatus(empresaId: string): Promise<SchedulingStatusInfo> {
  // Check service flag
  const { data: empresa } = await supabase
    .from('empresas')
    .select('service_scheduling_enabled')
    .eq('id', empresaId)
    .single();

  if (!empresa || !empresa.service_scheduling_enabled) {
    return {
      state: 'SCHEDULING_DISABLED',
      has_calendar_integration: false,
      status_label: 'Desativado',
      status_description: 'O serviço de agendamentos não está ativo para esta empresa.',
      can_confirm_appointments: false,
    };
  }

  // Check calendar integration
  const calendarCheck = await checkCalendarIntegration(empresaId);

  if (calendarCheck.active) {
    return {
      state: 'REAL_TIME_SCHEDULING_ACTIVE',
      has_calendar_integration: true,
      calendar_provider: calendarCheck.provider,
      status_label: 'Tempo Real',
      status_description: `Calendário ${calendarCheck.provider} conectado. Os agendamentos são confirmados automaticamente.`,
      can_confirm_appointments: true,
    };
  }

  // Service enabled but no calendar = REQUEST_ONLY
  return {
    state: 'REQUEST_ONLY',
    has_calendar_integration: false,
    status_label: 'Apenas Pedidos',
    status_description: 'Sem calendário conectado. Os agendamentos não podem ser confirmados automaticamente.',
    can_confirm_appointments: false,
  };
}

/**
 * Hook to get scheduling status for a company
 */
export function useSchedulingStatus(empresaId?: string) {
  return useQuery({
    queryKey: ['scheduling-status', empresaId],
    queryFn: () => getSchedulingStatus(empresaId!),
    enabled: !!empresaId,
    staleTime: 30000, // 30 seconds
  });
}
