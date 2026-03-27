import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRegisterCreditUsage } from '@/hooks/useCredits';

interface SimularChamadaParams {
  empresaId: string;
  agenteId: string;
}

// Realistic Portuguese phone numbers
const generateFakePhone = (): string => {
  const prefixes = ['91', '92', '93', '96'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `+351${prefix}${number}`;
};

// Realistic intents
const generateIntent = (): string => {
  const intents = [
    'Agendamento de consulta',
    'Informação sobre serviços',
    'Cancelamento de reserva',
    'Suporte técnico',
    'Reclamação',
    'Pedido de orçamento',
    'Confirmação de marcação',
    'Alteração de dados',
    'Informação de horários',
    'Dúvida sobre pagamento',
  ];
  return intents[Math.floor(Math.random() * intents.length)];
};

/**
 * DETERMINISTIC STATUS: Simulated calls are ALWAYS 'concluida'.
 * 'falha' is ONLY for real technical errors (connection drops, AI crashes, transcription failures).
 * Simulations represent successful call flows for testing and demo purposes.
 */
const getSimulatedStatus = (): 'concluida' => {
  return 'concluida';
};

// Realistic call duration (30s to 10min)
const generateDuration = (): number => {
  return Math.floor(Math.random() * 570) + 30;
};

// Realistic call result/summary
const generateResultado = (intent: string): string => {
  const summaries: Record<string, string[]> = {
    'Agendamento de consulta': ['Consulta agendada para próxima semana', 'Cliente reagendou para o dia seguinte'],
    'Informação sobre serviços': ['Informações enviadas por email', 'Cliente interessado em serviço premium'],
    'Cancelamento de reserva': ['Reserva cancelada com sucesso', 'Oferecido reagendamento ao cliente'],
    'Suporte técnico': ['Problema resolvido remotamente', 'Ticket criado para acompanhamento'],
    'Reclamação': ['Reclamação registada para análise', 'Situação resolvida com compensação'],
    'Pedido de orçamento': ['Orçamento enviado por email', 'Cliente vai analisar proposta'],
    'Confirmação de marcação': ['Marcação confirmada', 'Cliente confirmou presença'],
    'Alteração de dados': ['Dados atualizados no sistema', 'Email de confirmação enviado'],
    'Informação de horários': ['Horários informados ao cliente', 'Cliente vai ligar novamente'],
    'Dúvida sobre pagamento': ['Dúvida esclarecida', 'Enviado comprovativo por email'],
  };
  
  const options = summaries[intent] || ['Chamada concluída com sucesso'];
  return options[Math.floor(Math.random() * options.length)];
};

export function useSimularChamada() {
  const queryClient = useQueryClient();
  const registerCredit = useRegisterCreditUsage();

  return useMutation({
    mutationFn: async ({ empresaId, agenteId }: SimularChamadaParams) => {
      // Validation: empresa context is required
      if (!empresaId) {
        throw new Error('Missing empresa context - cannot register credits');
      }

      const status = getSimulatedStatus();
      const intent = generateIntent();
      const resultado = generateResultado(intent);
      const duracao = generateDuration();
      const dataHoraInicio = new Date();
      const dataHoraFim = new Date(dataHoraInicio.getTime() + duracao * 1000);

      // Insert the call with full data
      const { data, error } = await supabase
        .from('chamadas')
        .insert({
          empresa_id: empresaId,
          agente_id: agenteId,
          telefone_cliente: generateFakePhone(),
          intencao_detetada: intent,
          duracao: duracao,
          status: status,
          resultado: resultado,
          data_hora_inicio: dataHoraInicio.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      
      // Register credit usage AFTER successful call creation
      // Credits are debited ONCE using the call ID as reference for idempotency
      const creditsToCharge = duracao < 60 ? 'call_short' : 'call_completed';
      
      registerCredit.mutate({
        empresaId,
        eventType: creditsToCharge,
        referenceId: data.id,
        metadata: { 
          intent, 
          status, 
          duracao,
          data_hora_fim: dataHoraFim.toISOString(),
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamadas'] });
      toast.success('Chamada simulada criada com sucesso');
    },
    onError: (error: Error) => {
      // On error, NO credits are debited
      console.error('Error simulating call:', error);
      toast.error('Erro ao simular chamada: ' + error.message);
    },
  });
}
