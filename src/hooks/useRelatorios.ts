import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, subDays, format, differenceInDays } from 'date-fns';
import { pt } from 'date-fns/locale';

export type DateRange = '7d' | '30d';

export interface RelatorioStats {
  totalChamadas: number;
  chamadasConcluidas: number;
  taxaSucesso: number;
  duracaoMedia: string;
  totalAgendamentos: number;
  taxaConversao: number;
}

export interface ChartDataPoint {
  name: string;
  chamadas: number;
  agendamentos: number;
}

export interface AgentStats {
  id: string;
  nome: string;
  chamadas: number;
  sucesso: number;
  taxaSucesso: number;
}

export interface IntentStats {
  name: string;
  value: number;
}

// Format duration in seconds to mm:ss
function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getDateRange(range: DateRange): Date {
  const days = range === '7d' ? 7 : 30;
  return subDays(startOfDay(new Date()), days - 1);
}

function getDateRangeFromDates(from: Date | undefined, to: Date | undefined): { startDate: Date; endDate: Date; days: number } {
  const endDate = to ? startOfDay(to) : startOfDay(new Date());
  const startDate = from ? startOfDay(from) : subDays(endDate, 6);
  const days = Math.max(1, differenceInDays(endDate, startDate) + 1);
  return { startDate, endDate, days };
}

// ============= ADMIN HOOKS =============

export function useAdminRelatorioStats(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-relatorio-stats', dateRange],
    queryFn: async (): Promise<RelatorioStats> => {
      const startDate = getDateRange(dateRange);

      // Get chamadas data
      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('duracao, status')
        .gte('data_hora_inicio', startDate.toISOString());

      const totalChamadas = chamadas?.length || 0;
      const chamadasConcluidas = chamadas?.filter(c => c.status === 'concluida').length || 0;
      const taxaSucesso = totalChamadas > 0 ? (chamadasConcluidas / totalChamadas) * 100 : 0;

      // Calculate average duration
      const totalDuracao = chamadas?.reduce((sum, c) => sum + (c.duracao || 0), 0) || 0;
      const countWithDuracao = chamadas?.filter(c => c.duracao).length || 0;
      const avgDuracao = countWithDuracao > 0 ? totalDuracao / countWithDuracao : 0;

      // Get agendamentos
      const { count: totalAgendamentos } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString());

      // Conversion rate (calls -> appointments)
      const taxaConversao = totalChamadas > 0 
        ? ((totalAgendamentos || 0) / totalChamadas) * 100 
        : 0;

      return {
        totalChamadas,
        chamadasConcluidas,
        taxaSucesso: Math.round(taxaSucesso * 10) / 10,
        duracaoMedia: formatDuration(avgDuracao),
        totalAgendamentos: totalAgendamentos || 0,
        taxaConversao: Math.round(taxaConversao * 10) / 10,
      };
    },
  });
}

export function useAdminCallsOverTime(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-calls-over-time', dateRange],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      const days = dateRange === '7d' ? 7 : 30;
      const startDate = getDateRange(dateRange);
      const today = startOfDay(new Date());

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('data_hora_inicio')
        .gte('data_hora_inicio', startDate.toISOString());

      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      // Group by day
      const dayMap = new Map<string, { chamadas: number; agendamentos: number }>();

      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { chamadas: 0, agendamentos: 0 });
      }

      // Count calls per day
      chamadas?.forEach((chamada) => {
        const date = new Date(chamada.data_hora_inicio);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.chamadas++;
        }
      });

      // Count agendamentos per day
      agendamentos?.forEach((agendamento) => {
        const date = new Date(agendamento.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.agendamentos++;
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        chamadas: data.chamadas,
        agendamentos: data.agendamentos,
      }));
    },
  });
}

