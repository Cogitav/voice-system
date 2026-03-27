import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CalendarResource {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  empresa_id: string;
  default_appointment_duration_minutes: number;
  color: string | null;
}

export interface CalendarEvent {
  id: string;
  empresa_id: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  data: string;
  hora: string;
  duration_minutes: number | null;
  start_datetime: string | null;
  end_datetime: string | null;
  estado: string;
  scheduling_state: string;
  notas: string | null;
  resource_id: string | null;
  service_id: string | null;
  service_name?: string | null;
  resource_ids: string[]; // from appointment_resources
}

export function useCalendarResources(empresaId: string | null) {
  return useQuery({
    queryKey: ['calendar-resources', empresaId],
    queryFn: async () => {
      if (!empresaId) {
        console.error('[Calendar] Blocked: Missing empresa_id for resources query');
        return [];
      }
      console.log('[Calendar] Fetch resources → empresa:', empresaId);

      const { data, error } = await supabase
        .from('scheduling_resources')
        .select('id, name, type, status, priority, empresa_id, default_appointment_duration_minutes, color')
        .eq('empresa_id', empresaId)
        .eq('status', 'active')
        .order('priority', { ascending: true });

      if (error) throw new Error(error.message);
      return data as CalendarResource[];
    },
    enabled: !!empresaId,
  });
}

export function useCalendarEvents(empresaId: string | null, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['calendar-events', empresaId, dateFrom, dateTo],
    queryFn: async () => {
      if (!empresaId) {
        console.error('[Calendar] Blocked: Missing empresa_id for events query');
        return [];
      }
      console.log('[Calendar] Fetch start → empresa:', empresaId);
      console.log('[Calendar] Date range:', dateFrom, '-', dateTo);

      // Fetch agendamentos in range
      const { data: agendamentos, error } = await supabase
        .from('agendamentos')
        .select(`
          id, empresa_id, cliente_nome, cliente_telefone,
          data, hora, duration_minutes, start_datetime, end_datetime,
          estado, scheduling_state, notas, resource_id, service_id,
          scheduling_services(name)
        `)
        .eq('empresa_id', empresaId)
        .gte('data', dateFrom)
        .lte('data', dateTo)
        .in('scheduling_state', ['requested', 'confirmed'])
        .order('data', { ascending: true })
        .order('hora', { ascending: true });

      if (error) throw new Error(error.message);

      // Fetch appointment_resources for these agendamentos
      const ids = (agendamentos || []).map((a: any) => a.id);
      let resourceMap: Record<string, string[]> = {};

      if (ids.length > 0) {
        const { data: ar } = await supabase
          .from('appointment_resources')
          .select('appointment_id, resource_id')
          .in('appointment_id', ids);

        if (ar) {
          for (const row of ar) {
            if (!resourceMap[row.appointment_id]) resourceMap[row.appointment_id] = [];
            resourceMap[row.appointment_id].push(row.resource_id);
          }
        }
      }

      const result = (agendamentos || []).map((a: any) => ({
        id: a.id,
        empresa_id: a.empresa_id,
        cliente_nome: a.cliente_nome,
        cliente_telefone: a.cliente_telefone,
        data: a.data,
        hora: a.hora,
        duration_minutes: a.duration_minutes,
        start_datetime: a.start_datetime,
        end_datetime: a.end_datetime,
        estado: a.estado,
        scheduling_state: a.scheduling_state,
        notas: a.notas,
        resource_id: a.resource_id,
        service_id: a.service_id,
        service_name: a.scheduling_services?.name || null,
        resource_ids: resourceMap[a.id] || (a.resource_id ? [a.resource_id] : []),
      })) as CalendarEvent[];

      console.log('[Calendar] Loaded appointments:', result.length);
      return result;
    },
    enabled: !!empresaId && !!dateFrom && !!dateTo,
  });
}

export function useCalendarServices(empresaId: string | null) {
  return useQuery({
    queryKey: ['calendar-services', empresaId],
    queryFn: async () => {
      if (!empresaId) {
        console.error('[Calendar] Blocked: Missing empresa_id for services query');
        return [];
      }

      const { data, error } = await supabase
        .from('scheduling_services')
        .select('id, name, duration_minutes, empresa_id')
        .eq('empresa_id', empresaId)
        .eq('status', 'active')
        .order('name');

      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!empresaId,
  });
}
