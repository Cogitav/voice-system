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
      const nextDays = await findNextAvailableDays(empresaId, context.service_id, today, 'Europe/Lisbon', 2);
      const proactiveSlots = nextDays.flatMap(d => d.slots.slice(0, 2)).slice(0, 4);

      if (proactiveSlots.length > 0) {
        return {
          context_updates: {
            state: 'awaiting_slot_selection',
            available_slots: proactiveSlots,
            slots_generated_for_date: null,
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
      context.slots_generated_for_date === context.preferred_date
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
    });

    if (availability.has_availability) {
      const slots = availability.slots.slice(0, LIMITS.max_slots_per_page);

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

export function selectSlotFromContext(
  context: ConversationContext,
  input: string
): SlotSuggestion | null {
  const slots = context.available_slots;
  if (!slots || slots.length === 0) return null;

  const lower = input.toLowerCase().trim();

  const numMatch = lower.match(/\b([1-9])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < slots.length) return slots[idx];
  }

  const ordinals: Record<string, number> = {
    'primeiro': 0, 'primeira': 0, 'segundo': 1, 'segunda': 1,
    'terceiro': 2, 'terceira': 2, 'quarto': 3, 'quarta': 3, 'quinto': 4,
  };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (lower.includes(word) && idx < slots.length) return slots[idx];
  }

  const timeMatch = lower.match(/\b(\d{1,2})(?:h|:00?)?\b/);
  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, '0');
    const found = slots.find(s => s.display_label.includes(`${hour}:`));
    if (found) return found;
  }

  return null;
}
