import { SchedulingService } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';
import { getServiceClient } from './supabase-client.ts';

interface ServiceResolveResult {
  service_id: string | null;
  service_name: string | null;
  confidence: number;
  method: 'deterministic' | 'llm';
}

const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.8;

export async function loadServices(empresaId: string): Promise<SchedulingService[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('scheduling_services')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('status', 'active')
    .eq('bookable', true)
    .order('priority', { ascending: false });

  if (error || !data) return [];
  return data as SchedulingService[];
}

function tryDeterministic(message: string, services: SchedulingService[]): ServiceResolveResult | null {
  const normalize = (text: string) =>
    text.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .trim();

  const input = normalize(message);
  let best: ServiceResolveResult | null = null;
  let bestScore = 0;

  for (const service of services) {
    let score = 0;
    const nameLower = normalize(service.name);
    const descLower = normalize(service.description || '');

    // Full name match
    if (input.includes(nameLower)) score += 100;
    else if (nameLower.includes(input)) score += 60;

    // Individual name words match
    const nameWords = nameLower.split(/\s+/).filter(w => w.length > 3);
    for (const word of nameWords) {
      if (input.includes(word)) score += 30;
    }

    // Description words match
    const descWords = descLower.split(/\s+/).filter(w => w.length > 4);
    const descMatches = descWords.filter(w => input.includes(w));
    score += descMatches.length * 20;

    // Priority boost
    score += (service.priority || 0) * 5;

    if (score > bestScore && score >= 30) {
      bestScore = score;
      best = {
        service_id: service.id,
        service_name: service.name,
        confidence: Math.min(0.95, score / 100),
        method: 'deterministic',
      };
    }
  }

  return best;
}

export async function resolveService(
  message: string,
  empresaId: string,
  services?: SchedulingService[]
): Promise<ServiceResolveResult> {
  const available = services ?? await loadServices(empresaId);

  if (available.length === 0) {
    return { service_id: null, service_name: null, confidence: 0, method: 'deterministic' };
  }

  if (available.length === 1) {
    return { service_id: available[0].id, service_name: available[0].name, confidence: 0.9, method: 'deterministic' };
  }

  const deterministic = tryDeterministic(message, available);
  if (deterministic) {
    if (deterministic.confidence >= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
      return deterministic;
    }

    return {
      service_id: null,
      service_name: null,
      confidence: deterministic.confidence,
      method: deterministic.method,
    };
  }

  try {
    const serviceList = available.map((s, i) => `${i + 1}. ${s.name}${s.description ? ': ' + s.description : ''}`).join('\n');

    const systemPrompt = `Identifica qual serviço o utilizador quer. Responde APENAS com JSON:
{"service_index": 1, "confidence": 0.0}

Se não conseguires identificar com confiança, usa: {"service_index": null, "confidence": 0.0}

Serviços disponíveis:
${serviceList}

Regras:
- Usa service_index null se não tiveres confiança >= 0.7
- NUNCA inventes um serviço que não está na lista
- Responde APENAS com JSON válido`;

    const promptForCall = systemPrompt.replace('>= 0.7', '>= 0.8');

    const response = await callLLMSimple(promptForCall, message, empresaId, 'json');
    const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());
    const parsedConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

    if (parsed.service_index !== null && parsedConfidence < AUTO_SELECT_CONFIDENCE_THRESHOLD) {
      return {
        service_id: null,
        service_name: null,
        confidence: parsedConfidence,
        method: 'llm',
      };
    }

    if (parsed.service_index !== null && parsedConfidence >= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
      const idx = parseInt(parsed.service_index) - 1;
      if (idx >= 0 && idx < available.length) {
        return {
          service_id: available[idx].id,
          service_name: available[idx].name,
          confidence: parsedConfidence,
          method: 'llm',
        };
      }
    }
  } catch {
    // LLM failed
  }

  return { service_id: null, service_name: null, confidence: 0, method: 'llm' };
}
