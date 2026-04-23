import {
  ResponseDirective,
  MustSayBlock,
  ToneDirective,
  ConfirmedDataSnapshot,
  ConversationState,
  EmotionalContext,
} from './types.ts';
import {
  CREATIVE_FREEDOM_BY_STATE,
  MAX_SENTENCES_BY_STATE,
  GLOBAL_MUST_NOT,
} from './constants.ts';

// ─── 1. buildToneDirective ──────────────────────────────────────────────────

export function buildToneDirective(
  state: ConversationState,
  emotionalContext: EmotionalContext | null
): ToneDirective {
  const creativeFreedom = CREATIVE_FREEDOM_BY_STATE[state];
  const maxSentences = MAX_SENTENCES_BY_STATE[state];

  const urgentOrAnxious =
    emotionalContext?.tone === 'urgent' || emotionalContext?.tone === 'anxious';

  const formalStates: ConversationState[] = ['awaiting_confirmation', 'booking_processing'];
  const isFormal = formalStates.includes(state);

  let base: ToneDirective['base'];
  if (isFormal) {
    base = 'professional';
  } else if (urgentOrAnxious) {
    base = 'warm';
  } else {
    base = 'friendly';
  }

  const maxEmojiMap: Record<string, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
  };

  return {
    base,
    adapt_to_emotion: emotionalContext !== null,
    max_emoji: maxEmojiMap[creativeFreedom] ?? 1,
    max_sentences: maxSentences,
  };
}

// ─── 2. buildResponseDirective ─────────────────────────────────────────────

export function buildResponseDirective(params: {
  state: ConversationState;
  mustSayBlocks: MustSayBlock[];
  confirmedData: ConfirmedDataSnapshot;
  emotionalContext: EmotionalContext | null;
  language: string;
  extraMustNot?: string[];
}): ResponseDirective {
  const { state, mustSayBlocks, confirmedData, emotionalContext, language, extraMustNot } = params;

  const sortedMustSay = [...mustSayBlocks].sort((a, b) => a.priority - b.priority);

  const mustNot = extraMustNot && extraMustNot.length > 0
    ? [...GLOBAL_MUST_NOT, ...extraMustNot]
    : [...GLOBAL_MUST_NOT];

  return {
    must_say: sortedMustSay,
    must_not: mustNot,
    creative_freedom: CREATIVE_FREEDOM_BY_STATE[state],
    tone: buildToneDirective(state, emotionalContext),
    emotional_context: emotionalContext,
    current_state: state,
    confirmed_data: confirmedData,
    language,
  };
}

// ─── 3. serializeDirectiveToPrompt ─────────────────────────────────────────

function serializeConfirmedData(data: ConfirmedDataSnapshot): string {
  const lines: string[] = [];
  if (data.service_name) lines.push(`  Serviço: ${data.service_name}`);
  if (data.customer_name) lines.push(`  Nome: ${data.customer_name}`);
  if (data.customer_email) lines.push(`  Email: ${data.customer_email}`);
  if (data.customer_phone) lines.push(`  Telefone: ${data.customer_phone}`);
  if (data.date) lines.push(`  Data: ${data.date}`);
  if (data.time_start) lines.push(`  Hora início: ${data.time_start}`);
  if (data.time_end) lines.push(`  Hora fim: ${data.time_end}`);
  return lines.length > 0 ? lines.join('\n') : '  (nenhum dado confirmado ainda)';
}

function serializeMustSayBlock(block: MustSayBlock, index: number): string {
  const prefix = `${index + 1}. [${block.type}]`;
  if (typeof block.content === 'string') {
    return `${prefix} ${block.content}`;
  }
  if (Array.isArray(block.content)) {
    const items = (block.content as unknown[]).map((item, i) => {
      if (typeof item === 'string') return `  - ${item}`;
      const slot = item as Record<string, unknown>;
      return `  ${slot.slot_number}. ${slot.display ?? `${slot.date} ${slot.time_start}–${slot.time_end}`}`;
    });
    return `${prefix}\n${items.join('\n')}`;
  }
  return prefix;
}

export function serializeDirectiveToPrompt(directive: ResponseDirective): string {
  const mustSaySerialized = directive.must_say
    .map((block, i) => serializeMustSayBlock(block, i))
    .join('\n');

  const mustNotSerialized = directive.must_not
    .map(rule => `- ${rule}`)
    .join('\n');

  const emotionSerialized = directive.emotional_context
    ? `${directive.emotional_context.tone} (palavras-chave: ${directive.emotional_context.keywords.join(', ')})`
    : 'nenhum';

  return `Função: Gerar resposta para assistente de atendimento ao cliente.

DIRETIVA (OBRIGATÓRIA):

Estado atual: ${directive.current_state}
Deve comunicar (por ordem de prioridade):
${mustSaySerialized}

Dados confirmados:
${serializeConfirmedData(directive.confirmed_data)}

Tom: ${directive.tone.base}, máximo de emojis: ${directive.tone.max_emoji}, máximo de frases: ${directive.tone.max_sentences}
Liberdade criativa: ${directive.creative_freedom}
Contexto emocional: ${emotionSerialized}

PROIBIDO:
${mustNotSerialized}

REGRAS:
- Diz TUDO o que está em "Deve comunicar", pela ordem indicada
- NÃO digas NADA do que está em "PROIBIDO"
- NÃO inventes informação
- NÃO repitas dados já confirmados
- Responde em ${directive.language}`;
}

// ─── 4. HARDCODED_TEMPLATES ─────────────────────────────────────────────────

export const HARDCODED_TEMPLATES = {
  awaiting_confirmation: (data: ConfirmedDataSnapshot): string =>
    `Confirma o agendamento?\n\n` +
    `📅 ${data.date ?? 'Data não definida'}\n` +
    `⏰ ${data.time_start ?? '--'} - ${data.time_end ?? '--'}\n` +
    `📋 ${data.service_name ?? 'Serviço não definido'}\n` +
    `👤 ${data.customer_name ?? 'Nome não definido'}\n` +
    `📧 ${data.customer_email ?? 'Email não definido'}\n` +
    `📞 ${data.customer_phone ?? 'N/A'}\n\n` +
    `Responde com **sim** para confirmar ou **não** para alterar.`,

  booking_confirmed: (data: ConfirmedDataSnapshot): string =>
    `✅ Agendamento confirmado!\n\n` +
    `📅 ${data.date ?? 'Data não definida'}\n` +
    `⏰ ${data.time_start ?? '--'} - ${data.time_end ?? '--'}\n` +
    `📋 ${data.service_name ?? 'Serviço não definido'}\n\n` +
    `Enviámos uma confirmação para ${data.customer_email ?? 'o seu email'}.\n` +
    `Se precisares de alterar ou cancelar, fala connosco.`,
};

// ─── 5. getHardcodedResponse ────────────────────────────────────────────────

export function getHardcodedResponse(
  state: ConversationState,
  confirmedData: ConfirmedDataSnapshot
): string | null {
  switch (state) {
    case 'awaiting_confirmation':
      return HARDCODED_TEMPLATES.awaiting_confirmation(confirmedData);
    case 'completed':
      return HARDCODED_TEMPLATES.booking_confirmed(confirmedData);
    case 'checking_availability':
    case 'booking_processing':
      return null; // silent states — no user-visible response
    default:
      return null; // LLM handles all other states
  }
}
