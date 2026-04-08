/**
 * Structured Field Extractor v2.0
 *
 * Uses LLM (via tool calling, temperature 0) to extract structured booking fields
 * from user messages. The LLM acts ONLY as an extractor — never as a decision engine.
 *
 * v2.0 Changes:
 * - `reason` extraction is now UNIVERSAL and CONTEXT-AWARE
 * - Receives company services list for grounded extraction
 * - Hardened deterministic validation for reason field
 * - Sector-agnostic: works for clinics, legal offices, gyms, barbershops, etc.
 *
 * After extraction, all values are validated deterministically in backend code.
 * Only valid, non-null values are returned for merging into conversation_context.
 */

// deno-lint-ignore no-explicit-any
type Context = Record<string, any>;

/** Company service summary for grounded extraction */
export interface CompanyServiceSummary {
  name: string;
  description?: string | null;
}

/** Fields the LLM can extract */
interface ExtractedFields {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  reason: string | null;
  preferred_date: string | null;
}

/** Tool definition for structured extraction */
const EXTRACTION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'extract_booking_fields',
    description: 'Extract structured booking fields from the user message. Return null for any field not clearly present. Never guess or fabricate values.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: {
          type: ['string', 'null'],
          description: 'Full name of the customer if explicitly stated. null if not found.',
        },
        customer_email: {
          type: ['string', 'null'],
          description: 'Email address if present. null if not found.',
        },
        customer_phone: {
          type: ['string', 'null'],
          description: 'Phone number if present (digits only, no spaces). null if not found.',
        },
        reason: {
          type: ['string', 'null'],
          description: `Extract ONLY the short subject/motive of the appointment (max 15 words).
Rules:
- Return the subject of what the user wants to schedule, in plain text.
- Remove greetings, personal data (name, email, phone), and booking phrases (schedule, book, agendar, marcar, reservar, etc.).
- Do NOT invent services not present in the company services list.
- Do NOT return a service name unless it clearly matches the user intent.
- If the user describes symptoms or needs, extract that as the reason (e.g. "tooth pain", "back pain", "haircut", "tax consultation").
- If no clear subject exists beyond generic booking intent, return null.
- Return null if the message only contains booking/scheduling phrases without a specific subject.`,
        },
        preferred_date: {
          type: ['string', 'null'],
          description: 'Date and/or time preference in ISO 8601 format (e.g. 2026-02-21T10:00:00). If only date given, omit time part. null if not found.',
        },
      },
      required: ['customer_name', 'customer_email', 'customer_phone', 'reason', 'preferred_date'],
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
 * Call the LLM to extract structured fields from a user message.
 * Uses tool calling with temperature 0 for deterministic output.
 * Returns only fields that pass backend validation.
 *
 * @param companyServices - List of active company services for grounded reason extraction
 */
export async function extractStructuredFieldsViaLLM(
  message: string,
  existingContext: Context,
  aiModel: string,
  companyServices?: CompanyServiceSummary[],
): Promise<Partial<Context>> {
  // Skip extraction for very short messages (confirmations, greetings)
  if (message.trim().length < 4) {
    console.log('[StructuredExtractor] Message too short, skipping LLM extraction');
    return {};
  }

  // Build list of fields we still need
  const neededFields: string[] = [];
  if (!existingContext.customer_name) neededFields.push('customer_name');
  if (!existingContext.customer_email) neededFields.push('customer_email');
  if (!existingContext.customer_phone) neededFields.push('customer_phone');
  if (!existingContext.reason) neededFields.push('reason');
  if (!existingContext.preferred_date && !existingContext.selected_datetime) neededFields.push('preferred_date');

  if (neededFields.length === 0) {
    console.log('[StructuredExtractor] All fields already present, skipping');
    return {};
  }

  console.log(`[StructuredExtractor] Extracting fields: [${neededFields.join(', ')}]`);

  // Build services context for grounded reason extraction
  let servicesSection = '';
  if (companyServices && companyServices.length > 0) {
    const servicesList = companyServices
      .map(s => s.description ? `- ${s.name}: ${s.description}` : `- ${s.name}`)
      .join('\n');
    servicesSection = `\n\nCompany services available:\n${servicesList}\n\nFor the "reason" field: extract the subject of the appointment based on what the user describes. You may reference the services list for context, but do NOT copy service names verbatim unless the user clearly refers to one. Extract the user's own description of their need.`;
  } else {
    servicesSection = '\n\nFor the "reason" field: extract only the short subject of the appointment from the user\'s message. Do NOT invent services.';
  }

  const systemPrompt = `You are a data extraction engine. Extract structured booking data from the user message.
Rules:
- Return ONLY data explicitly present in the message.
- If a field is not clearly stated, return null.
- Never guess, infer, or fabricate values.
- For dates: convert to ISO 8601 format. Use Europe/Lisbon timezone.
- For phone numbers: return digits only (no spaces, no +351 prefix).
- For names: extract full name as written.
- For emails: extract exact email address.
- For reason: extract ONLY the short subject of the appointment (max 15 words). Remove greetings, personal data, and booking phrases. Return plain text only. Return null if no clear subject exists.
${servicesSection}

Currently missing fields: ${neededFields.join(', ')}
Already collected context: ${JSON.stringify(
    Object.fromEntries(
      Object.entries(existingContext).filter(([k]) => 
        ['customer_name', 'customer_email', 'customer_phone', 'reason', 'booking_intent', 'preferred_date', 'selected_datetime'].includes(k)
      )
    )
  )}`;

  const providerConfig = resolveLLMProviderConfig();
  if (!providerConfig) {
    console.error('[StructuredExtractor] No LLM provider configured');
    return {};
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
          { role: 'user', content: message },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_booking_fields' } },
      }),
    });

    // === AI Fallback for extractor ===
    if (!response.ok && [503, 429, 408].includes(response.status)) {
      console.warn(`[StructuredExtractor] Primary model failed (${response.status}), retrying with fallback`);
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
              { role: 'user', content: message },
            ],
            tools: [EXTRACTION_TOOL],
            tool_choice: { type: 'function', function: { name: 'extract_booking_fields' } },
          }),
        });
        if (response.ok) {
          console.log('[StructuredExtractor] Fallback model succeeded');
        }
      }
    }

    if (!response.ok) {
      console.error(`[StructuredExtractor] LLM call failed: ${response.status}`);
      return {};
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== 'extract_booking_fields') {
      console.log('[StructuredExtractor] No tool call in LLM response');
      return {};
    }

    let rawFields: ExtractedFields;
    try {
      rawFields = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error('[StructuredExtractor] Failed to parse LLM tool arguments');
      return {};
    }

    // === BACKEND VALIDATION (MANDATORY) ===
    return validateExtractedFields(rawFields, existingContext);
  } catch (err) {
    console.error('[StructuredExtractor] Error:', err);
    return {};
  }
}

