/**
 * Deterministic Field Extractor v1.0
 *
 * Runs BEFORE state machine and LLM.
 * Parses structured fields from raw user messages.
 * Never relies on LLM extraction.
 * Never overwrites valid existing values.
 */

import { toLisbonParts } from './timezone-utils.ts';

// deno-lint-ignore no-explicit-any
type Context = Record<string, any>;

/**
 * Extract deterministic fields from a user message.
 * Only returns fields that are NEW (not already in existingContext).
 */
export function extractDeterministicFields(
  message: string,
  existingContext: Context,
): Partial<Context> {
  const extracted: Context = {};

  // === EMAIL ===
  if (!existingContext.customer_email) {
    const emailMatch = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      const candidateEmail = emailMatch[0].toLowerCase();
      // Basic validation: must have @ and valid domain structure
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
        extracted.customer_email = candidateEmail;
      } else {
        console.warn(`[FieldExtractor] Invalid email rejected: "${candidateEmail}"`);
      }
    }
  }

  // === PHONE (Portugal) ===
  if (!existingContext.customer_phone) {
    // Remove spaces for matching, but keep original for context
    const cleaned = message.replace(/\s+/g, ' ');
    // Match Portuguese phone: optional +351, then 9/2/3 start, 9 digits total
    const phonePatterns = [
      /(?:\+351\s?)?(9[1236]\d\s?\d{3}\s?\d{3})/,
      /(?:\+351\s?)?(2\d\s?\d{3}\s?\d{3}\s?\d)/,
      /(?:\+351\s?)?(3\d\s?\d{3}\s?\d{3}\s?\d)/,
      /\b(9[1236]\d{7})\b/,
      /\b(2\d{8})\b/,
      /\b(3\d{8})\b/,
    ];
    for (const pattern of phonePatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        // Normalize to digits only
        const digits = match[1].replace(/\s/g, '');
        if (digits.length === 9 && /^[923]/.test(digits)) {
          extracted.customer_phone = digits;
          break;
        }
      }
    }
  }

  // === DATE / TIME ===
  // Allow date re-extraction even if selected_datetime exists — the caller (SmartSlotReset)
  // handles clearing stale slot context when a new date is detected.
  // Only skip if booking_finalized to prevent post-booking date mutations.
  if (!existingContext.booking_finalized) {
    const dateParsed = extractDateFromMessage(message, existingContext.preferred_date as string | undefined);
    if (dateParsed) {
      // Only update if it's actually different from existing preferred_date
      const existingDate = existingContext.preferred_date as string | undefined;
      if (!existingDate || dateParsed !== existingDate) {
        extracted.preferred_date = dateParsed;
        console.log(`[DateExtractor] Updating preferred_date: ${dateParsed} (previous: ${existingDate || 'none'})`);
      } else {
        console.log(`[DateExtractor] Same date as existing — skipping update: ${dateParsed}`);
      }
    }
    // IMPORTANT: If no date is detected, do NOT set preferred_date at all.
    // The field must remain absent from the extracted object to avoid clearing existing values.
  }

  // === BOOKING INTENT (macro intent: schedule, cancel, info, etc.) ===
  if (!existingContext.booking_intent) {
    const lowerMsg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const bookingIntentPatterns = [
      /(?:quero|gostaria de|preciso de)?\s*(?:agendar|marcar|reservar|book|schedule)/,
      /(?:marcar|agendar)\s*(?:uma\s*)?(?:consulta|reuniao|appointment)/,
      /(?:cancelar|desmarcar|cancel)\s*(?:a?\s*)?(?:consulta|reuniao|appointment|agendamento)/,
      /(?:reagendar|remarcar|reschedule)/,
    ];
    const matchedIntent = bookingIntentPatterns.some(p => p.test(lowerMsg));
    if (matchedIntent) {
      if (/(?:cancelar|desmarcar|cancel)/.test(lowerMsg)) {
        extracted.booking_intent = 'cancel';
      } else if (/(?:reagendar|remarcar|reschedule)/.test(lowerMsg)) {
        extracted.booking_intent = 'reschedule';
      } else {
        extracted.booking_intent = 'schedule';
      }
      console.log('[IntentExtractor] Booking intent detected:', extracted.booking_intent);
    }
  }

  // === REASON: Removed from deterministic extractor (v2.0) ===
  // Reason extraction is now handled exclusively by the LLM structured extractor
  // with company services context for universal, sector-agnostic extraction.
  // See structured-field-extractor.ts

  // === NAME ===
  if (!existingContext.customer_name) {
    let foundName: string | null = null;

    // Pattern 1: Explicit phrases ("meu nome é X", "chamo-me X", etc.)
    const explicitPatterns = [
      /(?:meu nome [eé]|chamo[- ]me|sou o|sou a|my name is|me chamo)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]*)/i,
    ];
    for (const pattern of explicitPatterns) {
      const match = message.match(pattern);
      if (match) {
        foundName = match[1].trim();
        break;
      }
    }

    // Pattern 2: Name before email context ("Joao Francisco e o email ...", "Joao Francisco, email ...")
    if (!foundName) {
      const beforeEmailMatch = message.match(
        /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,}?)\s+(?:e\s+o\s+email|,?\s*email\s|[a-zA-Z0-9._%+\-]+@)/i
      );
      if (beforeEmailMatch) {
        foundName = beforeEmailMatch[1].trim();
      }
    }

    // Pattern 3: Fallback — message starts with 2+ capitalized words, no digits, no @
    if (!foundName) {
      const fallbackMatch = message.match(/^([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'-]+)+)/);
      if (fallbackMatch) {
        const candidate = fallbackMatch[1].trim();
        if (!/\d/.test(candidate) && !/@/.test(candidate)) {
          foundName = candidate;
        }
      }
    }

    // === NameExtractor v2: Normalization Pipeline ===
    if (foundName) {
      foundName = normalizeExtractedName(foundName);
    }

    // Validate final candidate
    if (foundName && foundName.length >= 2 && !/\d/.test(foundName) && !/@/.test(foundName)) {
      // Step 5: Do not overwrite valid short name with longer string
      if (existingContext.customer_name) {
        const existing = (existingContext.customer_name as string).trim();
        if (existing.length >= 2 && foundName.length > existing.length) {
          console.log(`[NameExtractor] Skipping — existing name "${existing}" is shorter/valid, not overwriting with "${foundName}"`);
        } else {
          extracted.customer_name = foundName;
          console.log('[NameExtractor] Updated:', extracted.customer_name);
        }
      } else {
        extracted.customer_name = foundName;
        console.log('[NameExtractor] Extracted:', extracted.customer_name);
      }
    }
  }

  if (Object.keys(extracted).length > 0) {
    console.log(`[DeterministicExtractor] Extracted: ${Object.keys(extracted).join(', ')}`);
  }

  return extracted;
}

/**
 * NameExtractor v2 — Normalization Pipeline
 * Cleans extracted name by cutting at linguistic connectors,
 * enforcing word/char limits, and rejecting verb continuations.
 */
function normalizeExtractedName(raw: string): string | null {
  let name = raw.trim();

  // Step 1: Cut at linguistic connectors (Portuguese + common patterns)
  const connectors = [
    / e /i, /,/, /;/,
    / que /i, / procuro /i, / preciso /i, / gostaria /i,
    / para /i, / porque /i, / email /i,
    / contacto /i, / contato /i, / é /i,
  ];
  for (const connector of connectors) {
    const idx = name.search(connector);
    if (idx > 0) {
      name = name.substring(0, idx).trim();
      console.log(`[NameExtractor v2] Truncated at connector: "${name}"`);
      break;
    }
  }

  // Step 2: Word limit (max 3 words)
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    name = words.slice(0, 3).join(' ');
    console.log(`[NameExtractor v2] Word limit applied: "${name}"`);
  }

  // Step 3: Character limit (max 40)
  if (name.length > 40) {
    name = name.substring(0, 40).trim();
  }

  // Step 4: Final validation
  if (name.length < 2) return null;
  if (/\d/.test(name)) return null;
  if (/@/.test(name)) return null;

  // Reject verb continuations: words ending in "ar", "er", "ir" after second word
  const finalWords = name.split(/\s+/);
  if (finalWords.length >= 3) {
    const lastWord = finalWords[finalWords.length - 1].toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^(.*(?:ar|er|ir))$/.test(lastWord)) {
      // Check if it's NOT a common Portuguese surname ending
      const surnameExceptions = new Set(['olivar', 'avelar', 'aguilar', 'escobar', 'pilar']);
      if (!surnameExceptions.has(lastWord)) {
        name = finalWords.slice(0, finalWords.length - 1).join(' ');
        console.log(`[NameExtractor v2] Verb suffix rejected, trimmed to: "${name}"`);
      }
    }
  }

  name = name.trim();
  return name.length >= 2 ? name : null;
}

