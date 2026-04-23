import { ConversationContext, SlotSuggestion } from './types.ts';
import { getMissingFields } from './entity-extractor.ts';
import { checkAvailability, findNextAvailableDays } from './availability-engine.ts';
import { LIMITS } from './constants.ts';

interface OrchestratorResult {
  context_updates: Partial<ConversationContext>;
  action: string;
  response_hint: string;
  slots?: SlotSuggestion[];
}

export interface SlotSelectionResult {
  slot: SlotSuggestion | null;
  selected_index: number | null;
}

export interface TimeSlotMatchResult {
  slot: SlotSuggestion | null;
  selected_index: number | null;
  match_type: 'exact' | 'closest' | 'fallback';
  match_strategy: 'exact' | 'closest_future' | 'closest_overall' | 'before' | 'after' | 'relative_earlier' | 'relative_later' | 'fallback';
  ordered_slots: SlotSuggestion[];
}

interface TimeSlotCandidate {
  slot: SlotSuggestion;
  selected_index: number;
  minutes: number;
  distance: number;
  futureDistance: number | null;
}

const REASONABLE_TIME_MATCH_WINDOW_MINUTES = 120;

// Groups personal fields together for natural collection
function getPersonalFieldsGroup(missing: string[]): string[] {
  const personal = ['customer_name', 'customer_email', 'customer_phone'];
  return personal.filter(f => missing.includes(f));
}

export async function orchestrateBooking(
  context: ConversationContext,
  empresaId: string,
  requirePhone: boolean = false,
  requireReason: boolean = false
): Promise<OrchestratorResult> {

  const missing = getMissingFields(context, requirePhone, requireReason);

  if (missing.length > 0) {
    // Service not yet identified — ask first
    if (missing.includes('service_id')) {
      return {
        context_updates: { state: 'collecting_data', fields_missing: missing },
        action: 'ASK_SERVICE',
        response_hint: 'Identifica o serviço que o utilizador pretende agendar e pergunta de forma natural qual o serviço.',
      };
    }

    // Group personal fields — ask all at once
    const personalMissing = getPersonalFieldsGroup(missing);
    if (personalMissing.length > 0) {
      const needsName = personalMissing.includes('customer_name');
      const needsEmail = personalMissing.includes('customer_email');
      const needsPhone = personalMissing.includes('customer_phone');

      let hint = 'Para confirmar o agendamento, preciso de alguns dados. ';
      const parts: string[] = [];
      if (needsName) parts.push('nome completo');
      if (needsEmail) parts.push('email');
      if (needsPhone) parts.push('número de telefone');
      hint += `Por favor indica o teu ${parts.join(', ')} 😊`;

      return {
        context_updates: { state: 'collecting_data', fields_missing: missing },
        action: 'ASK_PERSONAL_DATA',
        response_hint: hint,
      };
    }

    // Only date missing — proactively suggest next available slots
    if (missing.includes('preferred_date') && context.service_id) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
      const nextDays = await findNextAvailableDays(empresaId, context.service_id, today, 'Europe/Lisbon', 3);
      const proactiveSlots = nextDays.flatMap(d => d.slots.slice(0, 6)).slice(0, 8);

      if (proactiveSlots.length > 0) {
        return {
          context_updates: {
            state: 'awaiting_slot_selection',
            available_slots: proactiveSlots,
            slots_generated_for_date: 'proactive',
            fields_missing: missing.filter(f => f !== 'preferred_date'),
          },
          action: 'PROACTIVE_SLOTS',
          response_hint: 'O utilizador não indicou data. Sugere os próximos horários disponíveis de forma proactiva e simpática.',
          slots: proactiveSlots,
        };
      }

      return {
        context_updates: { state: 'collecting_data', fields_missing: missing },
        action: 'ASK_DATE',
        response_hint: 'Pergunta de forma natural para que data e hora pretende o agendamento.',
      };
    }
  }

  // All data collected — check availability
  if (context.preferred_date && context.service_id) {
    if (
      context.available_slots.length > 0 &&
      (context.slots_generated_for_date === context.preferred_date ||
       context.slots_generated_for_date === 'proactive')
    ) {
      return {
        context_updates: { state: 'awaiting_slot_selection' },
        action: 'SHOW_EXISTING_SLOTS',
        response_hint: 'Estes são os horários disponíveis. Apresenta-os de forma simpática e pede ao utilizador para escolher.',
        slots: context.available_slots,
      };
    }

    const availability = await checkAvailability({
      empresa_id: empresaId,
      service_id: context.service_id,
      date: context.preferred_date,
      timezone: 'Europe/Lisbon',
      preferred_time: context.preferred_time ?? undefined,
    });

    if (availability.has_availability) {
      const slots = availability.slots.slice(0, 8);

      if (slots.length === 1) {
        return {
          context_updates: {
            state: 'awaiting_confirmation',
            available_slots: slots,
            selected_slot: slots[0],
            slots_generated_for_date: context.preferred_date,
          },
          action: 'SINGLE_SLOT_CONFIRM',
          response_hint: `Só temos um horário disponível: ${slots[0].display_label}. Pergunta de forma natural se confirma.`,
          slots,
        };
      }

      return {
        context_updates: {
          state: 'awaiting_slot_selection',
          available_slots: slots,
          slots_generated_for_date: context.preferred_date,
          selected_slot: null,
        },
        action: 'SHOW_SLOTS',
        response_hint: 'Apresenta os horários disponíveis de forma simpática. Diz que são os horários disponíveis para essa data e pede para escolher.',
        slots,
      };
    }

    const tomorrow = new Date(context.preferred_date + 'T12:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });

    const alternatives = await findNextAvailableDays(
      empresaId,
      context.service_id,
      tomorrowStr,
      'Europe/Lisbon',
      3
    );

    const alternativeSlots = alternatives.flatMap(a => a.slots.slice(0, 2));

    return {
      context_updates: {
        state: 'awaiting_slot_selection',
        available_slots: alternativeSlots,
        slots_generated_for_date: null,
        selected_slot: null,
        preferred_date: null,
      },
      action: 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES',
      response_hint: `Informa de forma empática que não há disponibilidade para a data pedida. Apresenta as próximas datas disponíveis e pede para escolher.`,
      slots: alternativeSlots,
    };
  }

  return {
    context_updates: { state: 'collecting_data' },
    action: 'MISSING_DATE_OR_SERVICE',
    response_hint: 'Pergunta de forma natural para que data pretende o agendamento.',
  };
}

