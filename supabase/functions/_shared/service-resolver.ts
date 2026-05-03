import { SchedulingService } from './types.ts';
import { callLLMSimple } from './llm-provider.ts';
import { getServiceClient } from './supabase-client.ts';
import { logAgentEvent } from './logger.ts';

interface ServiceResolveResult {
  service_id: string | null;
  service_name: string | null;
  confidence: number;
  method: 'deterministic' | 'llm' | 'fallback' | 'synonym';
}

interface ServiceResolutionObservability {
  conversation_id?: string | null;
  state?: string | null;
  current_intent?: string | null;
  existing_service_id?: string | null;
  selected_slot?: unknown;
  required_fields_missing?: unknown;
  decision_action?: string | null;
}

interface ServiceResolveOptions {
  // When true, the user EXPLICITLY mentioned a service-like noun (e.g. via
  // extraction.service_keywords). In that case, if no high-confidence
  // deterministic/synonym match is found, we return null and let the
  // caller surface the active service list — instead of silently
  // falling back to a configured generic service. The fallback path
  // remains intact for the IMPLICIT case (no explicit service signal).
  explicitServiceSignal?: boolean;
}

const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.8;

// Deterministic synonym map for common service nouns. Each entry maps
// user-text patterns (already normalized) to fragments that should match
// an active service name (also normalized). The first synonym group whose
// patterns intersect the input AND whose target matches an active service
// wins, with 0.95 confidence. Synonyms only resolve to services that the
// company has actually configured — they NEVER invent a service.
const SERVICE_SYNONYMS: Array<{
  patterns: string[];
  targetMatchers: string[];
  label: string;
}> = [
  {
    patterns: ['higiene oral', 'limpeza dentaria', 'limpeza dos dentes', 'limpeza dental', 'limpeza'],
    targetMatchers: ['destart'],
    label: 'higiene/limpeza → Destartarização',
  },
  {
    patterns: ['carie', 'dor de dent', 'dente estragado', 'dente partido', 'dente cariado'],
    targetMatchers: ['carie', 'cari', 'tratamento'],
    label: 'cárie/dor → Tratamento Cárie',
  },
  {
    patterns: ['consulta geral', 'consulta de avaliacao', 'avaliacao', 'check up', 'checkup', 'consulta'],
    targetMatchers: ['consulta', 'geral', 'avalia'],
    label: 'consulta/avaliação → Consulta Geral',
  },
];

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

export async function loadMenuServices(empresaId: string): Promise<SchedulingService[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('scheduling_services')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('show_in_chat_menu', true)
    .eq('status', 'active')
    .eq('bookable', true)
    .order('priority', { ascending: true })
    .limit(8);

  if (error || !data) return [];
  return data as SchedulingService[];
}

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeCommonNameStopwords(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => !['de', 'da', 'do', 'das', 'dos', 'e'].includes(word))
    .join(' ');
}

function compactText(text: string): string {
  return removeCommonNameStopwords(text).replace(/\s+/g, '');
}

function tryDirectServiceNameMatch(message: string, services: SchedulingService[]): ServiceResolveResult | null {
  const input = normalizeText(message);
  if (!input) return null;

  const inputCompact = compactText(input);

  for (const service of services) {
    const name = normalizeText(service.name);
    const nameCompact = compactText(name);

    // Priority 1: exact/normalized active service-name mention. This must
    // run before synonyms so a configured service named "Higiene Oral" beats
    // the synonym "higiene oral" -> "Destartarizacao".
    if (input === name || input.includes(name) || inputCompact.includes(nameCompact)) {
      return {
        service_id: service.id,
        service_name: service.name,
        confidence: 1,
        method: 'deterministic',
      };
    }
  }

  for (const service of services) {
    const name = normalizeText(service.name);
    const nameCompact = compactText(name);

    // Priority 2: strong partial service-name match. Keep this conservative:
    // short fragments should not beat explicit unknown-service handling.
    if (
      input.length >= 4 &&
      name.includes(input) &&
      input.length / Math.max(name.length, 1) >= 0.45
    ) {
      return {
        service_id: service.id,
        service_name: service.name,
        confidence: 0.92,
        method: 'deterministic',
      };
    }

    if (
      inputCompact.length >= 6 &&
      nameCompact.includes(inputCompact) &&
      inputCompact.length / Math.max(nameCompact.length, 1) >= 0.5
    ) {
      return {
        service_id: service.id,
        service_name: service.name,
        confidence: 0.92,
        method: 'deterministic',
      };
    }
  }

  return null;
}

function trySynonymMatch(message: string, services: SchedulingService[]): ServiceResolveResult | null {
  const input = normalizeText(message);
  if (!input) return null;

  for (const group of SERVICE_SYNONYMS) {
    const patternHit = group.patterns.some((p) => input.includes(normalizeText(p)));
    if (!patternHit) continue;

    const target = services.find((s) => {
      const name = normalizeText(s.name);
      return group.targetMatchers.some((m) => name.includes(m));
    });
    if (target) {
      return {
        service_id: target.id,
        service_name: target.name,
        confidence: 0.95,
        method: 'synonym',
      };
    }
  }
  return null;
}

