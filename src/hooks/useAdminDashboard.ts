import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, format } from 'date-fns';
import { pt } from 'date-fns/locale';

export interface AdminStats {
  empresasAtivas: number;
  totalChamadas: number;
  agentesAtivos: number;
  totalUtilizadores: number;
  errosFalhas: number;
  taxaSucesso: number;
}

export interface ChartDataPoint {
  name: string;
  chamadas: number;
  sucesso: number;
}

export interface IntentionData {
  name: string;
  value: number;
}

export interface RecentCall {
  id: string;
  telefone: string;
  agente: string;
  intencao: string;
  duracao: string;
  status: 'concluida' | 'em_andamento' | 'falha';
  data: string;
}

// Format duration in seconds to mm:ss
function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `Há ${diffMins} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  return `Há ${diffDays} dias`;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<AdminStats> => {
      // Get empresas ativas
      const { count: empresasAtivas } = await supabase
        .from('empresas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');

      // Get total chamadas
      const { count: totalChamadas } = await supabase
        .from('chamadas')
        .select('*', { count: 'exact', head: true });

      // Get agentes ativos
      const { count: agentesAtivos } = await supabase
        .from('agentes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');

      // Get total utilizadores
      const { count: totalUtilizadores } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get erros/falhas (last 24h)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const { count: errosFalhas } = await supabase
        .from('chamadas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'falha')
        .gte('created_at', yesterday.toISOString());

      // Calculate taxa de sucesso
      const { count: chamadasConcluidas } = await supabase
        .from('chamadas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'concluida');

      const total = totalChamadas || 0;
      const concluidas = chamadasConcluidas || 0;
      const taxaSucesso = total > 0 ? (concluidas / total) * 100 : 0;

      return {
        empresasAtivas: empresasAtivas || 0,
        totalChamadas: totalChamadas || 0,
        agentesAtivos: agentesAtivos || 0,
        totalUtilizadores: totalUtilizadores || 0,
        errosFalhas: errosFalhas || 0,
        taxaSucesso: Math.round(taxaSucesso * 10) / 10,
      };
    },
  });
}

export function useWeeklyCallsChart() {
  return useQuery({
    queryKey: ['weekly-calls-chart'],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      const today = startOfDay(new Date());
      const sevenDaysAgo = subDays(today, 6);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('data_hora_inicio, status')
        .gte('data_hora_inicio', sevenDaysAgo.toISOString());

      // Group by day
      const dayMap = new Map<string, { chamadas: number; sucesso: number }>();

      // Initialize all 7 days
      for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dayName = format(date, 'EEE', { locale: pt });
        dayMap.set(dayName, { chamadas: 0, sucesso: 0 });
      }

      // Count calls per day
      chamadas?.forEach((chamada) => {
        const date = new Date(chamada.data_hora_inicio);
        const dayName = format(date, 'EEE', { locale: pt });
        const current = dayMap.get(dayName) || { chamadas: 0, sucesso: 0 };
        current.chamadas++;
        if (chamada.status === 'concluida') {
          current.sucesso++;
        }
        dayMap.set(dayName, current);
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        chamadas: data.chamadas,
        sucesso: data.sucesso,
      }));
    },
  });
}

export function useIntentionsChart() {
  return useQuery({
    queryKey: ['intentions-chart'],
    queryFn: async (): Promise<IntentionData[]> => {
      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('intencao_detetada')
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
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
  });
}

export function useRecentCalls(limit: number = 10) {
  return useQuery({
    queryKey: ['recent-calls', limit],
    queryFn: async (): Promise<RecentCall[]> => {
      const { data: chamadas } = await supabase
        .from('chamadas')
        .select(`
          id,
          telefone_cliente,
          agente_id,
          intencao_detetada,
          duracao,
          status,
          data_hora_inicio,
          agentes(nome)
        `)
        .order('data_hora_inicio', { ascending: false })
        .limit(limit);

      return (chamadas || []).map((chamada) => ({
        id: chamada.id,
        telefone: chamada.telefone_cliente,
        agente: (chamada.agentes as { nome: string } | null)?.nome || 'Sem agente',
        intencao: chamada.intencao_detetada || 'Não identificada',
        duracao: formatDuration(chamada.duracao),
        status: chamada.status as 'concluida' | 'em_andamento' | 'falha',
        data: formatRelativeTime(chamada.data_hora_inicio),
      }));
    },
  });
}