/**
 * Parse date/time references from Portuguese natural language.
 * Returns an ISO 8601 string in Europe/Lisbon timezone, or a descriptive string.
 */
function extractDateFromMessage(message: string, existingPreferredDate?: string): string | null {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const now = new Date();
  const lisbon = toLisbonParts(now);

  console.log(`[DateExtractor] Raw message: "${message}", existingPreferredDate: ${existingPreferredDate ?? 'none'}`);

  // --- Step 1: Extract time independently ---
  let hours: number | null = null;
  let minutes: number | null = null;

  const timeMatch = lower.match(/(?:as|às)\s*(\d{1,2})\s*[h:]\s*(\d{0,2})/i)
    || lower.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  }

  // --- Step 2: Extract date components (prioritize explicit over relative) ---
  let resolvedDateStr: string | null = null;
  let dateSource = 'none';

  // Month name map
  const monthNames: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
    maio: '05', junho: '06', julho: '07', agosto: '08',
    setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };

  // Priority 1: day + month name ("21 fevereiro", "dia 21 fevereiro", "5 de março")
  const dayMonthMatch = lower.match(/(?:dia\s+)?(\d{1,2})\s*(?:de\s*)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/);
  if (dayMonthMatch) {
    const d = dayMonthMatch[1].padStart(2, '0');
    const m = monthNames[dayMonthMatch[2]];
    const y = lisbon.dateStr.substring(0, 4);
    resolvedDateStr = `${y}-${m}-${d}`;
    dateSource = 'day+month';
  }

  // Priority 2: explicit numeric date ("19/02", "19-02-2026")
  if (!resolvedDateStr) {
    const explicitDateMatch = message.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (explicitDateMatch) {
      const d = explicitDateMatch[1].padStart(2, '0');
      const m = explicitDateMatch[2].padStart(2, '0');
      let y = explicitDateMatch[3] || lisbon.dateStr.substring(0, 4);
      if (y.length === 2) y = '20' + y;
      resolvedDateStr = `${y}-${m}-${d}`;
      dateSource = 'numeric';
    }
  }

  // Priority 3: "dia X" without month
  if (!resolvedDateStr) {
    const dayOnlyMatch = lower.match(/\bdia\s+(\d{1,2})\b/);
    if (dayOnlyMatch) {
      const targetDay = parseInt(dayOnlyMatch[1], 10);
      resolvedDateStr = resolveDay(lisbon.dateStr, targetDay);
      dateSource = 'day-only';
    }
  }

  // Priority 4: weekday names ("próxima segunda", "sexta")
  if (!resolvedDateStr) {
    const dayNames: Record<string, number> = {
      domingo: 0, segunda: 1, terca: 2, quarta: 3,
      quinta: 4, sexta: 5, sabado: 6,
    };
    const weekdayMatch = lower.match(/(?:proxima\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)/);
    if (weekdayMatch) {
      const targetDow = dayNames[weekdayMatch[1]];
      if (targetDow !== undefined) {
        let daysAhead = targetDow - lisbon.dayOfWeek;
        if (daysAhead <= 0) daysAhead += 7;
        const target = new Date(now.getTime() + daysAhead * 86400000);
        const targetParts = toLisbonParts(target);
        resolvedDateStr = targetParts.dateStr;
        dateSource = 'weekday';
      }
    }
  }

  // Priority 5: relative words ("hoje", "amanhã") — only if no explicit date found
  if (!resolvedDateStr) {
    if (/\b(hoje|today)\b/.test(lower)) {
      resolvedDateStr = lisbon.dateStr;
      dateSource = 'hoje';
    } else if (/\b(amanha|tomorrow)\b/.test(lower)) {
      const tomorrow = new Date(now.getTime() + 86400000);
      const tomorrowParts = toLisbonParts(tomorrow);
      resolvedDateStr = tomorrowParts.dateStr;
      dateSource = 'amanha';
    }
  }

  // Priority 6: time only — preserve existing preferred_date or fallback to today
  if (!resolvedDateStr && hours !== null) {
    if (existingPreferredDate) {
      // Extract date portion from existing preferred_date (handles both "YYYY-MM-DD" and "YYYY-MM-DDThh:mm:ss")
      resolvedDateStr = existingPreferredDate.substring(0, 10);
      dateSource = 'time-only-preserve-existing';
      console.log(`[DateExtractor] Time-only detected, preserving existing date: ${resolvedDateStr}`);
    } else {
      resolvedDateStr = lisbon.dateStr;
      dateSource = 'time-only-today';
    }
  }

  console.log(`[DateExtractor] Parsed components — date: ${resolvedDateStr} (${dateSource}), time: ${hours !== null ? `${hours}h${minutes ?? 0}` : 'none'}`);

  if (!resolvedDateStr) {
    return null;
  }

  const result = buildISODate(resolvedDateStr, hours, minutes);
  console.log(`[DateExtractor] Final ISO result: ${result}`);
  return result;
}

/**
 * Build ISO 8601 date string. If time is provided, include it.
 */
function buildISODate(dateStr: string, hours: number | null, minutes: number | null): string {
  if (hours !== null) {
    const h = String(hours).padStart(2, '0');
    const m = String(minutes ?? 0).padStart(2, '0');
    return `${dateStr}T${h}:${m}:00`;
  }
  return dateStr;
}

/**
 * Resolve "dia X" to a YYYY-MM-DD, advancing month if day has passed.
 */
function resolveDay(currentDateStr: string, targetDay: number): string {
  const [y, m] = currentDateStr.split('-').map(Number);
  const currentDay = parseInt(currentDateStr.split('-')[2], 10);
  
  if (targetDay >= currentDay) {
    return `${y}-${String(m).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  }
  // Day has passed, use next month
  let newMonth = m + 1;
  let newYear = y;
  if (newMonth > 12) { newMonth = 1; newYear++; }
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}