export function useAdminCallsByAgent(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-calls-by-agent', dateRange],
    queryFn: async (): Promise<AgentStats[]> => {
      const startDate = getDateRange(dateRange);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select(`
          agente_id,
          status,
          agentes(id, nome)
        `)
        .gte('data_hora_inicio', startDate.toISOString())
        .not('agente_id', 'is', null);

      // Group by agent
      const agentMap = new Map<string, { nome: string; chamadas: number; sucesso: number }>();

      chamadas?.forEach((chamada) => {
        const agente = chamada.agentes as { id: string; nome: string } | null;
        if (agente) {
          const current = agentMap.get(agente.id) || { nome: agente.nome, chamadas: 0, sucesso: 0 };
          current.chamadas++;
          if (chamada.status === 'concluida') {
            current.sucesso++;
          }
          agentMap.set(agente.id, current);
        }
      });

      return Array.from(agentMap.entries())
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          chamadas: data.chamadas,
          sucesso: data.sucesso,
          taxaSucesso: data.chamadas > 0 ? Math.round((data.sucesso / data.chamadas) * 100) : 0,
        }))
        .sort((a, b) => b.chamadas - a.chamadas)
        .slice(0, 10);
    },
  });
}

export function useAdminCallsByIntent(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-calls-by-intent', dateRange],
    queryFn: async (): Promise<IntentStats[]> => {
      const startDate = getDateRange(dateRange);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('intencao_detetada')
        .gte('data_hora_inicio', startDate.toISOString())
        .not('intencao_detetada', 'is', null);

      // Group by intention
      const intentionMap = new Map<string, number>();

      chamadas?.forEach((chamada) => {
        if (chamada.intencao_detetada) {
          const current = intentionMap.get(chamada.intencao_detetada) || 0;
          intentionMap.set(chamada.intencao_detetada, current + 1);
        }
      });

      return Array.from(intentionMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

// ============= FILTERED ADMIN HOOKS (for custom date ranges and empresa filter) =============

export function useFilteredAdminRelatorioStats(
  fromDate: Date | undefined,
  toDate: Date | undefined,
  empresaId: string | null
) {
  return useQuery({
    queryKey: ['admin-relatorio-stats-filtered', fromDate?.toISOString(), toDate?.toISOString(), empresaId],
    queryFn: async (): Promise<RelatorioStats> => {
      const { startDate, endDate } = getDateRangeFromDates(fromDate, toDate);

      // Build query
      let query = supabase
        .from('chamadas')
        .select('duracao, status')
        .gte('data_hora_inicio', startDate.toISOString())
        .lte('data_hora_inicio', new Date(endDate.getTime() + 86400000).toISOString()); // end of day

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: chamadas } = await query;

      const totalChamadas = chamadas?.length || 0;
      const chamadasConcluidas = chamadas?.filter(c => c.status === 'concluida').length || 0;
      const taxaSucesso = totalChamadas > 0 ? (chamadasConcluidas / totalChamadas) * 100 : 0;

      const totalDuracao = chamadas?.reduce((sum, c) => sum + (c.duracao || 0), 0) || 0;
      const countWithDuracao = chamadas?.filter(c => c.duracao).length || 0;
      const avgDuracao = countWithDuracao > 0 ? totalDuracao / countWithDuracao : 0;

      // Build agendamentos query
      let agendamentosQuery = supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', new Date(endDate.getTime() + 86400000).toISOString());

      if (empresaId) {
        agendamentosQuery = agendamentosQuery.eq('empresa_id', empresaId);
      }

      const { count: totalAgendamentos } = await agendamentosQuery;

      const taxaConversao = totalChamadas > 0 
        ? ((totalAgendamentos || 0) / totalChamadas) * 100 
        : 0;

      return {
        totalChamadas,
        chamadasConcluidas,
        taxaSucesso: Math.round(taxaSucesso * 10) / 10,
        duracaoMedia: formatDuration(avgDuracao),
        totalAgendamentos: totalAgendamentos || 0,
        taxaConversao: Math.round(taxaConversao * 10) / 10,
      };
    },
  });
}

export function useFilteredAdminCallsOverTime(
  fromDate: Date | undefined,
  toDate: Date | undefined,
  empresaId: string | null
) {
  return useQuery({
    queryKey: ['admin-calls-over-time-filtered', fromDate?.toISOString(), toDate?.toISOString(), empresaId],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      const { startDate, endDate, days } = getDateRangeFromDates(fromDate, toDate);

      let chamadasQuery = supabase
        .from('chamadas')
        .select('data_hora_inicio')
        .gte('data_hora_inicio', startDate.toISOString())
        .lte('data_hora_inicio', new Date(endDate.getTime() + 86400000).toISOString());

      if (empresaId) {
        chamadasQuery = chamadasQuery.eq('empresa_id', empresaId);
      }

      const { data: chamadas } = await chamadasQuery;

      let agendamentosQuery = supabase
        .from('agendamentos')
        .select('created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', new Date(endDate.getTime() + 86400000).toISOString());

      if (empresaId) {
        agendamentosQuery = agendamentosQuery.eq('empresa_id', empresaId);
      }

      const { data: agendamentos } = await agendamentosQuery;

      const dayMap = new Map<string, { chamadas: number; agendamentos: number }>();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(endDate, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { chamadas: 0, agendamentos: 0 });
      }

      chamadas?.forEach((chamada) => {
        const date = new Date(chamada.data_hora_inicio);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.chamadas++;
        }
      });

      agendamentos?.forEach((agendamento) => {
        const date = new Date(agendamento.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.agendamentos++;
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        chamadas: data.chamadas,
        agendamentos: data.agendamentos,
      }));
    },
  });
}

