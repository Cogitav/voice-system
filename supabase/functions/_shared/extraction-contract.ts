import {
  LLMExtraction,
  ExtractedIntent,
  FieldValidation,
} from './types.ts';
import {
  isValidEmail,
  isValidPhonePT,
  normalizePhone,
  isValidName,
  normalizeName,
  isValidDate,
  isDateInPast,
} from './validators.ts';
import { CONFIDENCE_THRESHOLD } from './constants.ts';

const VALID_INTENTS: ExtractedIntent[] = [
  'BOOKING_NEW',
  'RESCHEDULE',
  'CANCEL',
  'INFO_REQUEST',
  'HUMAN_REQUEST',
  'CONFIRMATION',
  'SLOT_SELECTION',
  'TIME_BASED_SELECTION',
  'DATE_CHANGE',
  'CORRECTION',
  'EXPLICIT_RESTART',
  'OFF_TOPIC',
  'UNCLEAR',
];

export const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. Your ONLY job is to extract information from the user's message and return a JSON object. You do NOT respond to the user. You do NOT generate conversational text. You ONLY return JSON.

EXTRACTION RULES:
1. Extract ONLY what is explicitly present in the message. If a field is not mentioned, return null for that field.
2. NEVER invent, infer, or fabricate data. If unsure, return null.
3. Only extract customer_name when the user explicitly provides their personal name. Prefer full-name structures (for example "Joao Lopes" or "o meu nome e Joao Lopes"). Do NOT classify service, symptom, product, reason, or appointment-purpose text as customer_name.
4. Extract email exactly as written — do NOT validate or correct it.
5. Extract phone digits exactly as written — do NOT validate or reformat.
6. For dates: always copy the original text into date_raw. Only fill date_parsed (ISO format YYYY-MM-DD) if you are highly confident of the exact date. Otherwise leave date_parsed as null.
7. For times: always copy the original text into time_raw. Only fill time_parsed (HH:MM format) if you are highly confident. Otherwise leave time_parsed as null.
8. For service: set service_keywords to relevant words from the message. Set service_id ONLY if the user names a service that exactly matches a known service. Otherwise service_id is null.
9. For comparative time language: set time_operator to "before" for phrases like "antes das 16h", "after" for "depois das 16h", otherwise "exact" when a specific time is provided. Set relative_time_direction to "earlier" for "mais cedo"/"antes" without a specific time, and "later" for "mais tarde"/"depois" without a specific time.
10. ALWAYS return the same JSON structure, even if all fields are null.

INTENT VALUES (choose exactly one):
- BOOKING_NEW: user wants to make a new booking
- RESCHEDULE: user wants to change an existing booking
- CANCEL: user wants to cancel an existing booking
- INFO_REQUEST: user is asking for information
- HUMAN_REQUEST: user explicitly wants to speak to a person
- CONFIRMATION: user is confirming something (yes, correct, confirm)
- SLOT_SELECTION: user is selecting a time slot from a presented list
- TIME_BASED_SELECTION: user is selecting or correcting a slot by providing a specific time
- DATE_CHANGE: user is providing or changing a date
- CORRECTION: user is correcting previously provided data
- EXPLICIT_RESTART: user explicitly wants to start over
- OFF_TOPIC: message is unrelated to booking
- UNCLEAR: intent cannot be determined

EMOTIONAL TONE VALUES (choose one or return null if neutral):
- urgent, frustrated, anxious, friendly

SLOT SELECTION METHOD VALUES:
- by_number: user said "o primeiro", "número 2", "o 3"
- by_time: user said a specific time like "às 14h"
- by_date: user said a specific date
- by_ordinal: user said "o último", "o do meio"
- by_description: user described a slot in another way

CONFIRMATION SIGNAL VALUES (or null if not a confirmation context):
- CONFIRM, DENY, CHANGE_DATE, CHANGE_TIME, CHANGE_SERVICE, CHANGE_DATA, QUESTION

CONFIDENCE: a number from 0.0 to 1.0 representing your overall confidence in the extraction.

