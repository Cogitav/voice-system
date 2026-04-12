import { ConversationContext, SlotSuggestion } from './types.ts';
import { getMissingFields, getNextFieldToAsk } from './entity-extractor.ts';
import { checkAvailability, findNextAvailableDays } from './availability-engine.ts';
import { canTransition } from './state-machine.ts';
import { LIMITS } from './constants.ts';

interface OrchestratorResult {
  context_updates: Partial<ConversationContext>;
  action: string;
  response_hint: string;
  slots?: SlotSuggestion[];
}

const FIELD_QUESTIONS: Record<string, string> = {
  service_id: 'Qual é o serviço que pretende agendar?',
  customer_name: 'Qual é o seu nome completo?',
  customer_email: 'Qual é o seu endereço de email?',
  customer_phone: 'Qual é o seu número de telefone?',
  preferred_date: 'Para que data pretende agendar?',
  customer_reason: 'Qual é o motivo da sua visita?',
};

export async function orchestrateBooking(
  context: ConversationContext,
  empresaId: string,
  requirePhone: boolean = false,
  requireReason: boolean = true
): Promise<OrchestratorResult> {

  const missing = getMissingFields(context, requirePhone, requireReason);

  // Still collecting data
  if (missing.length > 0) {
    const nextField = getNextFieldToAsk(missing);
    const question = FIELD_QUESTIONS[nextField ?? ''] ?? 'Preciso de mais informações.';

    return {
      context_updates: {
        state: 'collecting_data',
        fields_missing: missing,
      },
      action: 'ASK_FIELD',
      response_hint: question,
    };
  }

  // All data collected — check availability
  if (context.preferred_date && context.service_id) {
    // If we already have slots for this date, don't re-check
    if (
      context.available_slots.length > 0 &&
      context.slots_generated_for_date === context.preferred_date
    ) {
      return {
        context_updates: { state: 'awaiting_slot_selection' },
        action: 'SHOW_EXISTING_SLOTS',
        response_hint: 'Estes são os horários disponíveis:',
        slots: context.available_slots,
      };
    }

    // Check availability
    const availability = await checkAvailability({
      empresa_id: empresaId,
      service_id: context.service_id,
      date: context.preferred_date,
      timezone: 'Europe/Lisbon',
    });

    if (availability.has_availability) {
      const slots = availability.slots.slice(0, LIMITS.max_slots_per_page);

      if (slots.length === 1) {
        // Only one slot — go straight to confirmation
        return {
          context_updates: {
            state: 'awaiting_confirmation',
            available_slots: slots,
            selected_slot: slots[0],
            slots_generated_for_date: context.preferred_date,
          },
          action: 'SINGLE_SLOT_CONFIRM',
          response_hint: `Apenas temos disponibilidade às ${slots[0].display_label}. Confirma este horário?`,
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
        response_hint: 'Estes são os horários disponíveis para essa data:',
        slots,
      };
    }

    // No availability — find next available days
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
      response_hint: `Não há disponibilidade para ${context.preferred_date}. Aqui estão as próximas datas disponíveis:`,
      slots: alternativeSlots,
    };
  }

  return {
    context_updates: { state: 'collecting_data' },
    action: 'MISSING_DATE_OR_SERVICE',
    response_hint: FIELD_QUESTIONS['preferred_date'],
  };
}

export function selectSlotFromContext(
  context: ConversationContext,
  input: string
): SlotSuggestion | null {
  const slots = context.available_slots;
  if (!slots || slots.length === 0) return null;

  const lower = input.toLowerCase().trim();

  // By number (1, 2, 3...)
  const numMatch = lower.match(/\b([1-9])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < slots.length) return slots[idx];
  }

  // By ordinal (primeiro, segundo...)
  const ordinals: Record<string, number> = {
    'primeiro': 0, 'primeira': 0, 'segundo': 1, 'segunda': 1,
    'terceiro': 2, 'terceira': 2, 'quarto': 3, 'quarta': 3, 'quinto': 4,
  };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (lower.includes(word) && idx < slots.length) return slots[idx];
  }

  // By time match (e.g. "10h", "10:00")
  const timeMatch = lower.match(/\b(\d{1,2})(?:h|:)(\d{2})?\b/);
  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, '0');
    const min = timeMatch[2] ?? '00';
    const timeStr = `${hour}:${min}`;
    const found = slots.find(s => s.display_label.includes(timeStr));
    if (found) return found;
  }

  return null;
}