/**
 * Deterministic backend validation of LLM-extracted fields.
 * Validates format, trims whitespace, and ignores null values.
 * Never overwrites existing context values.
 */
function validateExtractedFields(
  raw: ExtractedFields,
  existingContext: Context,
): Partial<Context> {
  const validated: Partial<Context> = {};

  // === customer_name ===
  if (raw.customer_name && !existingContext.customer_name) {
    const trimmed = raw.customer_name.trim();
    if (trimmed.length >= 2 && !/\d/.test(trimmed) && !/@/.test(trimmed)) {
      validated.customer_name = trimmed;
    }
  }

  // === customer_email ===
  if (raw.customer_email && !existingContext.customer_email) {
    const trimmed = raw.customer_email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (emailRegex.test(trimmed)) {
      validated.customer_email = trimmed;
    }
  }

  // === customer_phone ===
  if (raw.customer_phone && !existingContext.customer_phone) {
    const digitsOnly = raw.customer_phone.replace(/\D/g, '');
    if (digitsOnly.length === 9 && /^[923]/.test(digitsOnly)) {
      validated.customer_phone = digitsOnly;
    }
  }

  // === reason (UNIVERSAL, SECTOR-AGNOSTIC validation) ===
  if (raw.reason && !existingContext.reason) {
    const trimmed = raw.reason.trim();

    const rejectionResult = validateReason(trimmed);
    if (rejectionResult === null) {
      validated.reason = trimmed;
    } else {
      console.log(`[StructuredExtractor] Rejected reason: "${trimmed}" — ${rejectionResult}`);
    }
  }

  // === preferred_date ===
  if (raw.preferred_date && !existingContext.preferred_date && !existingContext.selected_datetime) {
    const trimmed = raw.preferred_date.trim();
    // Validate ISO 8601 format (date only or datetime)
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
    if (isoDateRegex.test(trimmed)) {
      const dateObj = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`);
      if (!isNaN(dateObj.getTime())) {
        validated.preferred_date = trimmed;
        console.log(`[DateExtractor] Updating preferred_date: ${trimmed}`);
      }
    }
  }

  const validKeys = Object.keys(validated);
  if (validKeys.length > 0) {
    console.log(`[StructuredExtractor] Valid fields merged: {${validKeys.join(', ')}}`);
  } else {
    console.log('[StructuredExtractor] No valid fields extracted from LLM response');
  }

  return validated;
}

/**
 * Deterministic reason validation.
 * Returns null if reason is valid, or a rejection reason string if invalid.
 */
function validateReason(reason: string): string | null {
  // 1. Contains "@" (likely email)
  if (reason.includes('@')) {
    return 'contains email character';
  }

  // 2. Contains 9+ consecutive digits (likely phone number)
  if (/\d{9,}/.test(reason.replace(/\s/g, ''))) {
    return 'contains phone-like digits';
  }

  // 3. Too long (>200 chars)
  if (reason.length > 200) {
    return 'exceeds 200 character limit';
  }

  // 4. Too short
  if (reason.length < 2) {
    return 'too short';
  }

  // 5. Normalize for keyword checks
  const normalized = reason
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // 6. Is ONLY a generic standalone word (sector-agnostic)
  const genericStandaloneWords = new Set([
    'consulta', 'reuniao', 'appointment', 'meeting',
    'sessao', 'session', 'visita', 'visit',
    'marcacao', 'agendamento', 'booking', 'reservation',
  ]);

  if (genericStandaloneWords.has(normalized)) {
    return 'generic standalone word';
  }

  // 7. Is ONLY a booking phrase (no meaningful subject)
  const bookingPhrases = [
    'agendar', 'marcar', 'reservar', 'book', 'schedule',
    'marcacao', 'booking', 'agendamento', 'reservation',
    'quero', 'gostaria', 'preciso', 'i want', 'i need',
  ];

  const fillerWords = new Set([
    'uma', 'um', 'de', 'para', 'a', 'an', 'the', 'to', 'of',
    'quero', 'gostaria', 'preciso', 'i', 'want', 'need',
    'por', 'favor', 'please',
  ]);

  const words = normalized.split(/\s+/);
  const isBookingOnly = words.every(w =>
    bookingPhrases.some(bp => w.includes(bp)) ||
    fillerWords.has(w) ||
    genericStandaloneWords.has(w)
  );

  if (isBookingOnly) {
    return 'booking-only phrase';
  }

  // All checks passed
  return null;
}
