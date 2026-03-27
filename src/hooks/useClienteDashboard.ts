import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, subDays, format } from 'date-fns';
import { pt } from 'date-fns/locale';

export interface ClienteStats {
  totalChamadas: number;
  chamadasHoje: number;
  agentesAtivos: number;
  agendamentosPendentes: number;
  duracaoMedia: string;
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

// Format average duration
function formatAverageDuration(totalSeconds: number, count: number): string {
  if (count === 0) return '0:00';
  const avgSeconds = Math.round(totalSeconds / count);
  const mins = Math.floor(avgSeconds / 60);
  const secs = avgSeconds % 60;
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

export function useClienteStats() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-stats', empresaId],
    queryFn: async (): Promise<ClienteStats> => {
      if (!empresaId) {
        return {
          totalChamadas: 0,
          chamadasHoje: 0,
          agentesAtivos: 0,
          agendamentosPendentes: 0,
          duracaoMedia: '0:00',
          taxaSucesso: 0,
        };
      }

      // Get total chamadas for this empresa
      const { count: totalChamadas } = await supabase
        .from('chamadas')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId);

      // Get chamadas hoje
      const today = startOfDay(new Date());
      const { count: chamadasHoje } = await supabase
        .from('chamadas')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .gte('data_hora_inicio', today.toISOString());

      // Get agentes ativos for this empresa
      const { count: agentesAtivos } = await supabase
        .from('agentes')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('status', 'ativo');

      // Get agendamentos pendentes for this empresa
      const { count: agendamentosPendentes } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('estado', 'pendente');

      // Get all chamadas for duration calculation
      const { data: chamadasData } = await supabase
        .from('chamadas')
        .select('duracao, status')
        .eq('empresa_id', empresaId);

      // Calculate duração média
      const totalDuracao = chamadasData?.reduce((sum, c) => sum + (c.duracao || 0), 0) || 0;
      const countWithDuracao = chamadasData?.filter(c => c.duracao).length || 0;
      const duracaoMedia = formatAverageDuration(totalDuracao, countWithDuracao);

      // Calculate taxa de sucesso
      const concluidas = chamadasData?.filter(c => c.status === 'concluida').length || 0;
      const total = chamadasData?.length || 0;
      const taxaSucesso = total > 0 ? (concluidas / total) * 100 : 0;

      return {
        totalChamadas: totalChamadas || 0,
        chamadasHoje: chamadasHoje || 0,
        agentesAtivos: agentesAtivos || 0,
        agendamentosPendentes: agendamentosPendentes || 0,
        duracaoMedia,
        taxaSucesso: Math.round(taxaSucesso * 10) / 10,
      };
    },
    enabled: !!empresaId,
  });
}

export function useClienteWeeklyChart() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-weekly-chart', empresaId],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      if (!empresaId) return [];

      const today = startOfDay(new Date());
      const sevenDaysAgo = subDays(today, 6);

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('data_hora_inicio, status')
        .eq('empresa_id', empresaId)
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
    enabled: !!empresaId,
  });
}

export function useClienteIntentionsChart() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-intentions-chart', empresaId],
    queryFn: async (): Promise<IntentionData[]> => {
      if (!empresaId) return [];

      const { data: chamadas } = await supabase
        .from('chamadas')
        .select('intencao_detetada')
        .eq('empresa_id', empresaId)
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
    enabled: !!empresaId,
  });
}

export function useClienteRecentCalls(limit: number = 10) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-recent-calls', empresaId, limit],
    queryFn: async (): Promise<RecentCall[]> => {
      if (!empresaId) return [];

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
        .eq('empresa_id', empresaId)
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
    enabled: !!empresaId,
  });
}