function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::|h)?(\d{2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? '00');
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function getSlotStartMinutes(slot: SlotSuggestion): number | null {
  const match = slot.start.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function findClosestSlot(
  timeParsed: string,
  availableSlots: SlotSuggestion[],
  options: {
    time_operator?: 'exact' | 'before' | 'after' | null;
    relative_time_direction?: 'earlier' | 'later' | null;
    current_slot?: SlotSuggestion | null;
  } = {}
): TimeSlotMatchResult {
  const requestedMinutes = parseTimeToMinutes(timeParsed);
  const currentSlotMinutes = options.current_slot ? getSlotStartMinutes(options.current_slot) : null;
  const relationTargetMinutes = requestedMinutes ?? currentSlotMinutes;
  const fallbackResult: TimeSlotMatchResult = {
    slot: null,
    selected_index: null,
    match_type: 'fallback',
    match_strategy: 'fallback',
    ordered_slots: availableSlots,
  };

  if (availableSlots.length === 0) {
    return fallbackResult;
  }

  const candidates = availableSlots
    .map((slot, index) => {
      const minutes = getSlotStartMinutes(slot);
      if (minutes === null) return null;
      const distanceTarget = requestedMinutes ?? currentSlotMinutes;
      return {
        slot,
        selected_index: index + 1,
        minutes,
        distance: distanceTarget === null ? 0 : Math.abs(minutes - distanceTarget),
        futureDistance: requestedMinutes !== null && minutes >= requestedMinutes ? minutes - requestedMinutes : null,
      };
    })
    .filter((candidate): candidate is TimeSlotCandidate => candidate !== null);

  if (candidates.length === 0) {
    return fallbackResult;
  }

  const sortByDistanceTo = (targetMinutes: number) => [...candidates].sort((a, b) => {
    const aDistance = Math.abs(a.minutes - targetMinutes);
    const bDistance = Math.abs(b.minutes - targetMinutes);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return a.minutes - b.minutes;
  });

  if (relationTargetMinutes !== null && options.relative_time_direction === 'earlier') {
    const earlier = candidates
      .filter((candidate) => candidate.minutes < relationTargetMinutes)
      .sort((a, b) => b.minutes - a.minutes)[0];

    const ordered_slots = sortByDistanceTo(relationTargetMinutes).map((candidate) => candidate.slot);
    return earlier
      ? {
        slot: earlier.slot,
        selected_index: earlier.selected_index,
        match_type: 'closest',
        match_strategy: 'relative_earlier',
        ordered_slots,
      }
      : {
        slot: null,
        selected_index: null,
        match_type: 'fallback',
        match_strategy: 'relative_earlier',
        ordered_slots,
      };
  }

  if (relationTargetMinutes !== null && options.relative_time_direction === 'later') {
    const later = candidates
      .filter((candidate) => candidate.minutes > relationTargetMinutes)
      .sort((a, b) => a.minutes - b.minutes)[0];

    const ordered_slots = sortByDistanceTo(relationTargetMinutes).map((candidate) => candidate.slot);
    return later
      ? {
        slot: later.slot,
        selected_index: later.selected_index,
        match_type: 'closest',
        match_strategy: 'relative_later',
        ordered_slots,
      }
      : {
        slot: null,
        selected_index: null,
        match_type: 'fallback',
        match_strategy: 'relative_later',
        ordered_slots,
      };
  }

  if (requestedMinutes === null) {
    return {
      ...fallbackResult,
      ordered_slots: relationTargetMinutes !== null
        ? sortByDistanceTo(relationTargetMinutes).map((candidate) => candidate.slot)
        : availableSlots,
    };
  }

  if (options.time_operator === 'before') {
    const before = candidates
      .filter((candidate) => candidate.minutes < requestedMinutes)
      .sort((a, b) => b.minutes - a.minutes)[0];
    const ordered_slots = sortByDistanceTo(requestedMinutes).map((candidate) => candidate.slot);
    return before
      ? {
        slot: before.slot,
        selected_index: before.selected_index,
        match_type: 'closest',
        match_strategy: 'before',
        ordered_slots,
      }
      : {
        slot: null,
        selected_index: null,
        match_type: 'fallback',
        match_strategy: 'before',
        ordered_slots,
      };
  }

  if (options.time_operator === 'after') {
    const after = candidates
      .filter((candidate) => candidate.minutes > requestedMinutes)
      .sort((a, b) => a.minutes - b.minutes)[0];
    const ordered_slots = sortByDistanceTo(requestedMinutes).map((candidate) => candidate.slot);
    return after
      ? {
        slot: after.slot,
        selected_index: after.selected_index,
        match_type: 'closest',
        match_strategy: 'after',
        ordered_slots,
      }
      : {
        slot: null,
        selected_index: null,
        match_type: 'fallback',
        match_strategy: 'after',
        ordered_slots,
      };
  }

  const orderedCandidates = [...candidates].sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.futureDistance !== null && b.futureDistance === null) return -1;
    if (a.futureDistance === null && b.futureDistance !== null) return 1;
    return a.minutes - b.minutes;
  });
  const ordered_slots = orderedCandidates.map((candidate) => candidate.slot);

  const exact = candidates.find((candidate) => candidate.minutes === requestedMinutes);
  if (exact) {
    return {
      slot: exact.slot,
      selected_index: exact.selected_index,
      match_type: 'exact',
      match_strategy: 'exact',
      ordered_slots,
    };
  }

  const closestFuture = candidates
    .filter((candidate) => candidate.futureDistance !== null)
    .sort((a, b) => (a.futureDistance! - b.futureDistance!) || (a.minutes - b.minutes))[0];

  if (
    closestFuture &&
    closestFuture.futureDistance !== null &&
    closestFuture.futureDistance <= REASONABLE_TIME_MATCH_WINDOW_MINUTES
  ) {
    return {
      slot: closestFuture.slot,
      selected_index: closestFuture.selected_index,
      match_type: 'closest',
      match_strategy: 'closest_future',
      ordered_slots,
    };
  }

  const closestOverall = orderedCandidates[0];
  if (closestOverall.distance <= REASONABLE_TIME_MATCH_WINDOW_MINUTES) {
    return {
      slot: closestOverall.slot,
      selected_index: closestOverall.selected_index,
      match_type: 'closest',
      match_strategy: 'closest_overall',
      ordered_slots,
    };
  }

  return {
    slot: closestOverall.slot,
    selected_index: closestOverall.selected_index,
    match_type: 'fallback',
    match_strategy: 'fallback',
    ordered_slots,
  };
}