function tryDeterministic(message: string, services: SchedulingService[]): ServiceResolveResult | null {
  const input = normalizeText(message);
  const normalize = normalizeText;
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

async function getFallbackService(
  empresaId: string,
  services: SchedulingService[]
): Promise<ServiceResolveResult | null> {
  const db = getServiceClient();
  const { data: bookingConfig, error: configError } = await db
    .from('booking_configuration')
    .select('fallback_service_id')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (configError || !bookingConfig?.fallback_service_id) return null;

  let fallbackService = services.find((service) => service.id === bookingConfig.fallback_service_id) ?? null;

  if (!fallbackService) {
    const { data: service, error: serviceError } = await db
      .from('scheduling_services')
      .select('*')
      .eq('id', bookingConfig.fallback_service_id)
      .eq('empresa_id', empresaId)
      .eq('status', 'active')
      .eq('bookable', true)
      .maybeSingle();

    if (serviceError || !service) return null;
    fallbackService = service as SchedulingService;
  }

  return {
    service_id: fallbackService.id,
    service_name: fallbackService.name,
    confidence: 0.5,
    method: 'fallback',
  };
}

async function unresolvedResult(
  empresaId: string,
  services: SchedulingService[],
  confidence: number,
  method: 'deterministic' | 'llm'
): Promise<ServiceResolveResult> {
  const fallback = await getFallbackService(empresaId, services);
  return fallback ?? {
    service_id: null,
    service_name: null,
    confidence,
    method,
  };
}

export async function resolveService(
  message: string,
  empresaId: string,
  services?: SchedulingService[],
  observability?: ServiceResolutionObservability,
  options: ServiceResolveOptions = {},
): Promise<ServiceResolveResult> {
  const explicitServiceSignal = options.explicitServiceSignal === true;
  const available = services ?? await loadServices(empresaId);
  const withLog = (result: ServiceResolveResult): ServiceResolveResult => {
    if (observability?.conversation_id) {
      const loggedMethod = result.method === 'llm' ? 'semantic' : result.method;
      void logAgentEvent(
        'FLOW_SERVICE_RESOLUTION_RESULT',
        {
          conversation_id: observability.conversation_id,
          state: observability.state ?? null,
          current_intent: observability.current_intent ?? null,
          service_id: result.service_id ?? observability.existing_service_id ?? null,
          selected_slot: observability.selected_slot ?? null,
          required_fields_missing: observability.required_fields_missing ?? null,
          decision_action: observability.decision_action ?? null,
          service_name: result.service_name,
          method: loggedMethod,
          confidence: result.confidence,
          resolved_service_id: result.service_id,
          explicit_service_signal: explicitServiceSignal,
        },
        observability.conversation_id,
      );
    }
    return result;
  };

  // Used when the user EXPLICITLY mentioned a service that we cannot map
  // to an active company service. We deliberately skip the configured
  // generic-fallback service in this case so the caller can show the list
  // of active services instead of silently routing to (e.g.) Consulta Geral.
  const explicitUnknown = (): ServiceResolveResult => ({
    service_id: null,
    service_name: null,
    confidence: 0,
    method: 'deterministic',
  });

  if (available.length === 0) {
    return withLog(await unresolvedResult(empresaId, available, 0, 'deterministic'));
  }

  // Service names configured by the company always win before synonyms.
  // Resolution priority:
  // 1. exact/normalized active service-name match
  // 2. strong partial active service-name match
  // 3. existing deterministic keyword/word scoring
  // 4. synonym mapping only if no direct service-name match exists
  // 5. unresolved so caller can list active services

  // Layer 1 — synonym map (deterministic, never invents services).
  // Synonyms are intentionally evaluated after direct and deterministic service matches.
  const directServiceName = tryDirectServiceNameMatch(message, available);
  if (directServiceName) {
    return withLog(directServiceName);
  }

  // Layer 2 — keyword/word scoring.
  const deterministic = tryDeterministic(message, available);
  if (deterministic && deterministic.confidence >= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
    return withLog(deterministic);
  }

  const synonym = trySynonymMatch(message, available);
  if (synonym) {
    return withLog(synonym);
  }

  if (available.length === 1 && !explicitServiceSignal) {
    return withLog({
      service_id: available[0].id,
      service_name: available[0].name,
      confidence: 0.9,
      method: 'deterministic',
    });
  }

  if (deterministic) {
    if (explicitServiceSignal) {
      // Ambiguous explicit ask — don't silently fall back to a generic service.
      return withLog(explicitUnknown());
    }
    return withLog(await unresolvedResult(empresaId, available, deterministic.confidence, 'deterministic'));
  }

  // No deterministic or synonym match.
  if (explicitServiceSignal) {
    // User explicitly named a service we don't offer. Skip LLM (it can
    // hallucinate a low-confidence mapping) and skip fallback. Caller
    // is expected to list active services.
    return withLog(explicitUnknown());
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
      return withLog(await unresolvedResult(empresaId, available, parsedConfidence, 'llm'));
    }

    if (parsed.service_index !== null && parsedConfidence >= AUTO_SELECT_CONFIDENCE_THRESHOLD) {
      const idx = parseInt(parsed.service_index) - 1;
      if (idx >= 0 && idx < available.length) {
        return withLog({
          service_id: available[idx].id,
          service_name: available[idx].name,
          confidence: parsedConfidence,
          method: 'llm',
        });
      }
    }
  } catch {
    // LLM failed
  }

  return withLog(await unresolvedResult(empresaId, available, 0, 'llm'));
}
