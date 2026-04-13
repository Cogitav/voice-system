import { Intent, ConversationContext } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';

interface IntentResult {
  intent: Intent;
  confidence: number;
  method: 'deterministic' | 'llm';
}

const AVAILABILITY_KEYWORDS = [
  'próximo horário', 'proximo horario', 'próxima disponibilidade', 'quando têm', 'quando tem',
  'que horários', 'que horarios', 'horários disponíveis', 'horarios disponiveis',
  'quando posso', 'quando é possível', 'quando e possivel', 'há disponibilidade',
  'ha disponibilidade', 'tem vaga', 'tem disponibilidade', 'primeira disponibilidade',
];

const BOOKING_KEYWORDS = [
  'marcar', 'agendar', 'reservar', 'marcação', 'agendamento', 'reserva',
  'quero marcar', 'quero agendar', 'preciso marcar', 'gostava de marcar',
  'appointment', 'booking',
];

const RESCHEDULE_KEYWORDS = [
  'remarcar', 'reagendar', 'alterar', 'mudar', 'trocar', 'adiar',
  'muda', 'altera', 'outra hora', 'outro dia', 'outro horário',
  'remarcação', 'reagendamento',
];

const CANCEL_KEYWORDS = [
  'cancelar', 'anular', 'desmarcar', 'cancelamento', 'cancela',
  'não quero', 'nao quero', 'desisto', 'deixa estar',
];

const HUMAN_KEYWORDS = [
  'falar com', 'falar a', 'humano', 'pessoa', 'atendente', 'operador',
  'funcionário', 'funcionario', 'responsável', 'responsavel',
  'quero falar', 'preciso falar', 'transfere', 'transferir',
];

const INFO_KEYWORDS = [
  'quanto', 'preço', 'preco', 'valor', 'custo', 'quanto custa',
  'horário', 'horario', 'quando', 'onde', 'como', 'o que é', 'o que faz',
  'informação', 'informacao', 'dúvida', 'duvida', 'pergunta',
  'que serviços', 'que servicos', 'o que têm', 'o que tem',
];

function detectDeterministic(message: string, context: ConversationContext): IntentResult | null {
  const lower = message.toLowerCase();

  // If in booking flow, positive confirmations are not new intents
  const bookingStates = ['collecting_data', 'awaiting_slot_selection', 'awaiting_confirmation', 'booking_processing'];
  if (bookingStates.includes(context.state)) {
    if (/\b(sim|confirmo|confirmar|ok|certo|correto|exato|perfeito|ótimo|otimo|yes)\b/.test(lower)) {
      return { intent: context.current_intent ?? 'BOOKING_NEW', confidence: 0.95, method: 'deterministic' };
    }
  }

  for (const kw of CANCEL_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'CANCEL', confidence: 0.9, method: 'deterministic' };
  }

  for (const kw of RESCHEDULE_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'RESCHEDULE', confidence: 0.9, method: 'deterministic' };
  }

  for (const kw of HUMAN_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'HUMAN_REQUEST', confidence: 0.95, method: 'deterministic' };
  }

  for (const kw of AVAILABILITY_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'BOOKING_NEW', confidence: 0.9, method: 'deterministic' };
  }

  for (const kw of BOOKING_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'BOOKING_NEW', confidence: 0.85, method: 'deterministic' };
  }

  for (const kw of INFO_KEYWORDS) {
    if (lower.includes(kw)) return { intent: 'INFO_REQUEST', confidence: 0.8, method: 'deterministic' };
  }

  return null;
}

export async function classifyIntent(
  message: string,
  context: ConversationContext,
  empresaId: string
): Promise<IntentResult> {
  // Deterministic first
  const deterministic = detectDeterministic(message, context);
  if (deterministic) return deterministic;

  // LLM fallback
  try {
    const systemPrompt = `Classifica a intenção da mensagem do utilizador. Responde APENAS com um JSON no formato:
{"intent": "INTENT", "confidence": 0.0}

Intenções possíveis:
- BOOKING_NEW: quer marcar uma consulta, serviço ou agendamento
- RESCHEDULE: quer alterar ou remarcar um agendamento existente
- CANCEL: quer cancelar um agendamento
- INFO_REQUEST: quer informações sobre serviços, preços, horários
- HUMAN_REQUEST: quer falar com uma pessoa humana
- OTHER: qualquer outra coisa

Contexto atual: estado="${context.state}", intenção anterior="${context.current_intent ?? 'nenhuma'}"`;

    const response = await callLLMSimple(systemPrompt, message, empresaId, 'json');
    const parsed = JSON.parse(response);

    if (parsed.intent && ['BOOKING_NEW','RESCHEDULE','CANCEL','INFO_REQUEST','HUMAN_REQUEST','OTHER'].includes(parsed.intent)) {
      return { intent: parsed.intent as Intent, confidence: parsed.confidence ?? 0.7, method: 'llm' };
    }
  } catch {
    // LLM failed — return OTHER
  }

  return { intent: 'OTHER', confidence: 0.5, method: 'deterministic' };
}
