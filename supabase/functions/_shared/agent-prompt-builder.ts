import { ConversationContext, SlotSuggestion } from './types.ts';

// Single source of truth for agent identity and behavior prompt construction.
// Mode-specific endings are allowed; duplicated core prompt logic is not.

type ResponseStyle = 'formal' | 'neutral' | 'friendly' | 'energetic';

export interface AgentPromptBuilderAgent {
  nome?: string | null;
  idioma?: string | null;
  descricao_funcao?: string | null;
  contexto_negocio?: string | null;
  prompt_base?: string | null;
  regras?: string | null;
  response_style?: string | null;
}

export interface AgentPromptBuilderEmpresa {
  nome?: string | null;
}

export interface AgentPromptKnowledgeItem {
  title: string;
  type: string;
  content?: string | null;
  source_url?: string | null;
}

export type AgentPromptMode =
  | {
      kind: 'test';
      knowledge?: AgentPromptKnowledgeItem[] | null;
    }
  | {
      kind: 'chat';
      context: ConversationContext;
      responseHint: string;
      slots?: SlotSuggestion[] | null;
    };

export interface BuildAgentSystemPromptInput {
  agent: AgentPromptBuilderAgent | null | undefined;
  empresa?: AgentPromptBuilderEmpresa | null;
  mode: AgentPromptMode;
}

const DEFAULT_LANGUAGE = 'Português de Portugal (pt-PT)';
const DEFAULT_STYLE_LABEL = 'profissional mas acessível';

const RESPONSE_STYLE_LABELS: Record<ResponseStyle, string> = {
  formal: 'formal e institucional',
  neutral: DEFAULT_STYLE_LABEL,
  friendly: 'amigável e acessível',
  energetic: 'dinâmico e entusiasta',
};

function nonEmpty(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveResponseStyle(value?: string | null): string {
  const normalized = nonEmpty(value) as ResponseStyle | null;
  if (normalized && normalized in RESPONSE_STYLE_LABELS) {
    return RESPONSE_STYLE_LABELS[normalized];
  }
  return DEFAULT_STYLE_LABEL;
}

function appendSection(parts: string[], title: string, content?: string | null): void {
  const text = nonEmpty(content);
  if (text) {
    parts.push(`\n## ${title}\n${text}`);
  }
}

function buildCorePrompt(
  agent: AgentPromptBuilderAgent | null | undefined,
  empresa?: AgentPromptBuilderEmpresa | null,
): string[] {
  const parts: string[] = [];
  const agentName = nonEmpty(agent?.nome) ?? 'Assistente';
  const language = nonEmpty(agent?.idioma) ?? DEFAULT_LANGUAGE;
  const style = resolveResponseStyle(agent?.response_style);
  const empresaName = nonEmpty(empresa?.nome);

  parts.push(`Você é ${agentName}, um agente de IA de voz.`);
  if (empresaName) {
    parts.push(`Empresa: ${empresaName}`);
  }
  parts.push(`Idioma principal: ${language}`);
  parts.push(`Tom: ${style}`);

  appendSection(parts, 'Descrição da Função', agent?.descricao_funcao);
  appendSection(parts, 'Contexto de Negócio', agent?.contexto_negocio);
  appendSection(parts, 'Instruções de Comportamento', agent?.prompt_base);
  appendSection(parts, 'Regras e Restrições', agent?.regras);

  return parts;
}

function buildTestModePrompt(parts: string[], mode: Extract<AgentPromptMode, { kind: 'test' }>): void {
  const knowledge = mode.knowledge ?? [];
  if (knowledge.length > 0) {
    parts.push('\n## Base de Conhecimento\nUtilize as seguintes informações para responder com precisão:');

    knowledge.forEach((item, index) => {
      parts.push(`\n### ${index + 1}. ${item.title} (${item.type})`);
      const content = nonEmpty(item.content);
      const sourceUrl = nonEmpty(item.source_url);
      if (content) parts.push(content);
      if (sourceUrl) parts.push(`Fonte: ${sourceUrl}`);
    });
  }

  parts.push(
    '\n## Contexto de Simulação\nEsta é uma simulação de teste. Responda como se estivesse numa chamada telefónica real com um cliente.\nSeja natural, profissional e siga todas as regras definidas.\nMantenha as respostas concisas e adequadas para comunicação por voz.',
  );
}

function buildChatModePrompt(parts: string[], mode: Extract<AgentPromptMode, { kind: 'chat' }>): void {
  const { context, responseHint, slots } = mode;
  const slotList = slots && slots.length > 0
    ? slots.map((s, i) => `${i + 1}. ${s.display_label}`).join('\n')
    : null;

  parts.push(`\n## Contexto Operacional
Estado atual da conversa: ${context.state}
Intenção do utilizador: ${context.current_intent ?? 'desconhecida'}

Dados já recolhidos:
- Nome: ${context.customer_name ?? 'não fornecido'}
- Email: ${context.customer_email ?? 'não fornecido'}
- Telefone: ${context.customer_phone ?? 'não fornecido'}
- Serviço: ${context.service_name ?? 'não definido'}
- Data preferida: ${context.preferred_date ?? 'não definida'}

Instrução para esta resposta: ${responseHint}`);

  if (slotList) {
    parts.push(`\nHorários disponíveis para apresentar:\n${slotList}`);
  }

  parts.push(`\n## Regras Obrigatórias de Resposta
- Responde SEMPRE em português europeu (pt-PT)
- Sê direto e claro — sem introduções longas
- Se tens horários para mostrar, apresenta-os numerados tal como te foram fornecidos
- Nunca confirmes um agendamento sem o sistema ter confirmado o sucesso
- Nunca inventes informação
- Máximo 3 frases, exceto quando apresentas horários`);
}

export function buildAgentSystemPrompt(input: BuildAgentSystemPromptInput): string {
  const parts = buildCorePrompt(input.agent, input.empresa);

  if (input.mode.kind === 'test') {
    buildTestModePrompt(parts, input.mode);
  } else {
    buildChatModePrompt(parts, input.mode);
  }

  return parts.join('\n');
}
