import { ConversationContext, SlotSuggestion } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';

interface ResponseContext {
  agent_name: string;
  agent_prompt: string;
  empresa_name: string;
  language: string;
}

export async function generateResponse(
  userMessage: string,
  context: ConversationContext,
  responseHint: string,
  slots: SlotSuggestion[] | null,
  agentCtx: ResponseContext,
  empresaId: string
): Promise<string> {
  const slotList = slots && slots.length > 0
    ? slots.map((s, i) => `${i + 1}. ${s.display_label}`).join('\n')
    : null;

  const systemPrompt = `${agentCtx.agent_prompt}

Empresa: ${agentCtx.empresa_name}
Idioma: português europeu (pt-PT)
Tom: profissional mas acessível

Estado atual da conversa: ${context.state}
Intenção do utilizador: ${context.current_intent ?? 'desconhecida'}

Dados já recolhidos:
- Nome: ${context.customer_name ?? 'não fornecido'}
- Email: ${context.customer_email ?? 'não fornecido'}
- Telefone: ${context.customer_phone ?? 'não fornecido'}
- Serviço: ${context.service_name ?? 'não definido'}
- Data preferida: ${context.preferred_date ?? 'não definida'}

Instrução para esta resposta: ${responseHint}
${slotList ? `\nHorários disponíveis para apresentar:\n${slotList}` : ''}

Regras obrigatórias:
- Responde SEMPRE em português europeu (pt-PT)
- Sê direto e claro — sem introduções longas
- Se tens horários para mostrar, apresenta-os numerados tal como te foram fornecidos
- Nunca confirmes um agendamento sem o sistema ter confirmado o sucesso
- Nunca inventes informação
- Máximo 3 frases, exceto quando apresentas horários`;

  try {
    return await callLLMSimple(systemPrompt, userMessage, empresaId, 'text');
  } catch {
    return getFallbackResponse(context.state, responseHint);
  }
}

export function getFallbackResponse(state: string, hint: string): string {
  const fallbacks: Record<string, string> = {
    collecting_data: 'Preciso de mais alguns dados para continuar. Pode ajudar-me?',
    awaiting_slot_selection: 'Por favor escolha um dos horários disponíveis.',
    awaiting_confirmation: 'Confirma os dados do agendamento?',
    booking_processing: 'A processar o seu agendamento...',
    completed: 'O seu agendamento foi confirmado com sucesso.',
    error: 'Peço desculpa, tive um problema técnico. Posso transferir para um operador humano.',
    human_handoff: 'Vou transferir para um operador humano agora.',
  };
  return fallbacks[state] ?? hint ?? 'Como posso ajudar?';
}

export function buildConfirmationMessage(context: ConversationContext): string {
  const slot = context.selected_slot ?? context.available_slots?.[0];
  if (!slot) return 'Confirma o seu agendamento?';

  return `Por favor confirme os dados do agendamento:

📅 ${slot.display_label}
🏥 Serviço: ${context.service_name ?? 'N/A'}
👤 Nome: ${context.customer_name ?? 'N/A'}
📧 Email: ${context.customer_email ?? 'N/A'}${context.customer_phone ? `\n📞 Telefone: ${context.customer_phone}` : ''}

Responda "sim" para confirmar ou indique qualquer alteração.`;
}
