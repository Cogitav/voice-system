import { SchedulingService } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';
import { getServiceClient } from './supabase-client.ts';

interface ServiceResolveResult {
  service_id: string | null;
  service_name: string | null;
  confidence: number;
  method: 'deterministic' | 'llm';
}

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
  const lower = message.toLowerCase();

  for (const service of services) {
    const nameLower = service.name.toLowerCase();
    if (lower.includes(nameLower)) {
      return { service_id: service.id, service_name: service.name, confidence: 0.95, method: 'deterministic' };
    }
    if (service.description) {
      const words = service.description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matches = words.filter(w => lower.includes(w));
      if (matches.length >= 2) {
        return { service_id: service.id, service_name: service.name, confidence: 0.8, method: 'deterministic' };
      }
    }
  }
  return null;
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
  if (deterministic) return deterministic;

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

    const response = await callLLMSimple(systemPrompt, message, empresaId, 'json');
    const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());

    if (parsed.service_index !== null && parsed.confidence >= 0.7) {
      const idx = parseInt(parsed.service_index) - 1;
      if (idx >= 0 && idx < available.length) {
        return {
          service_id: available[idx].id,
          service_name: available[idx].name,
          confidence: parsed.confidence,
          method: 'llm',
        };
      }
    }
  } catch {
    // LLM failed
  }

  return { service_id: null, service_name: null, confidence: 0, method: 'llm' };
}
