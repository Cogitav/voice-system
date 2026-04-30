import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChamadaDetail {
  id: string;
  empresa_id: string;
  agente_id: string | null;
  telefone_cliente: string;
  data_hora_inicio: string;
  duracao: number | null;
  intencao_detetada: string | null;
  resultado: string | null;
  status: 'concluida' | 'em_andamento' | 'falha';
  proxima_acao: string | null;
  created_at: string;
  agente_nome: string;
  empresa_nome: string;
  // The voice ingestion / transcription pipeline is not yet wired.
  // These fields are reserved for that future backend feature and are
  // intentionally null today — the UI must not fabricate values for them.
  resumo: string | null;
  transcricao: string | null;
  acoes_agente: string[] | null;
}

export function useChamadaDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['chamada', id],
    queryFn: async (): Promise<ChamadaDetail | null> => {
      if (!id) return null;

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
          proxima_acao,
          created_at,
          agentes(nome),
          empresas(nome)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) return null;

      const agenteName = (data as any).agentes?.nome || 'Agente IA';
      const status = data.status as 'concluida' | 'em_andamento' | 'falha';

      return {
        ...data,
        status,
        agente_nome: agenteName,
        empresa_nome: (data as any).empresas?.nome || 'N/A',
        // Synthetic transcript/summary/actions removed — see ChamadaDetail interface comment.
        resumo: null,
        transcricao: null,
        acoes_agente: null,
      };
    },
    enabled: !!id,
  });
}

export function useUpdateProximaAcao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, proxima_acao }: { id: string; proxima_acao: string | null }) => {
      const { data, error } = await supabase
        .from('chamadas')
        .update({ proxima_acao })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chamada', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['chamadas'] });
    },
  });
}
