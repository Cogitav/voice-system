import { ConversationContext } from './types.ts';
import { parseDateTime } from './date-parser.ts';
import { isValidEmail, isValidPhonePT, normalizePhone, sanitizeText } from './validators.ts';
import { callLLMSimple } from './llm-provider.ts';

interface ExtractedEntities {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_reason?: string;
  preferred_date?: string;
  preferred_time?: string;
  method: 'deterministic' | 'llm' | 'mixed';
}

function extractDeterministic(message: string, referenceDate: Date, timezone: string): Partial<ExtractedEntities> {
  const result: Partial<ExtractedEntities> = {};

  // Email
  const emailMatch = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && isValidEmail(emailMatch[0])) {
    result.customer_email = emailMatch[0].toLowerCase();
  }

  // Phone PT
  const phoneMatch = message.match(/(\+351|00351)?[\s\-]?[239]\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/);
  if (phoneMatch && isValidPhonePT(phoneMatch[0])) {
    result.customer_phone = normalizePhone(phoneMatch[0]);
  }

  // Date and time
  const { date, time } = parseDateTime(message, referenceDate, timezone);
  if (date) result.preferred_date = date;
  if (time) result.preferred_time = time;

  return result;
}

export async function extractEntities(
  message: string,
  context: ConversationContext,
  empresaId: string,
  timezone: string = 'Europe/Lisbon'
): Promise<ExtractedEntities> {
  const referenceDate = new Date();
  const deterministic = extractDeterministic(message, referenceDate, timezone);

  const needsLLM = !context.customer_name && !deterministic.customer_name;
  const hasEnoughForDeterministic = deterministic.customer_email || deterministic.customer_phone || deterministic.preferred_date;

  if (!needsLLM && hasEnoughForDeterministic) {
    return { ...deterministic, method: 'deterministic' };
  }

  // LLM extraction for name and reason
  try {
    const missingFields = [];
    if (!context.customer_name) missingFields.push('nome completo');
    if (!context.customer_reason) missingFields.push('motivo ou serviço pretendido');

    if (missingFields.length === 0) {
      return { ...deterministic, method: 'deterministic' };
    }

    const systemPrompt = `Extrai informação da mensagem do utilizador. Responde APENAS com JSON válido:
{
  "customer_name": "nome completo ou null",
  "customer_reason": "motivo/serviço ou null"
}

Regras:
- Extrai APENAS o que está explicitamente na mensagem
- NUNCA inventes dados
- Se não encontrares, usa null
- Nome deve ser 2+ palavras para ser válido
- Responde sempre em JSON válido sem markdown`;

    const response = await callLLMSimple(systemPrompt, message, empresaId, 'json');
    const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());

    const llmResult: Partial<ExtractedEntities> = {};
    if (parsed.customer_name && parsed.customer_name !== 'null' && parsed.customer_name.length >= 2) {
      llmResult.customer_name = sanitizeText(parsed.customer_name);
    }
    if (parsed.customer_reason && parsed.customer_reason !== 'null') {
      llmResult.customer_reason = sanitizeText(parsed.customer_reason);
    }

    const method = Object.keys(deterministic).length > 0 && Object.keys(llmResult).length > 0
      ? 'mixed'
      : Object.keys(llmResult).length > 0 ? 'llm' : 'deterministic';

    return { ...deterministic, ...llmResult, method };
  } catch {
    return { ...deterministic, method: 'deterministic' };
  }
}

export function getMissingFields(
  context: ConversationContext,
  requirePhone: boolean = false,
  requireReason: boolean = true
): string[] {
  const missing: string[] = [];
  if (!context.customer_name) missing.push('customer_name');
  if (!context.customer_email) missing.push('customer_email');
  if (requirePhone && !context.customer_phone) missing.push('customer_phone');
  if (requireReason && !context.customer_reason) missing.push('customer_reason');
  if (!context.service_id) missing.push('service_id');
  if (!context.preferred_date) missing.push('preferred_date');
  return missing;
}

export function getNextFieldToAsk(missingFields: string[]): string | null {
  const priority = ['service_id', 'customer_name', 'customer_email', 'customer_phone', 'preferred_date', 'customer_reason'];
  for (const field of priority) {
    if (missingFields.includes(field)) return field;
  }
  return missingFields[0] ?? null;
}