RETURN ONLY this JSON structure, with no explanation, no markdown, no code fences:
{
  "customer_name": string | null,
  "customer_email": string | null,
  "customer_phone": string | null,
  "service_keywords": string[] | null,
  "service_id": string | null,
  "date_raw": string | null,
  "time_raw": string | null,
  "date_parsed": string | null,
  "time_parsed": string | null,
  "time_operator": "exact" | "before" | "after" | null,
  "relative_time_direction": "earlier" | "later" | null,
  "intent": string,
  "emotional_context": { "tone": string, "keywords": string[], "detected_by": "llm" } | null,
  "slot_selection": { "method": string, "value": string } | null,
  "confirmation": string | null,
  "confidence": number,
  "raw_message": string
}`;

export function parseExtractionResponse(raw: string): LLMExtraction {
  const safeDefault: LLMExtraction = {
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    service_keywords: null,
    service_id: null,
    date_raw: null,
    time_raw: null,
    date_parsed: null,
    time_parsed: null,
    time_operator: null,
    relative_time_direction: null,
    intent: 'UNCLEAR',
    emotional_context: null,
    slot_selection: null,
    confirmation: null,
    confidence: 0,
    raw_message: '',
  };

  let parsed: Record<string, unknown>;
  try {
    // Strip markdown code fences if the LLM wrapped the response
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return safeDefault;
  }

  const intent = typeof parsed.intent === 'string' && VALID_INTENTS.includes(parsed.intent as ExtractedIntent)
    ? (parsed.intent as ExtractedIntent)
    : 'UNCLEAR';

  const confidence = typeof parsed.confidence === 'number'
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0;

  const raw_message = typeof parsed.raw_message === 'string'
    ? parsed.raw_message
    : '';

  return {
    customer_name: typeof parsed.customer_name === 'string' ? parsed.customer_name : null,
    customer_email: typeof parsed.customer_email === 'string' ? parsed.customer_email : null,
    customer_phone: typeof parsed.customer_phone === 'string' ? parsed.customer_phone : null,
    service_keywords: Array.isArray(parsed.service_keywords) ? parsed.service_keywords as string[] : null,
    service_id: typeof parsed.service_id === 'string' ? parsed.service_id : null,
    date_raw: typeof parsed.date_raw === 'string' ? parsed.date_raw : null,
    time_raw: typeof parsed.time_raw === 'string' ? parsed.time_raw : null,
    date_parsed: typeof parsed.date_parsed === 'string' ? parsed.date_parsed : null,
    time_parsed: typeof parsed.time_parsed === 'string' ? parsed.time_parsed : null,
    time_operator: parsed.time_operator === 'exact' || parsed.time_operator === 'before' || parsed.time_operator === 'after'
      ? parsed.time_operator
      : null,
    relative_time_direction: parsed.relative_time_direction === 'earlier' || parsed.relative_time_direction === 'later'
      ? parsed.relative_time_direction
      : null,
    intent,
    emotional_context: parsed.emotional_context != null && typeof parsed.emotional_context === 'object'
      ? parsed.emotional_context as LLMExtraction['emotional_context']
      : null,
    slot_selection: parsed.slot_selection != null && typeof parsed.slot_selection === 'object'
      ? parsed.slot_selection as LLMExtraction['slot_selection']
      : null,
    confirmation: typeof parsed.confirmation === 'string'
      ? parsed.confirmation as LLMExtraction['confirmation']
      : null,
    confidence,
    raw_message,
  };
}

export function validateExtraction(extraction: LLMExtraction): FieldValidation[] {
  const results: FieldValidation[] = [];

  // customer_name
  if (extraction.customer_name === null) {
    results.push({ field: 'customer_name', status: 'not_provided', raw_value: null, error_reason: null });
  } else if (!isValidName(extraction.customer_name)) {
    results.push({ field: 'customer_name', status: 'invalid', raw_value: extraction.customer_name, error_reason: 'Name must contain at least one letter' });
  } else {
    results.push({ field: 'customer_name', status: 'valid', raw_value: extraction.customer_name, error_reason: null });
  }

  // customer_email
  if (extraction.customer_email === null) {
    results.push({ field: 'customer_email', status: 'not_provided', raw_value: null, error_reason: null });
  } else if (!isValidEmail(extraction.customer_email)) {
    results.push({ field: 'customer_email', status: 'invalid', raw_value: extraction.customer_email, error_reason: 'Invalid email address or unrecognised domain' });
  } else {
    results.push({ field: 'customer_email', status: 'valid', raw_value: extraction.customer_email, error_reason: null });
  }

  // customer_phone
  if (extraction.customer_phone === null) {
    results.push({ field: 'customer_phone', status: 'not_provided', raw_value: null, error_reason: null });
  } else if (!isValidPhonePT(extraction.customer_phone)) {
    results.push({ field: 'customer_phone', status: 'invalid', raw_value: extraction.customer_phone, error_reason: 'Phone must be 9 digits starting with 2, 3, or 9 (PT)' });
  } else {
    results.push({ field: 'customer_phone', status: 'valid', raw_value: extraction.customer_phone, error_reason: null });
  }

  // date_parsed
  if (extraction.date_parsed === null) {
    results.push({ field: 'date_parsed', status: 'not_provided', raw_value: extraction.date_raw, error_reason: null });
  } else if (!isValidDate(extraction.date_parsed)) {
    results.push({ field: 'date_parsed', status: 'invalid', raw_value: extraction.date_parsed, error_reason: 'Date is not a valid ISO date' });
  } else if (isDateInPast(extraction.date_parsed)) {
    results.push({ field: 'date_parsed', status: 'invalid', raw_value: extraction.date_parsed, error_reason: 'Date is in the past' });
  } else {
    results.push({ field: 'date_parsed', status: 'valid', raw_value: extraction.date_parsed, error_reason: null });
  }

  return results;
}

export function isBelowConfidenceThreshold(extraction: LLMExtraction): boolean {
  return extraction.confidence < CONFIDENCE_THRESHOLD;
}

export function normalizeExtraction(extraction: LLMExtraction): LLMExtraction {
  const normalized = { ...extraction };

  if (normalized.customer_name !== null && isValidName(normalized.customer_name)) {
    normalized.customer_name = normalizeName(normalized.customer_name);
  }

  if (normalized.customer_phone !== null && isValidPhonePT(normalized.customer_phone)) {
    normalized.customer_phone = normalizePhone(normalized.customer_phone);
  }

  return normalized;
}