export function useFilteredAdminCallsByAgent(
  fromDate: Date | undefined,
  toDate: Date | undefined,
  empresaId: string | null
) {
  return useQuery({
    queryKey: ['admin-calls-by-agent-filtered', fromDate?.toISOString(), toDate?.toISOString(), empresaId],
    queryFn: async (): Promise<AgentStats[]> => {
      const { startDate, endDate } = getDateRangeFromDates(fromDate, toDate);

      let query = supabase
        .from('chamadas')
        .select(`
          agente_id,
          status,
          agentes(id, nome)
        `)
        .gte('data_hora_inicio', startDate.toISOString())
        .lte('data_hora_inicio', new Date(endDate.getTime() + 86400000).toISOString())
        .not('agente_id', 'is', null);

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: chamadas } = await query;

      const agentMap = new Map<string, { nome: string; chamadas: number; sucesso: number }>();

      chamadas?.forEach((chamada) => {
        const agente = chamada.agentes as { id: string; nome: string } | null;
        if (agente) {
          const current = agentMap.get(agente.id) || { nome: agente.nome, chamadas: 0, sucesso: 0 };
          current.chamadas++;
          if (chamada.status === 'concluida') {
            current.sucesso++;
          }
          agentMap.set(agente.id, current);
        }
      });

      return Array.from(agentMap.entries())
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          chamadas: data.chamadas,
          sucesso: data.sucesso,
          taxaSucesso: data.chamadas > 0 ? Math.round((data.sucesso / data.chamadas) * 100) : 0,
        }))
        .sort((a, b) => b.chamadas - a.chamadas)
        .slice(0, 10);
    },
  });
}

