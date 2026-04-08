/**
 * Semantic Service Resolver v1.0
 *
 * LLM-based fallback for service resolution when deterministic matching fails.
 * Uses tool calling with temperature 0 for strict, deterministic selection.
 *
 * This resolver NEVER invents services — it only selects from the provided list.
 * It is triggered ONLY when the deterministic resolver (v2) cannot find a clear winner.
 */

export interface ServiceCandidate {
  id: string;
  name: string;
  description?: string | null;
}

interface SemanticResolveResult {
  service_id: string | null;
}

const SEMANTIC_RESOLVER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'select_service',
    description: 'Select the most semantically appropriate service based on the user reason. You MUST choose only from the provided services. If none clearly matches, return null. Never invent services.',
    parameters: {
      type: 'object',
      properties: {
        service_id: {
          type: ['string', 'null'],
          description: 'The UUID of the selected service, or null if no service clearly matches.',
        },
      },
      required: ['service_id'],
      additionalProperties: false,
    },
  },
};

interface LLMProviderConfig {
  endpoint: string;
  headers: Record<string, string>;
}

function resolveLLMProviderConfig(): LLMProviderConfig | null {
  const provider = Deno.env.get('LLM_PROVIDER')?.toLowerCase();

  if (provider === 'openai') {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[LLM] OPENAI_API_KEY is not set');
      return null;
    }
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'gemini') {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
      console.error('[LLM] GOOGLE_API_KEY is not set');
      return null;
    }
    return {
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const fallbackKey = Deno.env.get('LOVABLE_API_KEY');
  if (fallbackKey) {
    return {
      endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${fallbackKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  console.error('[LLM] LLM_PROVIDER is not configured and no LOVABLE_API_KEY fallback is available');
  return null;
}

/**
 * Resolve a service using LLM semantic matching.
 * Returns the service_id if a valid match is found, null otherwise.
 */
export async function resolveServiceSemantically(
  reason: string,
  services: ServiceCandidate[],
  aiModel: string,
): Promise<string | null> {
  if (!reason || services.length === 0) {
    console.log('[ServiceResolver v3] Semantic skip: no reason or no services');
    return null;
  }

  const servicesList = services
    .map(s => `- id: "${s.id}" | name: "${s.name}"${s.description ? ` | description: "${s.description}"` : ''}`)
    .join('\n');

  // Build valid IDs set for confidence guard
  const validIds = new Set(services.map(s => s.id));

  const systemPrompt = `You are a semantic intent-to-service resolver.

Your task:
- Select the most semantically appropriate service based on the user's reason.
- You MUST choose only from the provided services listed below.
- If none clearly matches, return null.
- Never invent services.
- Do not explain.
- Return structured output only.

Available services:
${servicesList}`;

  console.log(`[ServiceResolver v3] Semantic resolver triggered for reason: "${reason}"`);

  const providerConfig = resolveLLMProviderConfig();
  if (!providerConfig) {
    console.error('[ServiceResolver v3] No LLM provider configured');
    return null;
  }

  try {
    let response = await fetch(providerConfig.endpoint, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify({
        model: aiModel,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User reason: "${reason}"` },
        ],
        tools: [SEMANTIC_RESOLVER_TOOL],
        tool_choice: { type: 'function', function: { name: 'select_service' } },
      }),
    });

    // AI Fallback
    if (!response.ok && [503, 429, 408].includes(response.status)) {
      console.warn(`[ServiceResolver v3] Primary model failed (${response.status}), trying fallback`);
      const fallbackKey = Deno.env.get('LOVABLE_API_KEY');
      if (fallbackKey) {
        response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fallbackKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            temperature: 0,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `User reason: "${reason}"` },
            ],
            tools: [SEMANTIC_RESOLVER_TOOL],
            tool_choice: { type: 'function', function: { name: 'select_service' } },
          }),
        });
        if (response.ok) {
          console.log('[ServiceResolver v3] Fallback model succeeded');
        }
      }
    }

    if (!response.ok) {
      console.error(`[ServiceResolver v3] LLM call failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== 'select_service') {
      console.log('[ServiceResolver v3] No tool call in LLM response');
      return null;
    }

    let result: SemanticResolveResult;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error('[ServiceResolver v3] Failed to parse LLM tool arguments');
      return null;
    }

    // === CONFIDENCE GUARD: Validate service_id belongs to provided list ===
    if (result.service_id && validIds.has(result.service_id)) {
      const matchedName = services.find(s => s.id === result.service_id)?.name;
      console.log(`[ServiceResolver v3] Semantic selected: ${result.service_id} ("${matchedName}")`);
      return result.service_id;
    }

    if (result.service_id) {
      console.warn(`[ServiceResolver v3] LLM returned invalid service_id: ${result.service_id} — rejecting`);
    } else {
      console.log('[ServiceResolver v3] Semantic resolver returned null — no clear match');
    }

    return null;
  } catch (err) {
    console.error('[ServiceResolver v3] Error:', err);
    return null;
  }
}