export function resolveSlotSelectionFromContext(
  context: ConversationContext,
  input: string
): SlotSelectionResult {
  const slots = context.available_slots;
  if (!slots || slots.length === 0) {
    return { slot: null, selected_index: null };
  }

  const lower = input.toLowerCase().trim();

  const numMatch = lower.match(/\b(\d{1,2})\b/);
  if (numMatch) {
    const selectedIndex = parseInt(numMatch[1], 10);
    const idx = selectedIndex - 1;
    if (idx >= 0 && idx < slots.length) {
      return { slot: slots[idx], selected_index: selectedIndex };
    }
    return { slot: null, selected_index: null };
  }

  const ordinals: Record<string, number> = {
    'primeiro': 0, 'primeira': 0, 'segundo': 1, 'segunda': 1,
    'terceiro': 2, 'terceira': 2, 'quarto': 3, 'quarta': 3, 'quinto': 4,
  };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (lower.includes(word) && idx < slots.length) {
      return { slot: slots[idx], selected_index: idx + 1 };
    }
  }

  const numberWords: Record<string, number> = {
    'um': 0, 'uma': 0, 'dois': 1, 'duas': 1, 'três': 2, 'tres': 2,
    'quatro': 3, 'cinco': 4,
  };
  for (const [word, idx] of Object.entries(numberWords)) {
    if (lower.includes(word) && idx < slots.length) {
      return { slot: slots[idx], selected_index: idx + 1 };
    }
  }

  return { slot: null, selected_index: null };
}

export function selectSlotFromContext(
  context: ConversationContext,
  input: string
): SlotSuggestion | null {
  return resolveSlotSelectionFromContext(context, input).slot;
}
