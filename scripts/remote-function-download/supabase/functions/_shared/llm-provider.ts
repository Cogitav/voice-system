import { getServiceClient } from './supabase-client.ts';
import { LLMRequest, LLMResponse } from './types.ts';
import {
  SUPPORTED_LLM_PROVIDERS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  FALLBACK_LLM_PROVIDER,
  FALLBACK_LLM_MODEL,
  TIMEOUTS,
  LIMITS,
} from './constants.ts';

interface EmpresaLLMConfig {
  provider: string;
  model: string;
  api_key: string;
}

async function getEmpresaLLMConfig(empresaId: string): Promise<EmpresaLLMConfig> {
  const db = getServiceClient();

  const { data: empresa } = await db
    .from('empresas')
    .select('chat_ai_provider, chat_ai_model')
    .eq('id', empresaId)
    .single();

  const provider = empresa?.chat_ai_provider ?? DEFAULT_LLM_PROVIDER;
  const model = empresa?.chat_ai_model ?? DEFAULT_LLM_MODEL;

  const { data: providerData } = await db
    .from('ai_providers')
    .select('api_key')
    .eq('provider_key', provider)
    .eq('is_enabled', true)
    .single();

  if (!providerData?.api_key) {
    // Fallback to default provider
    const { data: fallbackData } = await db
      .from('ai_providers')
      .select('api_key')
      .eq('provider_key', FALLBACK_LLM_PROVIDER)
      .eq('is_enabled', true)
      .single();

    return {
      provider: FALLBACK_LLM_PROVIDER,
      model: FALLBACK_LLM_MODEL,
      api_key: fallbackData?.api_key ?? '',
    };
  }

  return { provider, model, api_key: providerData.api_key };
}

async function callOpenAI(request: LLMRequest, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.system_prompt },
        { role: 'user', content: request.user_message },
      ],
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 1000,
      response_format: request.response_format === 'json' ? { type: 'json_object' } : undefined,
    }),
    signal: AbortSignal.timeout(TIMEOUTS.llm_request_ms),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(request: LLMRequest, model: string, apiKey: string): Promise<string> {
  const modelName = model.includes('gemini') ? model : 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${request.system_prompt}\n\n${request.user_message}` }] },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.3,
        maxOutputTokens: request.max_tokens ?? 1000,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUTS.llm_request_ms),
  });

  if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(request: LLMRequest, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.includes('claude') ? model : 'claude-haiku-4-5-20251001',
      max_tokens: request.max_tokens ?? 1000,
      system: request.system_prompt,
      messages: [{ role: 'user', content: request.user_message }],
      temperature: request.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(TIMEOUTS.llm_request_ms),
  });

  if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

async function callProvider(
  provider: string,
  model: string,
  apiKey: string,
  request: LLMRequest
): Promise<string> {
  switch (provider) {
    case 'openai': return callOpenAI(request, model, apiKey);
    case 'gemini': return callGemini(request, model, apiKey);
    case 'anthropic': return callAnthropic(request, model, apiKey);
    default: throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function callLLM(
  request: LLMRequest,
  empresaId: string
): Promise<LLMResponse> {
  const start = Date.now();
  const config = await getEmpresaLLMConfig(empresaId);

  // Primary attempt
  try {
    const content = await callProvider(config.provider, config.model, config.api_key, request);
    return {
      content,
      provider: config.provider,
      model: config.model,
      tokens_used: 0,
      latency_ms: Date.now() - start,
    };
  } catch (primaryError) {
    console.error(`[LLM_PRIMARY_FAILED] ${config.provider}:`, primaryError);
  }

  // Fallback attempt (only if different from primary)
  if (config.provider !== FALLBACK_LLM_PROVIDER) {
    try {
      const db = getServiceClient();
      const { data: fallbackData } = await db
        .from('ai_providers')
        .select('api_key')
        .eq('provider_key', FALLBACK_LLM_PROVIDER)
        .eq('is_enabled', true)
        .single();

      if (fallbackData?.api_key) {
        const content = await callProvider(
          FALLBACK_LLM_PROVIDER,
          FALLBACK_LLM_MODEL,
          fallbackData.api_key,
          request
        );
        return {
          content,
          provider: FALLBACK_LLM_PROVIDER,
          model: FALLBACK_LLM_MODEL,
          tokens_used: 0,
          latency_ms: Date.now() - start,
        };
      }
    } catch (fallbackError) {
      console.error('[LLM_FALLBACK_FAILED]:', fallbackError);
    }
  }

  // Both failed
  throw new Error('LLM_UNAVAILABLE: All providers failed');
}

export async function callLLMSimple(
  systemPrompt: string,
  userMessage: string,
  empresaId: string,
  responseFormat: 'text' | 'json' = 'text'
): Promise<string> {
  const result = await callLLM({
    system_prompt: systemPrompt,
    user_message: userMessage,
    response_format: responseFormat,
    temperature: 0.3,
    max_tokens: 1000,
  }, empresaId);
  return result.content;
}
