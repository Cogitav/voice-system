import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export interface Chamada {
  id: string;
  empresa_id: string;
  agente_id: string | null;
  telefone_cliente: string;
  data_hora_inicio: string;
  duracao: number | null;
  intencao_detetada: string | null;
  resultado: string | null;
  status: 'concluida' | 'em_andamento' | 'falha';
  created_at: string;
  agente_nome?: string;
  empresa_nome?: string;
}

export interface ChamadaFormatted {
  id: string;
  telefone: string;
  agente: string;
  empresa: string;
  intencao: string;
  duracao: string;
  status: 'concluida' | 'em_andamento' | 'falha';
  data: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  return format(new Date(dateString), "dd MMM yyyy, HH:mm", { locale: pt });
}

// Hook to fetch all calls (admin)
export function useAllChamadas() {
  return useQuery({
    queryKey: ['chamadas', 'all'],
    queryFn: async (): Promise<ChamadaFormatted[]> => {
      const { data, error } = await supabase
        .from('chamadas')
        .select(`
          id,
          empresa_id,
          agente_id,
          telefone_cliente,
          data_hora_inicio,
          duracao,
          intencao_detetada,
          resultado,
          status,
          created_at,
          deleted_at,
          agentes(nome, deleted_at),
          empresas(nome, deleted_at)
        `)
        .is('deleted_at', null) // Exclude soft-deleted calls
        .order('data_hora_inicio', { ascending: false });

      if (error) throw error;

      // Filter out calls from deleted empresas
      const filteredData = (data || []).filter((chamada: any) => !chamada.empresas?.deleted_at);

      return filteredData.map((chamada: any) => ({
        id: chamada.id,
        telefone: chamada.telefone_cliente,
        agente: chamada.agentes?.nome || 'Não atribuído',
        empresa: chamada.empresas?.nome || '-',
        intencao: chamada.intencao_detetada || 'Não identificada',
        duracao: formatDuration(chamada.duracao),
        status: chamada.status as 'concluida' | 'em_andamento' | 'falha',
        data: formatDate(chamada.data_hora_inicio),
      }));
    },
  });
}

// Hook to fetch calls for a specific empresa (client)
export function useChamadasByEmpresa(empresaId: string | null) {
  return useQuery({
    queryKey: ['chamadas', 'empresa', empresaId],
    queryFn: async (): Promise<ChamadaFormatted[]> => {
      if (!empresaId) return [];

      const { data, error } = await supabase
        .from('chamadas')
        .select(`
          id,
          empresa_id,
          agente_id,
          telefone_cliente,
          data_hora_inicio,
          duracao,
          intencao_detetada,
          resultado,
          status,
          created_at,
          deleted_at,
          agentes(nome)
        `)
        .eq('empresa_id', empresaId)
        .is('deleted_at', null) // Exclude soft-deleted calls
        .order('data_hora_inicio', { ascending: false });

      if (error) throw error;

      return (data || []).map((chamada: any) => ({
        id: chamada.id,
        telefone: chamada.telefone_cliente,
        agente: chamada.agentes?.nome || 'Não atribuído',
        empresa: '',
        intencao: chamada.intencao_detetada || 'Não identificada',
        duracao: formatDuration(chamada.duracao),
        status: chamada.status as 'concluida' | 'em_andamento' | 'falha',
        data: formatDate(chamada.data_hora_inicio),
      }));
    },
    enabled: !!empresaId,
  });
}

// Combined hook that uses auth context
export function useChamadas() {
  const { profile, isAdmin } = useAuth();
  const empresaId = profile?.empresa_id || null;

  const adminQuery = useAllChamadas();
  const clientQuery = useChamadasByEmpresa(empresaId);

  return isAdmin ? adminQuery : clientQuery;
}