export function useFilteredAdminCallsByIntent(
  fromDate: Date | undefined,
  toDate: Date | undefined,
  empresaId: string | null
) {
  return useQuery({
    queryKey: ['admin-calls-by-intent-filtered', fromDate?.toISOString(), toDate?.toISOString(), empresaId],
    queryFn: async (): Promise<IntentStats[]> => {
      const { startDate, endDate } = getDateRangeFromDates(fromDate, toDate);

      let query = supabase
        .from('chamadas')
        .select('intencao_detetada')
        .gte('data_hora_inicio', startDate.toISOString())
        .lte('data_hora_inicio', new Date(endDate.getTime() + 86400000).toISOString())
        .not('intencao_detetada', 'is', null);

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: chamadas } = await query;

      const intentionMap = new Map<string, number>();

      chamadas?.forEach((chamada) => {
        if (chamada.intencao_detetada) {
          const current = intentionMap.get(chamada.intencao_detetada) || 0;
          intentionMap.set(chamada.intencao_detetada, current + 1);
        }
      });

      return Array.from(intentionMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

// ============= CLIENT HOOKS =============

export function useClienteRelatorioStats(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-relatorio-stats', empresaId, dateRange],
    queryFn: async (): Promise<RelatorioStats> => {
      if (!empresaId) {
        return {
          totalChamadas: 0,
          chamadasConcluidas: 0,
          taxaSucesso: 0,
          duracaoMedia: '0:00',
          totalAgendamentos: 0,
          taxaConversao: 0,
        };
      }

      const startDate = getDateRange(dateRange);

      // Get chamadas data
      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('duracao, status')
        .eq('empresa_id', empresaId)
        .gte('data_hora_inicio', startDate.toISOString());

      const totalChamadas = chamadas?.length || 0;
      const chamadasConcluidas = chamadas?.filter(c => c.status === 'concluida').length || 0;
      const taxaSucesso = totalChamadas > 0 ? (chamadasConcluidas / totalChamadas) * 100 : 0;

      // Calculate average duration
      const totalDuracao = chamadas?.reduce((sum, c) => sum + (c.duracao || 0), 0) || 0;
      const countWithDuracao = chamadas?.filter(c => c.duracao).length || 0;
      const avgDuracao = countWithDuracao > 0 ? totalDuracao / countWithDuracao : 0;

      // Get agendamentos
      const { count: totalAgendamentos } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString());

      // Conversion rate (calls -> appointments)
      const taxaConversao = totalChamadas > 0 
        ? ((totalAgendamentos || 0) / totalChamadas) * 100 
        : 0;

      return {
        totalChamadas,
        chamadasConcluidas,
        taxaSucesso: Math.round(taxaSucesso * 10) / 10,
        duracaoMedia: formatDuration(avgDuracao),
        totalAgendamentos: totalAgendamentos || 0,
        taxaConversao: Math.round(taxaConversao * 10) / 10,
      };
    },
    enabled: !!empresaId,
  });
}

export function useClienteCallsOverTime(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-calls-over-time', empresaId, dateRange],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      if (!empresaId) return [];

      const days = dateRange === '7d' ? 7 : 30;
      const startDate = getDateRange(dateRange);
      const today = startOfDay(new Date());

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('data_hora_inicio')
        .eq('empresa_id', empresaId)
        .gte('data_hora_inicio', startDate.toISOString());

      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('created_at')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString());

      // Group by day
      const dayMap = new Map<string, { chamadas: number; agendamentos: number }>();

      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { chamadas: 0, agendamentos: 0 });
      }

      // Count calls per day
      chamadas?.forEach((chamada) => {
        const date = new Date(chamada.data_hora_inicio);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.chamadas++;
        }
      });

      // Count agendamentos per day
      agendamentos?.forEach((agendamento) => {
        const date = new Date(agendamento.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.agendamentos++;
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        chamadas: data.chamadas,
        agendamentos: data.agendamentos,
      }));
    },
    enabled: !!empresaId,
  });
}

export function useClienteCallsByAgent(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-calls-by-agent', empresaId, dateRange],
    queryFn: async (): Promise<AgentStats[]> => {
      if (!empresaId) return [];

      const startDate = getDateRange(dateRange);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select(`
          agente_id,
          status,
          agentes(id, nome)
        `)
        .eq('empresa_id', empresaId)
        .gte('data_hora_inicio', startDate.toISOString())
        .not('agente_id', 'is', null);

      // Group by agent
      const agentMap = new Map<string, { nome: string; chamadas: number; sucesso: number }>();

      chamadas?.forEach((chamada) => {
        const agente = chamada.agentes as { id: string; nome: string } | null;
        if (agente) {
          const current = agentMap.get(agente.id) || { nome: agente.nome, chamadas: 0, sucesso: 0 };
          current.chamadas++;
          if (chamada.status === 'concluida') {
            current.sucesso++;
          }
          agentMap.set(agente.id, current);
        }
      });

      return Array.from(agentMap.entries())
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          chamadas: data.chamadas,
          sucesso: data.sucesso,
          taxaSucesso: data.chamadas > 0 ? Math.round((data.sucesso / data.chamadas) * 100) : 0,
        }))
        .sort((a, b) => b.chamadas - a.chamadas)
        .slice(0, 10);
    },
    enabled: !!empresaId,
  });
}

export function useClienteCallsByIntent(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-calls-by-intent', empresaId, dateRange],
    queryFn: async (): Promise<IntentStats[]> => {
      if (!empresaId) return [];

      const startDate = getDateRange(dateRange);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('intencao_detetada')
        .eq('empresa_id', empresaId)
        .gte('data_hora_inicio', startDate.toISOString())
        .not('intencao_detetada', 'is', null);

      // Group by intention
      const intentionMap = new Map<string, number>();

      chamadas?.forEach((chamada) => {
        if (chamada.intencao_detetada) {
          const current = intentionMap.get(chamada.intencao_detetada) || 0;
          intentionMap.set(chamada.intencao_detetada, current + 1);
        }
      });

      return Array.from(intentionMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    enabled: !!empresaId,
  });
}
