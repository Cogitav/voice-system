import { ConversationContext, SlotSuggestion } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';
import { AgentPromptBuilderAgent, AgentPromptBuilderEmpresa, buildAgentSystemPrompt } from './agent-prompt-builder.ts';

interface ResponseContext {
  agent_name: string;
  agent_prompt: string;
  empresa_name: string;
  language: string;
  agent?: AgentPromptBuilderAgent;
  empresa?: AgentPromptBuilderEmpresa;
}

export async function generateResponse(
  userMessage: string,
  context: ConversationContext,
  responseHint: string,
  slots: SlotSuggestion[] | null,
  agentCtx: ResponseContext,
  empresaId: string
): Promise<string> {
  try {
    return await callLLMSimple(
      buildAgentSystemPrompt({
        agent: agentCtx.agent ?? {
          nome: agentCtx.agent_name,
          prompt_base: agentCtx.agent_prompt,
          idioma: agentCtx.language,
        },
        empresa: agentCtx.empresa ?? { nome: agentCtx.empresa_name },
        mode: {
          kind: 'chat',
          context,
          responseHint,
          slots,
        },
      }),
      userMessage,
      empresaId,
      'text',
    );
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
