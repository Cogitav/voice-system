import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

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
  // Simulated fields for now
  resumo: string;
  transcricao: string;
  acoes_agente: string[];
}

// Simulated data generators
function generateSimulatedSummary(intencao: string | null): string {
  const summaries: Record<string, string> = {
    'Agendamento': 'O cliente ligou para agendar uma consulta médica. O agente verificou a disponibilidade e propôs duas opções de horário. O cliente escolheu a segunda opção e a marcação foi confirmada com sucesso.',
    'Informação': 'O cliente solicitou informações sobre os serviços disponíveis. O agente forneceu detalhes sobre horários de funcionamento, tipos de serviços e preços. O cliente agradeceu e indicou que irá considerar as opções.',
    'Reclamação': 'O cliente apresentou uma reclamação sobre o tempo de espera. O agente ouviu atentamente, pediu desculpas pelo inconveniente e ofereceu soluções alternativas. Foi criado um registo para acompanhamento.',
    'Cancelamento': 'O cliente solicitou o cancelamento de uma marcação existente. O agente confirmou os detalhes e processou o cancelamento. Foi oferecida a opção de reagendamento para uma data futura.',
    'Emergência': 'O cliente reportou uma situação urgente. O agente priorizou a chamada e encaminhou para a equipa de emergência. Foi garantido acompanhamento imediato.',
  };
  return summaries[intencao || ''] || 'Chamada processada pelo agente de IA. O cliente foi atendido e as suas questões foram respondidas de forma adequada.';
}

function generateSimulatedTranscript(intencao: string | null, agentName: string): string {
  return `[Sistema] Chamada iniciada - ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}

[${agentName}] Olá, bom dia! Bem-vindo ao nosso serviço de atendimento. O meu nome é ${agentName}, em que posso ajudar?

[Cliente] Olá, bom dia. Gostaria de ${intencao?.toLowerCase() || 'obter informações'}.

[${agentName}] Claro, terei todo o gosto em ajudar. Pode fornecer-me mais alguns detalhes?

[Cliente] Sim, claro. Preciso de informações sobre os vossos serviços.

[${agentName}] Certamente! Temos várias opções disponíveis. Deixe-me explicar cada uma delas...

[Cliente] Perfeito, obrigado pela informação.

[${agentName}] De nada! Há mais alguma coisa em que possa ajudar?

[Cliente] Não, é tudo. Muito obrigado pela ajuda.

[${agentName}] Foi um prazer ajudar. Tenha um excelente dia!

[Sistema] Chamada terminada - Duração total registada`;
}

function generateSimulatedActions(intencao: string | null, status: string): string[] {
  const baseActions = ['Saudação ao cliente', 'Verificação de identidade'];
  
  const intentActions: Record<string, string[]> = {
    'Agendamento': ['Consulta de disponibilidade', 'Proposta de horários', 'Confirmação de marcação'],
    'Informação': ['Fornecimento de informações', 'Esclarecimento de dúvidas'],
    'Reclamação': ['Registo de reclamação', 'Pedido de desculpas', 'Proposta de resolução'],
    'Cancelamento': ['Verificação de marcação', 'Processamento de cancelamento', 'Oferta de reagendamento'],
    'Emergência': ['Triagem de urgência', 'Encaminhamento para emergência'],
  };

  const actions = [...baseActions, ...(intentActions[intencao || ''] || ['Atendimento geral'])];
  
  if (status === 'concluida') {
    actions.push('Encerramento da chamada');
  }
  
  return actions;
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
        resumo: generateSimulatedSummary(data.intencao_detetada),
        transcricao: generateSimulatedTranscript(data.intencao_detetada, agenteName),
        acoes_agente: generateSimulatedActions(data.intencao_detetada, status),
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
