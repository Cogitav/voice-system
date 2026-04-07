/**
 * Booking V2 — Isolated, minimal booking flow.
 * 
 * Data model (single source of truth):
 *   booking_datetime  — ISO string (date + time)
 *   customer_name     — string
 *   customer_email    — string
 *   customer_phone    — string (optional)
 *   service_id        — uuid (optional)
 *
 * States: ask_datetime → confirm → done → reschedule → reschedule_confirm → done
 *
 * Production-ready:
 *   - Availability check before confirm (no double bookings)
 *   - Required contact info before booking creation
 *   - Interruption handling with flow resume
 *   - Post-booking rescheduling without re-collecting contact data
 *   - Structured suggestion slots with date-consistency validation
 *
 * Zero dependencies on the legacy orchestrator / guards / slot logic.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toLisbonParts } from '../_shared/timezone-utils.ts';
import {
  processBookingEvent,
  createBookingLifecycle,
  getActiveLifecycle,
  type BookingEventType,
  type BookingLifecycle,
} from '../_shared/booking-lifecycle-orchestrator.ts';

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Structured Suggestion Slot ──────────────────────────────────────────────
interface SuggestionSlot {
  index: number;
  datetime: string;  // ISO 8601
  label: string;     // human-readable
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface BookingV2Context {
  booking_datetime: string | null;   // ISO 8601, THE single source of truth
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_id: string | null;
  step: 'ask_datetime' | 'confirm' | 'done' | 'reschedule' | 'reschedule_confirm';
  pending_contact: boolean;          // true when waiting for contact info before final create
  reschedule_target: string | null;  // proposed new datetime during reschedule
  appointment_id: string | null;     // the confirmed appointment being rescheduled
  _acknowledged: boolean;            // true after first-interaction acknowledgement fired
  reason: string | null;             // user-provided reason/problem from conversation context
  _bv2_suggested_slots: SuggestionSlot[] | null;  // structured slot suggestions
  _bv2_waiting_slot_selection: boolean;   // true when waiting for user to pick a slot
  _bv2_suggestion_retries: number;        // anti-loop: tracks ambiguous responses during slot selection
  _bv2_selected_slot: string | null;      // the datetime of the selected slot (for pre-confirm validation)
}

interface BookingV2Request {
  conversation_id: string;
  empresa_id: string;
  user_message: string;
  context: BookingV2Context;
}

// ─── Supabase singleton (created once per request) ───────────────────────────
function getSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// ─── Suggestion Slot Helpers ─────────────────────────────────────────────────

/** Build structured suggestion slots from ISO datetime strings */
function buildSuggestionSlots(isoSlots: string[]): SuggestionSlot[] {
  return isoSlots.map((dt, i) => ({
    index: i + 1,
    datetime: dt,
    label: formatDatetimePT(dt),
  }));
}

/** Extract date part from a booking_datetime or ISO string */
function getDatePart(dt: string | null): string | null {
  if (!dt) return null;
  return dt.substring(0, 10);
}

/** Check if all suggestion slots belong to the current booking_datetime date */
function areSuggestionsValid(slots: SuggestionSlot[] | null, bookingDatetime: string | null): boolean {
  if (!slots || slots.length === 0) return false;
  const targetDate = getDatePart(bookingDatetime);
  // If no booking_datetime, suggestions from any date are valid (initial fetch)
  if (!targetDate) return true;
  return slots.every(s => getDatePart(s.datetime) === targetDate);
}

/** Hard reset suggestions — called when date changes */
function resetSuggestions(ctx: BookingV2Context): void {
  console.log('[Suggestions] Hard reset — clearing stale suggestions');
  ctx._bv2_suggested_slots = null;
  ctx._bv2_waiting_slot_selection = false;
  ctx._bv2_suggestion_retries = 0;
  ctx._bv2_selected_slot = null;
}

// ─── Proactive Slot Suggestion Engine ────────────────────────────────────────
async function fetchNextAvailableSlots(
  supabase: SupabaseClient,
  empresaId: string,
  count: number = 3,
  periodFilter?: { start: number; end: number } | null,
  forDate?: string | null,
): Promise<string[]> {
  const now = new Date();
  const lisbon = toLisbonParts(now);
  const slots: string[] = [];
  const daysToSearch = forDate ? 1 : 5;

  for (let dayOffset = 0; dayOffset < daysToSearch && slots.length < count; dayOffset++) {
    const dateStr = forDate || toLisbonParts(new Date(now.getTime() + dayOffset * 86400000)).dateStr;

    const { data: dayBookings } = await supabase
      .from('agendamentos')
      .select('hora')
      .eq('empresa_id', empresaId)
      .eq('data', dateStr)
      .in('estado', ['pendente', 'confirmado']);

    const takenTimes = new Set((dayBookings || []).map((b: { hora: string }) => b.hora.substring(0, 5)));
    const startH = periodFilter?.start ?? 8;
    const endH = periodFilter?.end ?? 19;

    for (let h = startH; h <= endH && slots.length < count; h++) {
      for (const m of [0, 30]) {
        if (slots.length >= count) break;
        const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (takenTimes.has(slot)) continue;

        const isToday = dateStr === lisbon.dateStr;
        if (isToday) {
          const slotMinutes = h * 60 + m;
          const nowMinutes = lisbon.hours * 60 + lisbon.minutes;
          if (slotMinutes <= nowMinutes + 30) continue;
        }

        slots.push(`${dateStr}T${slot}:00`);
      }
    }
  }

  console.log(`[Suggestions] Suggestion mode active`);
  console.log(`[Suggestions] slots generated: ${JSON.stringify(slots.map(s => s.substring(11, 16)))}`);
  return slots;
}

// ─── Slot Selection Matching (resolves ONLY against suggested slots) ─────────
function matchSlotSelection(msg: string, slots: SuggestionSlot[]): SuggestionSlot | null {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Priority 1: Exact index — "1", "2", "3", "opção 1", "opcao 2"
  const numMatch = n.match(/(?:opcao\s*)?(\d)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]);
    const found = slots.find(s => s.index === idx);
    if (found) {
      console.log(`[Selection] resolved by index: ${idx} → ${found.datetime}`);
      return found;
    }
  }

  // Priority 2: Exact time — "18h", "18h30", "às 18h"
  const timeMatch = n.match(/(\d{1,2})\s*h\s*(\d{0,2})/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1]);
    const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const target = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const exactMatch = slots.find(s => s.datetime.includes('T') && s.datetime.substring(11, 16) === target);
    if (exactMatch) {
      console.log(`[Selection] resolved by exact time: ${target} → ${exactMatch.datetime}`);
      return exactMatch;
    }

    // Priority 3: Nearest time (±30min)
    const targetMinutes = h * 60 + m;
    let nearestSlot: SuggestionSlot | null = null;
    let nearestDist = Infinity;
    for (const s of slots) {
      if (!s.datetime.includes('T')) continue;
      const [sh, sm] = s.datetime.substring(11, 16).split(':').map(Number);
      const slotMinutes = sh * 60 + sm;
      const dist = Math.abs(slotMinutes - targetMinutes);
      if (dist <= 30 && dist < nearestDist) {
        nearestDist = dist;
        nearestSlot = s;
      }
    }
    if (nearestSlot) {
      console.log(`[Selection] resolved by nearest time (±${nearestDist}min): ${target} → ${nearestSlot.datetime}`);
      return nearestSlot;
    }

    console.log(`[Selection] failed: time ${target} not found in suggestions (no match within ±30min)`);
  }

  // Single slot + affirmative → auto-select
  if (slots.length === 1) {
    const affirmatives = new Set(['sim', 'ok', 'pode ser', 'esse', 'esta bem', 'bora', 'pode']);
    if (affirmatives.has(n)) {
      console.log(`[Selection] resolved by affirmative (single slot): ${slots[0].datetime}`);
      return slots[0];
    }
  }

  console.log(`[Selection] failed: no match for "${msg}"`);
  return null;
}

// ─── Period Detection (manhã/tarde) ──────────────────────────────────────────
function detectPeriodFilter(msg: string): { start: number; end: number } | null {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\bmanha\b/.test(n)) return { start: 8, end: 12 };
  if (/\btarde\b/.test(n)) return { start: 13, end: 18 };
  return null;
}

// ─── Date/Time Extraction (self-contained, no legacy) ────────────────────────
interface ParsedBookingDatetimeParts {
  dateStr: string | null;
  timeStr: string | null;
  iso: string | null;
}

function extractBookingDatetimeParts(message: string): ParsedBookingDatetimeParts {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const now = new Date();
  const lisbon = toLisbonParts(now);

  let dateStr: string | null = null;
  let hours: number | null = null;
  let minutes: number | null = null;

  // ── Time ──
  const timeMatch = lower.match(/(?:as|às|at)\s*(\d{1,2})\s*[h:]\s*(\d{0,2})/i)
    || lower.match(/\b(\d{1,2}):(\d{2})\b/)
    || lower.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      hours = null;
      minutes = null;
    }
  }

  // ── Date: month names (PT + EN) ──
  const monthMap: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
    maio: '05', junho: '06', julho: '07', agosto: '08',
    setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const monthPattern = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december';

  const dayMonthMatch = lower.match(new RegExp(`(?:dia\\s+)?(\\d{1,2})\\s*(?:de\\s*)?(${monthPattern})`));
  if (dayMonthMatch) {
    const d = dayMonthMatch[1].padStart(2, '0');
    const m = monthMap[dayMonthMatch[2]];
    const y = lisbon.dateStr.substring(0, 4);
    dateStr = `${y}-${m}-${d}`;
  }

  if (!dateStr) {
    const monthDayMatch = lower.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (monthDayMatch) {
      const m = monthMap[monthDayMatch[1]];
      const d = monthDayMatch[2].padStart(2, '0');
      const y = lisbon.dateStr.substring(0, 4);
      dateStr = `${y}-${m}-${d}`;
    }
  }

  // ── Date: numeric dd/mm or dd-mm-yyyy ──
  if (!dateStr) {
    const numMatch = message.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (numMatch) {
      const d = numMatch[1].padStart(2, '0');
      const m = numMatch[2].padStart(2, '0');
      let y = numMatch[3] || lisbon.dateStr.substring(0, 4);
      if (y.length === 2) y = '20' + y;
      dateStr = `${y}-${m}-${d}`;
    }
  }

  // ── Date: "dia X" (no month) ──
  if (!dateStr) {
    const dayOnly = lower.match(/\bdia\s+(\d{1,2})\b/);
    if (dayOnly) {
      const target = parseInt(dayOnly[1], 10);
      const [cy, cm, cd] = lisbon.dateStr.split('-').map(Number);
      if (target >= cd) {
        dateStr = `${cy}-${String(cm).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
      } else {
        let nm = cm + 1, ny = cy;
        if (nm > 12) { nm = 1; ny++; }
        dateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
      }
    }
  }

  // ── Date: weekday ──
  if (!dateStr) {
    const dayNames: Record<string, number> = {
      domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    };
    const wdMatch = lower.match(/(?:proxima\s+|next\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
    if (wdMatch) {
      const targetDow = dayNames[wdMatch[1]];
      if (targetDow !== undefined) {
        let ahead = targetDow - lisbon.dayOfWeek;
        if (ahead <= 0) ahead += 7;
        const target = new Date(now.getTime() + ahead * 86400000);
        dateStr = toLisbonParts(target).dateStr;
      }
    }
  }

  // ── Date: relative ──
  if (!dateStr) {
    if (/\b(hoje|today)\b/.test(lower)) {
      dateStr = lisbon.dateStr;
    } else if (/\b(amanha|tomorrow)\b/.test(lower)) {
      dateStr = toLisbonParts(new Date(now.getTime() + 86400000)).dateStr;
    }
  }

  const timeStr = hours !== null ? `${String(hours).padStart(2, '0')}:${String(minutes ?? 0).padStart(2, '0')}` : null;
  const iso = dateStr && timeStr ? `${dateStr}T${timeStr}:00` : null;

  return { dateStr, timeStr, iso };
}

function extractBookingDatetime(message: string): string | null {
  const parsed = extractBookingDatetimeParts(message);
  if (parsed.iso) return parsed.iso;
  if (parsed.dateStr) return parsed.dateStr;
  return null;
}

/**
 * Merge extracted datetime with existing booking_datetime.
 * Rules:
 * - Full datetime → replace entirely
 * - Date only + existing time → keep time, update date
 * - Time only + existing date → keep date, update time
 * - Never downgrade a full datetime to date-only
 */
function mergeBookingDatetime(
  existing: string | null,
  extracted: string | null,
): { merged: string | null; changed: boolean; action: string } {
  if (!extracted) {
    return { merged: existing, changed: false, action: 'no_extraction' };
  }

  const extractedHasTime = extracted.includes('T');
  const existingHasTime = existing?.includes('T') ?? false;

  // Case 1: Full datetime extracted → always use it
  if (extractedHasTime) {
    const changed = extracted !== existing;
    console.log(`[BookingDatetime] ${changed ? 'Updated' : 'Unchanged'} (full datetime): ${extracted}`);
    return { merged: extracted, changed, action: 'full_datetime' };
  }

  // Case 2: Date-only extracted
  if (!extractedHasTime) {
    if (existingHasTime && existing) {
      // Merge: new date + existing time
      const existingTime = existing.substring(10); // Txx:xx:xx
      const merged = `${extracted}${existingTime}`;
      console.log(`[BookingDatetime] Updated (date merge): ${merged} (kept time from ${existing})`);
      return { merged, changed: merged !== existing, action: 'date_merge' };
    }
    if (existing && !existingHasTime) {
      // Both date-only → just update date
      console.log(`[BookingDatetime] Updated (date only): ${extracted}`);
      return { merged: extracted, changed: extracted !== existing, action: 'date_only_update' };
    }
    // No existing → store date-only
    console.log(`[BookingDatetime] Created (date only): ${extracted}`);
    return { merged: extracted, changed: true, action: 'date_only_new' };
  }

  return { merged: existing, changed: false, action: 'no_change' };
}

// ─── Confirmation detection ──────────────────────────────────────────────────
function isConfirmation(msg: string): boolean {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const yes = new Set([
    'sim', 'yes', 'ok', 'confirmo', 'confirmar', 'pode ser', 'bora',
    'tudo bem', 'esta bem', 'perfeito', 'exato', 'certo', 'claro',
    'vamos la', 'pode marcar', 'confirma', 'isso', 'pode',
  ]);
  return yes.has(n);
}

function isDenial(msg: string): boolean {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const no = new Set(['nao', 'no', 'cancelar', 'cancel', 'nao quero', 'desisto']);
  return no.has(n);
}

// ─── Reschedule intent detection ─────────────────────────────────────────────
const RESCHEDULE_KEYWORDS = /\b(alterar|mudar|trocar|reagendar|em vez de|outro dia|outro hor[áa]rio|outra hora|outra data|pode ser antes|pode ser depois|afinal|queria (as|às|mudar|trocar)|queria às|pode ser [àa]s)\b/i;

function detectRescheduleIntent(msg: string): boolean {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (RESCHEDULE_KEYWORDS.test(n)) return true;
  if (/(?:pode ser|afinal|prefiro|quero)\s/.test(n) && extractBookingDatetime(msg)) return true;
  return false;
}

// ─── Interruption detection ──────────────────────────────────────────────────
function isInterruption(msg: string): boolean {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const patterns = [
    /quanto custa/, /qual o preco/, /preco/, /custo/,
    /que planos/, /planos/, /que servicos/, /horario de funcionamento/,
    /onde fica/, /contacto/, /telefone da empresa/,
  ];
  return patterns.some(p => p.test(n));
}

// ─── Availability intent detection (non-intrusive) ──────────────────────────
function isAvailabilityQuestion(msg: string): boolean {
  const n = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const patterns = [
    /que horarios/, /horarios disponiveis/, /disponibilidade/,
    /quando posso/, /quando podem/, /vagas/, /proxima vaga/,
    /proximo horario/, /tem vaga/, /quando ha/,
  ];
  return patterns.some(p => p.test(n));
}

// ─── Format datetime for display ─────────────────────────────────────────────
function formatDatetimePT(iso: string): string {
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const hasTime = iso.includes('T');
  const [datePart, timePart] = iso.split('T');
  const [_y, m, d] = datePart.split('-').map(Number);
  const dateObj = new Date(`${datePart}T12:00:00`);
  const dow = dateObj.getDay();

  let result = `${dayNames[dow]}, ${d} de ${monthNames[m - 1]}`;
  if (hasTime && timePart) {
    const [hh, mm] = timePart.split(':');
    result += ` às ${parseInt(hh)}h${mm !== '00' ? mm : ''}`;
  }
  return result;
}

function formatTimePT(iso: string): string {
  if (!iso.includes('T')) return iso;
  const [hh, mm] = iso.substring(11, 16).split(':');
  return `${parseInt(hh)}h${mm !== '00' ? mm : ''}`;
}

// ─── Format suggestion slots for display ─────────────────────────────────────
function formatSuggestionSlots(slots: SuggestionSlot[]): string {
  return slots.map(s => `${s.index}. ${s.label}`).join('\n');
}

// ─── Deterministic Response Variation Layer ──────────────────────────────────
const ACTION_RESPONSE_MAP: Record<string, string[]> = {
  acknowledge_and_ask_datetime: [
    'Percebo a situação. Vamos tratar disso. Para que dia e hora gostaria de marcar?',
    'Entendi o que se passa. Vamos agendar — que dia e hora prefere?',
    'Obrigado por partilhar. Vamos resolver isso — quando gostaria de marcar?',
  ],
  ask_datetime: [
    'Para que dia e hora gostaria de marcar? Pode indicar algo como "amanhã às 14h".',
    'Qual o dia e hora mais convenientes para si?',
    'Quando gostaria de fazer o agendamento? Por exemplo: "dia 25 às 10h".',
  ],
  ask_confirmation: [
    'Perfeito, só para confirmar:\n\n📅 Data: {date}\n⏰ Hora: {time}\n\nEstá tudo correto?',
    'Ficamos então com:\n\n📅 {date}\n⏰ {time}\n\nConfirma?',
    'Só para validar:\n\n📅 Data: {date}\n⏰ Hora: {time}\n\nEstá correto?',
  ],
  ask_contact: [
    'Perfeito, falta só um último passo 😊\n\nPode indicar o seu nome e email ou telefone para enviarmos a confirmação do agendamento?',
    'Quase lá! 😊 Para finalizar, preciso do seu nome e email ou telefone.',
  ],
  booking_confirmed: [
    'Agendamento confirmado com sucesso! ✅\n\nVai receber um email com todos os detalhes. Se precisar de alterar alguma coisa, estou por aqui.',
    'Tudo tratado! ✅ O seu agendamento está confirmado.\n\nSe precisar de alguma alteração, é só dizer.',
  ],
  already_done: [
    'Obrigado! Qualquer questão adicional, estou por aqui 😊',
    'Está tudo tratado! Se precisar de algo mais, estou disponível 😊',
  ],
  show_alternatives: [
    'Esse horário não está disponível. Tenho estas alternativas:\n\n{alternatives}\n\nQual prefere?',
    'Infelizmente esse horário já está ocupado. Alternativas disponíveis:\n\n{alternatives}\n\nQual lhe convém melhor?',
  ],
  suggest_slots: [
    'Tenho disponibilidade em:\n\n{alternatives}\n\nQual prefere? 😊',
  ],
  repeat_suggestions: [
    'Prefere algum destes horários?\n\n{alternatives}',
  ],
};

/** Always pick the first template for deterministic, predictable responses */
function pickFirst<T>(arr: T[]): T {
  return arr[0];
}

// deno-lint-ignore no-explicit-any
function getActionResponse(action: string, payload: Record<string, any>): string | null {
  const templates = ACTION_RESPONSE_MAP[action];
  if (!templates || templates.length === 0) return null;

  let response = pickFirst(templates);

  if (payload?.datetime) {
    const dt = payload.datetime as string;
    response = response.replace('{datetime}', formatDatetimePT(dt));
    // Structured date/time replacements
    if (dt.includes('T')) {
      const [datePart, timePart] = dt.split('T');
      const [_y, m, d] = datePart.split('-').map(Number);
      const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dateObj = new Date(`${datePart}T12:00:00`);
      const dow = dateObj.getDay();
      response = response.replace('{date}', `${dayNames[dow]}, ${d} de ${monthNames[m - 1]}`);
      const [hh, mm] = timePart.split(':');
      response = response.replace('{time}', `${parseInt(hh)}h${mm !== '00' ? mm : ''}`);
    } else {
      response = response.replace('{date}', formatDatetimePT(dt));
      response = response.replace('{time}', '');
    }
  }

  if (payload?.alternatives && Array.isArray(payload.alternatives)) {
    // Support both string[] and SuggestionSlot[]
    const altText = payload.alternatives.map((a: string | SuggestionSlot, i: number) => {
      if (typeof a === 'string') return `${i + 1}. ${formatTimePT(a)}`;
      return `${a.index}. ${a.label}`;
    }).join('\n');
    response = response.replace('{alternatives}', altText);
  }

  return response;
}

/** Check if a response is generic/empty enough to be safely replaced. */
function isGenericResponse(text: string | null | undefined): boolean {
  if (!text || text.trim().length === 0) return true;
  if (text.trim().length < 5) return true;
  const lower = text.toLowerCase().trim();
  const exactMatches = new Set([
    'para que dia e hora gostaria de marcar?',
    'qual o dia e hora mais convenientes para si?',
    'quando gostaria de fazer o agendamento?',
    'o seu agendamento já foi confirmado.',
    'posso ajudar com mais alguma coisa?',
  ]);
  if (exactMatches.has(lower)) return true;
  const prefixes = [
    'percebo a situação',
    'perfeito! confirma o agendamento',
    'confirma o agendamento para',
    'agendamento confirmado para',
    'para finalizar, pode indicar',
    'esse horário não está disponível',
  ];
  return prefixes.some(p => lower.startsWith(p));
}

const VARIATABLE_ACTIONS = new Set([
  'acknowledge_and_ask_datetime',
  'ask_datetime',
  'ask_confirmation',
  'ask_contact',
  'booking_confirmed',
  'already_done',
  'show_alternatives',
  'suggest_slots',
  'repeat_suggestions',
]);

// ─── LLM Response Refinement Layer ──────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function refineLLMResponse(
  originalResponse: string,
  action: string,
  payload: Record<string, any>,
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('[LLMRefine] No API key, skipping refinement');
    return originalResponse;
  }

  const systemPrompt = `You are a Portuguese (Portugal) language polisher for a professional booking assistant.
Your task: Rewrite the given message to sound more natural, warm and human.

STRICT RULES:
- DO NOT change any factual data (dates, times, names, prices)
- DO NOT change intent or meaning
- DO NOT add new information
- DO NOT remove required information (dates, times, emojis like ✅, 📅, ⏰, 😊)
- KEEP all specific values exactly as they appear (e.g. "Terça-feira, 25 de março às 14h")
- Keep the message concise (max 2-3 sentences for simple actions)
- Write in European Portuguese (PT-PT)
- If unsure, return the original message unchanged
- Return ONLY the final rewritten message, no explanations

Action context: ${action}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalResponse },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[LLMRefine] API error ${response.status}, using original`);
      return originalResponse;
    }

    const data = await response.json();
    const refined = data.choices?.[0]?.message?.content?.trim();

    if (!refined || refined.length === 0) {
      console.log('[LLMRefine] Empty response, using original');
      return originalResponse;
    }

    if (refined.length > originalResponse.length * 2) {
      console.warn('[LLMRefine] Response too long (>2x), using original');
      return originalResponse;
    }

    const keyPatterns = extractKeyVariables(originalResponse, payload);
    const missing = keyPatterns.filter(v => !refined.includes(v));
    if (missing.length > 0) {
      console.warn(`[LLMRefine] Missing key variables: ${missing.join(', ')} — using original`);
      return originalResponse;
    }

    console.log(`[LLMRefine] ✓ Refined (${action}): "${refined.substring(0, 60)}..."`);
    return refined;
  } catch (err) {
    console.error('[LLMRefine] Error:', err);
    return originalResponse;
  }
}

// deno-lint-ignore no-explicit-any
function extractKeyVariables(response: string, payload: Record<string, any>): string[] {
  const vars: string[] = [];
  const emojis = response.match(/[✅📅⏰😊🧾]/g);
  if (emojis) vars.push(...new Set(emojis));
  if (payload?.datetime) {
    const dt = payload.datetime as string;
    const fullFormatted = formatDatetimePT(dt);
    vars.push(fullFormatted);
    if (dt.includes('T')) {
      const timePart = dt.substring(11, 16);
      const [hh, mm] = timePart.split(':');
      const timeFormatted = `${parseInt(hh)}h${mm !== '00' ? mm : ''}`;
      vars.push(timeFormatted);
    }
  }
  if (payload?.customer_name) {
    vars.push(payload.customer_name);
  }
  return vars;
}

// ─── Name / Email / Phone extraction ─────────────────────────────────────────
function extractIdentity(message: string, ctx: BookingV2Context): Partial<BookingV2Context> {
  const out: Partial<BookingV2Context> = {};

  if (!ctx.customer_email) {
    const em = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (em) out.customer_email = em[0].toLowerCase();
  }

  if (!ctx.customer_phone) {
    const ph = message.replace(/\s/g, '').match(/(?:\+351)?(9[1236]\d{7}|2\d{8}|3\d{8})/);
    if (ph) out.customer_phone = ph[1];
  }

  if (!ctx.customer_name) {
    const namePatterns = [
      /(?:meu nome [eé]|chamo[- ]me|sou o|sou a|my name is|me chamo)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{1,40})/i,
    ];
    for (const p of namePatterns) {
      const m = message.match(p);
      if (m) {
        let name = m[1].trim();
        for (const c of [/ e /i, /,/, / que /i, / email /i]) {
          const idx = name.search(c);
          if (idx > 0) name = name.substring(0, idx).trim();
        }
        const words = name.split(/\s+/);
        if (words.length > 3) name = words.slice(0, 3).join(' ');
        if (name.length >= 2 && !/\d/.test(name) && !/@/.test(name)) {
          out.customer_name = name;
        }
        break;
      }
    }

    if (!out.customer_name && ctx.pending_contact) {
      const standalone = message.match(/^([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'-]+){0,2})$/);
      if (standalone) {
        const candidate = standalone[1].trim();
        if (candidate.length >= 2 && !/\d/.test(candidate) && !/@/.test(candidate)) {
          out.customer_name = candidate;
        }
      }
    }
  }

  return out;
}

// ─── Contact info check ─────────────────────────────────────────────────────
function hasRequiredContact(ctx: BookingV2Context): boolean {
  return !!ctx.customer_name && !!(ctx.customer_email || ctx.customer_phone);
}

function getMissingContactMessage(ctx: BookingV2Context): string {
  const missing: string[] = [];
  if (!ctx.customer_name) missing.push('nome');
  if (!ctx.customer_email && !ctx.customer_phone) missing.push('email ou telefone');
  return `Perfeito, falta só um último passo 😊\n\nPode indicar o seu ${missing.join(' e ')} para enviarmos a confirmação do agendamento?`;
}

// ─── Structured Action Types ─────────────────────────────────────────────────
type BookingV2Action =
  | 'acknowledge_and_ask_datetime'
  | 'ask_datetime'
  | 'ask_time'
  | 'ask_confirmation'
  | 'booking_confirmed'
  | 'show_alternatives'
  | 'ask_contact'
  | 'booking_denied'
  | 'interruption'
  | 'already_done'
  | 'reschedule_ask_datetime'
  | 'reschedule_ask_time'
  | 'reschedule_ask_confirmation'
  | 'reschedule_show_alternatives'
  | 'reschedule_confirmed'
  | 'reschedule_denied'
  | 'reschedule_race_condition'
  | 'reschedule_error'
  | 'reschedule_not_found'
  | 'race_condition'
  | 'booking_error'
  | 'contact_received'
  | 'suggest_slots'
  | 'repeat_suggestions'
  | 'fallback';

// deno-lint-ignore no-explicit-any
interface BookingV2ActionPayload { [key: string]: any; }

// ─── Helper: check if any datetime component was parsed ─────────────────────
function hasAnyDatetime(parsed: ParsedBookingDatetimeParts): boolean {
  return !!(parsed.iso || parsed.dateStr || parsed.timeStr);
}

// ─── Core flow engine (sync decision, no I/O) ───────────────────────────────
interface BookingV2Result {
  response: string;
  context: BookingV2Context;
  needsAvailabilityCheck: boolean;
  createBooking: boolean;
  isConfirmationAttempt: boolean;
  rescheduleCommit: boolean;
  action: BookingV2Action | null;
  payload: BookingV2ActionPayload;
  needsSuggestionFetch: boolean;
  suggestionPeriodFilter: { start: number; end: number } | null;
  suggestionForDate: string | null;
}

function processBookingV2(
  userMessage: string,
  ctx: BookingV2Context,
): BookingV2Result {

  const log = (msg: string) => console.log(`[BookingV2] ${msg}`);
  log(`── Step: ${ctx.step} | booking_datetime: ${ctx.booking_datetime ?? 'null'} | pending_contact: ${ctx.pending_contact} | reschedule_target: ${ctx.reschedule_target ?? 'null'} | suggested_slots: ${ctx._bv2_suggested_slots?.length ?? 0} | msg: "${userMessage}"`);

  const baseResult = (): BookingV2Result => ({
    response: '',
    context: ctx,
    needsAvailabilityCheck: false,
    createBooking: false,
    isConfirmationAttempt: false,
    rescheduleCommit: false,
    action: null,
    payload: {},
    needsSuggestionFetch: false,
    suggestionPeriodFilter: null,
    suggestionForDate: null,
  });

  // Always extract identity fields passively
  const identity = extractIdentity(userMessage, ctx);
  if (identity.customer_name) { ctx.customer_name = identity.customer_name; log(`Name: ${ctx.customer_name}`); }
  if (identity.customer_email) { ctx.customer_email = identity.customer_email; log(`Email: ${ctx.customer_email}`); }
  if (identity.customer_phone) { ctx.customer_phone = identity.customer_phone; log(`Phone: ${ctx.customer_phone}`); }

  // ── If we were waiting for contact info and now have it → re-check availability then create ──
  if (ctx.pending_contact && ctx.step === 'confirm') {
    if (hasRequiredContact(ctx)) {
      ctx.pending_contact = false;
      log(`Decision: Contact info received → re-check availability before creating`);
      return { ...baseResult(), needsAvailabilityCheck: true, isConfirmationAttempt: true, action: 'contact_received', payload: { customer_name: ctx.customer_name, customer_email: ctx.customer_email, customer_phone: ctx.customer_phone } };
    }
    // Still missing contact
    log('Decision: Still missing contact info → re-ask');
    return { ...baseResult(), response: getMissingContactMessage(ctx), action: 'ask_contact', payload: { datetime: ctx.booking_datetime } };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: done — check for reschedule intent
  // ══════════════════════════════════════════════════════════════════════════
  if (ctx.step === 'done') {
    // SAFETY: If booking is done, do NOT auto-suggest availability
    if (isAvailabilityQuestion(userMessage)) {
      log('Decision: Availability question after booking done → normal response (no auto-suggest)');
      return { ...baseResult(), response: 'O seu agendamento já está confirmado. Se precisar de alterar, é só dizer 😊', action: 'already_done', payload: { booking_datetime: ctx.booking_datetime } };
    }

    if (detectRescheduleIntent(userMessage)) {
      log('[BookingV2] Post-booking reschedule intent detected');
      log('[BookingV2] Entering reschedule mode');
      log(`[BookingV2] Original booking preserved: ${ctx.booking_datetime}`);

      const proposedDt = extractBookingDatetime(userMessage);
      
      if (proposedDt) {
        const { merged } = mergeBookingDatetime(ctx.booking_datetime, proposedDt);
        
        if (merged && merged.includes('T')) {
          ctx.step = 'reschedule_confirm';
          ctx.reschedule_target = merged;
          log(`[BookingV2] Proposed reschedule target extracted: ${merged}`);
          return { ...baseResult(), needsAvailabilityCheck: true, action: 'reschedule_ask_confirmation', payload: { original_datetime: ctx.booking_datetime, proposed_datetime: merged } };
        } else if (merged && !merged.includes('T')) {
          ctx.step = 'reschedule';
          ctx.reschedule_target = merged;
          log(`[BookingV2] Reschedule date-only extracted: ${merged} — asking for time`);
          return { ...baseResult(), response: `Pretende alterar para ${formatDatetimePT(merged)}. A que horas?`, action: 'reschedule_ask_time', payload: { date: merged, original_datetime: ctx.booking_datetime } };
        }
      }

      ctx.step = 'reschedule';
      ctx.reschedule_target = null;
      return { ...baseResult(), response: 'Sem problema! Para que novo dia e hora pretende alterar o agendamento?', action: 'reschedule_ask_datetime', payload: { original_datetime: ctx.booking_datetime } };
    }

    const confirmIntentRe = /\b(confirm|confirmad[oa]|está confirmad|ficou confirmad|ficou marcad|está marcad)\b/i;
    if (confirmIntentRe.test(userMessage)) {
      log('Decision: Confirmation intent after done → reassure with details');
      const dtFormatted = ctx.booking_datetime ? formatDatetimePT(ctx.booking_datetime) : null;
      const parts = dtFormatted ? dtFormatted.split(' às ') : [];
      const datePart = parts[0] || '';
      const timePart = parts[1] || '';
      const detailBlock = datePart && timePart
        ? `\n📅 ${datePart}\n⏰ ${timePart}\n\nSe precisar de alterar ou cancelar, diga-me.`
        : '\nSe precisar de alterar ou cancelar, diga-me.';
      return { ...baseResult(), response: `Sim 😊 O seu agendamento está confirmado para:${detailBlock}`, action: 'already_done', payload: { booking_datetime: ctx.booking_datetime } };
    }

    const neutralRe = /^(ok|obrigad[oa]|obg|perfeito|tudo bem|certo|fixe|ótimo|excelente|valeu|thanks|thank you)\b/i;
    if (neutralRe.test(userMessage.trim())) {
      log('Decision: Neutral message after done → polite closing');
      return { ...baseResult(), response: 'Perfeito! Se precisar de algo mais, estou por aqui 😊', action: 'already_done', payload: { booking_datetime: ctx.booking_datetime } };
    }

    log('Decision: Already done');
    return { ...baseResult(), response: 'Obrigado! Qualquer questão adicional, estou por aqui 😊', action: 'already_done', payload: { booking_datetime: ctx.booking_datetime } };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: reschedule — collecting new datetime
  // ══════════════════════════════════════════════════════════════════════════
  if (ctx.step === 'reschedule') {
    const rawDt = extractBookingDatetime(userMessage);
    const base = ctx.reschedule_target || ctx.booking_datetime;
    const { merged, changed } = mergeBookingDatetime(base, rawDt);
    log(`Reschedule extraction: raw=${rawDt ?? 'null'}, merged=${merged ?? 'null'}`);

    if (merged && changed) {
      ctx.reschedule_target = merged;

      if (!merged.includes('T')) {
        log('Reschedule: Date only → ask for time');
        return { ...baseResult(), response: `Alterar para ${formatDatetimePT(merged)}. A que horas prefere?`, action: 'reschedule_ask_time', payload: { date: merged, original_datetime: ctx.booking_datetime } };
      }

      ctx.step = 'reschedule_confirm';
      log(`[BookingV2] Reschedule availability check started: ${merged}`);
      return { ...baseResult(), needsAvailabilityCheck: true, action: 'reschedule_ask_confirmation', payload: { original_datetime: ctx.booking_datetime, proposed_datetime: merged } };
    }

    log('Reschedule: No datetime → re-ask');
    return { ...baseResult(), response: 'Para que dia e hora pretende alterar o seu agendamento?', action: 'reschedule_ask_datetime', payload: { original_datetime: ctx.booking_datetime } };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: reschedule_confirm — confirming the new slot
  // ══════════════════════════════════════════════════════════════════════════
  if (ctx.step === 'reschedule_confirm') {
    const rawNewDt = extractBookingDatetime(userMessage);
    const { merged: newMerged, changed: newChanged } = mergeBookingDatetime(ctx.reschedule_target, rawNewDt);

    if (newChanged && newMerged) {
      ctx.reschedule_target = newMerged;
      log(`Reschedule: New datetime during confirm → ${newMerged}`);
      if (!newMerged.includes('T')) {
        ctx.step = 'reschedule';
        return { ...baseResult(), response: `Alterar para ${formatDatetimePT(newMerged)}. A que horas prefere?`, action: 'reschedule_ask_time', payload: { date: newMerged, original_datetime: ctx.booking_datetime } };
      }
      return { ...baseResult(), needsAvailabilityCheck: true, action: 'reschedule_ask_confirmation', payload: { original_datetime: ctx.booking_datetime, proposed_datetime: newMerged } };
    }

    if (isConfirmation(userMessage)) {
      log(`[BookingV2] Reschedule confirmation received → commit`);
      return { ...baseResult(), rescheduleCommit: true, action: 'reschedule_confirmed', payload: { original_datetime: ctx.booking_datetime, new_datetime: ctx.reschedule_target } };
    }

    if (isDenial(userMessage)) {
      ctx.step = 'done';
      ctx.reschedule_target = null;
      log('Reschedule: DENIED → back to done');
      return { ...baseResult(), response: 'Tudo bem, o agendamento original mantém-se. Posso ajudar com mais alguma coisa?', action: 'reschedule_denied', payload: { booking_datetime: ctx.booking_datetime } };
    }

    log('Reschedule: Unclear → re-ask confirmation');
    return {
      ...baseResult(),
      response: `Confirma a alteração do agendamento para ${formatDatetimePT(ctx.reschedule_target!)}? (Sim / Não)`,
      action: 'reschedule_ask_confirmation',
      payload: { original_datetime: ctx.booking_datetime, proposed_datetime: ctx.reschedule_target },
    };
  }

  // ── STEP: ask_datetime ──
  if (ctx.step === 'ask_datetime') {
    const parsed = extractBookingDatetimeParts(userMessage);
    log(`[DatetimeFix] Parsed date=${parsed.dateStr ?? 'null'} time=${parsed.timeStr ?? 'null'}`);

    // ══════════════════════════════════════════════════════════════════════
    // DATE CHANGE DETECTION — Hard reset suggestions when date changes
    // ══════════════════════════════════════════════════════════════════════
    if (parsed.dateStr && ctx._bv2_suggested_slots?.length) {
      const currentDate = getDatePart(ctx.booking_datetime);
      if (currentDate && parsed.dateStr !== currentDate) {
        log(`[Suggestions] Date changed: ${currentDate} → ${parsed.dateStr} — hard reset`);
        resetSuggestions(ctx);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SUGGESTION VALIDITY CHECK — discard stale suggestions
    // ══════════════════════════════════════════════════════════════════════
    if (ctx._bv2_suggested_slots?.length && !areSuggestionsValid(ctx._bv2_suggested_slots, ctx.booking_datetime)) {
      log('[Suggestions] Stale suggestions detected (date mismatch) — discarding');
      resetSuggestions(ctx);
    }

    // ── Availability question during ask_datetime → fetch new suggestions ──
    if (isAvailabilityQuestion(userMessage) && ctx.booking_datetime) {
      log('[BookingV2] Availability question during ask_datetime → regenerating suggestions');
      resetSuggestions(ctx);
      return {
        ...baseResult(),
        response: '',
        needsSuggestionFetch: true,
        suggestionPeriodFilter: detectPeriodFilter(userMessage),
        suggestionForDate: getDatePart(ctx.booking_datetime),
        action: 'suggest_slots',
        payload: {},
      };
    }

    // ── Interrupt guard: non-booking intents bypass suggestion mode ──
    if (ctx._bv2_waiting_slot_selection && isInterruption(userMessage)) {
      log('[BookingV2] Non-booking interrupt during slot selection → bypassing suggestion mode');
      const resume = ctx._bv2_suggested_slots?.length
        ? `\n\nQuando quiser, pode escolher um dos horários sugeridos 😉`
        : '';
      return { ...baseResult(), response: `Pode consultar essa informação no nosso site ou contactar-nos diretamente. 😊${resume}`, action: 'interruption', payload: { step: ctx.step } };
    }

    // ══════════════════════════════════════════════════════════════════════
    // SLOT SELECTION MODE — resolve ONLY against ctx._bv2_suggested_slots
    // ══════════════════════════════════════════════════════════════════════
    if (ctx._bv2_waiting_slot_selection && ctx._bv2_suggested_slots?.length) {
      // Safety: ensure suggestions are still valid before matching
      if (!areSuggestionsValid(ctx._bv2_suggested_slots, ctx.booking_datetime)) {
        log('[Suggestions] Suggestions invalid during selection — regenerating');
        resetSuggestions(ctx);
        return {
          ...baseResult(),
          response: '',
          needsSuggestionFetch: true,
          suggestionPeriodFilter: detectPeriodFilter(userMessage),
          suggestionForDate: getDatePart(ctx.booking_datetime),
          action: 'suggest_slots',
          payload: {},
        };
      }

      const selected = matchSlotSelection(userMessage, ctx._bv2_suggested_slots);
      if (selected) {
        log(`[Selection] resolved: ${selected.datetime}`);
        // ANTI-LOOP: set selected_slot and proceed to confirmation — MUST NOT show suggestions again
        ctx.booking_datetime = selected.datetime;
        ctx._bv2_selected_slot = selected.datetime;
        ctx._bv2_suggested_slots = null;
        ctx._bv2_waiting_slot_selection = false;
        ctx._bv2_suggestion_retries = 0;
        ctx.step = 'confirm';
        return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: selected.datetime } };
      }

      // New datetime provided during slot selection → validate normally
      if (parsed.iso) {
        ctx._bv2_suggested_slots = null;
        ctx._bv2_waiting_slot_selection = false;
        ctx._bv2_suggestion_retries = 0;
        ctx.booking_datetime = parsed.iso;
        ctx._bv2_selected_slot = parsed.iso;
        ctx.step = 'confirm';
        log(`[BookingV2] New datetime during slot selection: ${parsed.iso}`);
        return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: parsed.iso } };
      }

      // Ambiguous response → anti-loop protection
      ctx._bv2_suggestion_retries = (ctx._bv2_suggestion_retries || 0) + 1;
      log(`[BookingV2] Suggestion retries: ${ctx._bv2_suggestion_retries}`);

      if (ctx._bv2_suggestion_retries > 1) {
        log('[BookingV2] Suggestion loop prevented');
        resetSuggestions(ctx);
        return { ...baseResult(), response: 'Pode indicar o horário que prefere? 😊', action: 'ask_datetime', payload: {} };
      }

      log('[BookingV2] Ambiguous response during slot selection → repeating suggestions');
      const altText = formatSuggestionSlots(ctx._bv2_suggested_slots);
      return { ...baseResult(), response: `Prefere algum destes horários?\n\n${altText}`, action: 'repeat_suggestions', payload: { suggestions: ctx._bv2_suggested_slots } };
    }

    // ── Acknowledge & Ask Datetime (fires once) — now with suggestions ──
    if (!ctx.booking_datetime && !ctx._acknowledged && ctx.reason && !hasAnyDatetime(parsed)) {
      ctx._acknowledged = true;
      log('[Acknowledge] First interaction with reason/problem — acknowledging + fetching suggestions');
      return {
        ...baseResult(),
        response: '',
        needsSuggestionFetch: true,
        suggestionPeriodFilter: null,
        action: 'acknowledge_and_ask_datetime',
        payload: { acknowledged: true },
      };
    }

    if (parsed.iso) {
      ctx.booking_datetime = parsed.iso;
      ctx._bv2_selected_slot = parsed.iso;
      ctx.step = 'confirm';
      log(`[DatetimeFix] Final ISO datetime=${parsed.iso}`);
      log(`[DatetimeFix] Promoted to _bv2_booking_datetime=${ctx.booking_datetime}`);
      log('[DatetimeFix] Step transition -> confirm');
      return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: parsed.iso } };
    }

    if (ctx.booking_datetime?.includes('T')) {
      log(`[BookingDatetime] Ignored invalid overwrite: partial input preserved existing ${ctx.booking_datetime}`);
      ctx._bv2_selected_slot = ctx.booking_datetime;
      ctx.step = 'confirm';
      log('[DatetimeFix] Step transition -> confirm');
      return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: ctx.booking_datetime } };
    }

    if (parsed.dateStr) {
      // Date change: update booking_datetime and clear any stale suggestions
      const prevDate = getDatePart(ctx.booking_datetime);
      if (prevDate && parsed.dateStr !== prevDate) {
        log(`[Suggestions] Date changed in dateStr path: ${prevDate} → ${parsed.dateStr}`);
        resetSuggestions(ctx);
      }

      // Check for period filter (manhã/tarde) → suggest slots within range
      const period = detectPeriodFilter(userMessage);
      if (period) {
        log(`[BookingV2] Period detected: ${period.start}-${period.end} for date ${parsed.dateStr}`);
        ctx.booking_datetime = parsed.dateStr;
        return {
          ...baseResult(),
          response: '',
          needsSuggestionFetch: true,
          suggestionPeriodFilter: period,
          suggestionForDate: parsed.dateStr,
          action: 'suggest_slots',
          payload: { date: parsed.dateStr, period: `${period.start}-${period.end}` },
        };
      }
      ctx.booking_datetime = parsed.dateStr;
      log(`[DatetimeFix] Assigned partial date to _bv2_booking_datetime=${ctx.booking_datetime}`);
      return { ...baseResult(), response: `Ótimo, dia ${formatDatetimePT(parsed.dateStr)}. A que horas prefere?`, action: 'ask_time', payload: { date: parsed.dateStr } };
    }

    // No datetime at all → fetch suggestions proactively (only if not already fetched)
    if (!ctx._bv2_suggested_slots) {
      log('[BookingV2] No datetime provided → suggestion-first mode');
      return {
        ...baseResult(),
        response: '',
        needsSuggestionFetch: true,
        suggestionPeriodFilter: detectPeriodFilter(userMessage),
        action: 'suggest_slots',
        payload: {},
      };
    }

    // Suggestions already exist but no slot selection mode — fallback ask
    log('[BookingV2] Suggestions already fetched but no selection — asking directly');
    return { ...baseResult(), response: 'Pode indicar o horário que prefere? 😊', action: 'ask_datetime', payload: {} };
  }

  // ── STEP: confirm ──
  if (ctx.step === 'confirm') {
    const parsed = extractBookingDatetimeParts(userMessage);
    log(`[DatetimeFix] Parsed date=${parsed.dateStr ?? 'null'} time=${parsed.timeStr ?? 'null'} (confirm step)`);

    // ══════════════════════════════════════════════════════════════════════
    // PRE-CONFIRM HARD VALIDATION
    // ══════════════════════════════════════════════════════════════════════
    // If selected_slot exists, it MUST match booking_datetime
    if (ctx._bv2_selected_slot && ctx.booking_datetime && ctx._bv2_selected_slot !== ctx.booking_datetime) {
      log(`[Validation] MISMATCH: selected_slot=${ctx._bv2_selected_slot} ≠ booking_datetime=${ctx.booking_datetime} — BLOCKING, regenerating`);
      ctx.booking_datetime = null;
      ctx._bv2_selected_slot = null;
      ctx.step = 'ask_datetime';
      resetSuggestions(ctx);
      return {
        ...baseResult(),
        response: '',
        needsSuggestionFetch: true,
        suggestionPeriodFilter: null,
        action: 'suggest_slots',
        payload: { reason: 'pre_confirm_mismatch' },
      };
    }

    if (parsed.iso && parsed.iso !== ctx.booking_datetime) {
      ctx.booking_datetime = parsed.iso;
      ctx._bv2_selected_slot = parsed.iso;
      log(`[DatetimeFix] Final ISO datetime=${parsed.iso}`);
      log(`[DatetimeFix] Promoted to _bv2_booking_datetime=${ctx.booking_datetime}`);
      return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: parsed.iso } };
    }

    // Time-only in confirm step: merge with existing date and re-check availability
    if (ctx.booking_datetime?.includes('T') && parsed.timeStr && !parsed.dateStr && !parsed.iso) {
      const existingDatePart = ctx.booking_datetime.substring(0, 10);
      const newIso = `${existingDatePart}T${parsed.timeStr}:00`;
      if (newIso !== ctx.booking_datetime) {
        const previousDt = ctx.booking_datetime;
        ctx.booking_datetime = newIso;
        ctx._bv2_selected_slot = newIso;
        log(`[DatetimeFix] Time-only detected: ${parsed.timeStr}`);
        log(`[DatetimeFix] Merged with existing date → ${newIso} (previous: ${previousDt})`);
        log('[State] Transition → confirm (time updated)');
        return { ...baseResult(), needsAvailabilityCheck: true, action: 'ask_confirmation', payload: { datetime: newIso } };
      }
    }

    if (ctx.booking_datetime?.includes('T') && parsed.dateStr && !parsed.timeStr && !parsed.iso) {
      log(`[BookingDatetime] Ignored invalid overwrite: date-only partial input preserved existing ${ctx.booking_datetime}`);
      return { ...baseResult(), response: `Confirma o agendamento para ${formatDatetimePT(ctx.booking_datetime)}? (Sim / Não)`, action: 'ask_confirmation', payload: { datetime: ctx.booking_datetime } };
    }

    // Confirmation — ALWAYS re-check availability before accepting
    if (isConfirmation(userMessage)) {
      log(`Decision: Confirmation received → re-check availability before accepting`);
      return { ...baseResult(), needsAvailabilityCheck: true, isConfirmationAttempt: true, action: 'ask_confirmation', payload: { datetime: ctx.booking_datetime } };
    }

    // Denial
    if (isDenial(userMessage)) {
      ctx.booking_datetime = null;
      ctx._bv2_selected_slot = null;
      ctx.step = 'ask_datetime';
      resetSuggestions(ctx);
      log('Decision: DENIED → reset');
      return { ...baseResult(), response: 'Sem problema. Para que dia e hora gostaria de marcar?', action: 'booking_denied', payload: {} };
    }

    // Unclear reply → re-ask confirmation
    log('Decision: Unclear → re-ask confirmation');
    return { ...baseResult(), response: `Confirma o agendamento para ${formatDatetimePT(ctx.booking_datetime!)}? (Sim / Não)`, action: 'ask_confirmation', payload: { datetime: ctx.booking_datetime } };
  }

  // Fallback
  return { ...baseResult(), response: 'Estou por aqui se precisar de alguma coisa.', action: 'fallback', payload: {} };
}

// ─── Edge Function Handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BookingV2Request = await req.json();
    const { conversation_id, empresa_id, user_message, context: incomingCtx } = body;

    console.log(`[BookingV2] ══════════════════════════════════════════════`);
    console.log(`[BookingV2] Request: conv=${conversation_id}, empresa=${empresa_id}`);
    console.log(`[BookingV2] User input: "${user_message}"`);
    console.log(`[BookingV2] Incoming context: step=${incomingCtx?.step}, booking_datetime=${incomingCtx?.booking_datetime}, pending_contact=${incomingCtx?.pending_contact}`);

    // Initialize context — handle migration from old string[] format to SuggestionSlot[]
    const rawSlots = incomingCtx?._bv2_suggested_slots;
    let migratedSlots: SuggestionSlot[] | null = null;
    if (Array.isArray(rawSlots) && rawSlots.length > 0) {
      if (typeof rawSlots[0] === 'string') {
        // Migrate from old string[] format
        console.log('[BookingV2] Migrating _bv2_suggested_slots from string[] to SuggestionSlot[]');
        migratedSlots = buildSuggestionSlots(rawSlots as string[]);
      } else {
        migratedSlots = rawSlots as SuggestionSlot[];
      }
    }

    const ctx: BookingV2Context = {
      booking_datetime: incomingCtx?.booking_datetime ?? null,
      customer_name: incomingCtx?.customer_name ?? null,
      customer_email: incomingCtx?.customer_email ?? null,
      customer_phone: incomingCtx?.customer_phone ?? null,
      service_id: incomingCtx?.service_id ?? null,
      step: incomingCtx?.step ?? 'ask_datetime',
      pending_contact: incomingCtx?.pending_contact ?? false,
      reschedule_target: incomingCtx?.reschedule_target ?? null,
      appointment_id: incomingCtx?.appointment_id ?? null,
      _acknowledged: incomingCtx?._acknowledged ?? false,
      reason: incomingCtx?.reason ?? null,
      _bv2_suggested_slots: migratedSlots,
      _bv2_waiting_slot_selection: incomingCtx?._bv2_waiting_slot_selection ?? false,
      _bv2_suggestion_retries: incomingCtx?._bv2_suggestion_retries ?? 0,
      _bv2_selected_slot: incomingCtx?._bv2_selected_slot ?? null,
    };

    // === BLOCK INVALID OVERWRITES ===
    if (ctx.booking_datetime && !ctx.booking_datetime.includes('T') && (ctx.step === 'confirm' || ctx.step === 'done')) {
      console.log(`[BookingDatetime] Ignored invalid overwrite: date-only "${ctx.booking_datetime}" in step="${ctx.step}" — clearing to force re-extraction`);
      ctx.booking_datetime = null;
      ctx._bv2_selected_slot = null;
      ctx.step = 'ask_datetime';
    }

    const supabase = getSupabase();

    // ── Lifecycle: Create or get active lifecycle for this conversation ──
    let lifecycleId: string | null = null;
    const existingLifecycle = await getActiveLifecycle(supabase, conversation_id);
    if (existingLifecycle) {
      lifecycleId = existingLifecycle.id;
      console.log(`[BookingV2] Active lifecycle found: ${lifecycleId} (state=${existingLifecycle.current_state})`);
    } else if (ctx.step === 'ask_datetime' || ctx.step === 'confirm') {
      const execId = `bv2_init_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
      const { lifecycle_id } = await createBookingLifecycle(supabase, {
        empresa_id,
        conversation_id,
        execution_id: execId,
        metadata: { source: 'booking-v2', reason: ctx.reason },
      });
      lifecycleId = lifecycle_id;
      console.log(`[BookingV2] Created new lifecycle: ${lifecycleId}`);
    }

    const parsedIncoming = extractBookingDatetimeParts(user_message);
    console.log(`[DatetimeFix] Parsed date=${parsedIncoming.dateStr ?? 'null'} time=${parsedIncoming.timeStr ?? 'null'}`);
    if (parsedIncoming.iso) {
      console.log(`[DatetimeFix] Final ISO datetime=${parsedIncoming.iso}`);
    }

    // Handle time-only input when we already have a date (with or without time)
    if (
      ctx.booking_datetime &&
      ctx.step === 'ask_datetime' &&
      parsedIncoming.timeStr &&
      !parsedIncoming.dateStr
    ) {
      const existingDatePart = ctx.booking_datetime.substring(0, 10);
      const previousDatetime = ctx.booking_datetime;
      ctx.booking_datetime = `${existingDatePart}T${parsedIncoming.timeStr}:00`;
      ctx._bv2_selected_slot = ctx.booking_datetime;
      console.log(`[DatetimeFix] Time-only detected: ${parsedIncoming.timeStr}`);
      console.log(`[DatetimeFix] Merged with existing date → ${ctx.booking_datetime} (previous: ${previousDatetime})`);
      console.log('[DatetimeFix] Step transition -> confirm');

      // Clear stale suggestions since we now have a full datetime
      resetSuggestions(ctx);

      // Check availability before confirming
const avail = await fetchAvailability(empresa_id, ctx.service_id, ctx.booking_datetime);

if (avail.available) {

  // STEP 1 — availability_checked
  if (lifecycleId) {
    await processBookingEvent(supabase, {
      lifecycle_id: lifecycleId,
      event_type: 'availability_checked',
      execution_id: `bv2_avail_${Date.now()}`,
      payload: { requested_slot: ctx.booking_datetime },
    });
  }

  // 🔥 STEP 2 — slot_selected (FALTAVA ISTO)
  if (lifecycleId) {
    await processBookingEvent(supabase, {
      lifecycle_id: lifecycleId,
      event_type: 'slot_selected',
      execution_id: `bv2_slot_${Date.now()}`,
      payload: { selected_slot: ctx.booking_datetime },
    });
  }

  // STEP 3 — confirmation_requested
  if (lifecycleId) {
    await processBookingEvent(supabase, {
      lifecycle_id: lifecycleId,
      event_type: 'confirmation_requested',
      execution_id: `bv2_confirm_${Date.now()}`,
      payload: { requested_slot: ctx.booking_datetime },
    });
  }

  ctx.step = 'confirm';

  return jsonResponse({
    response: `Perfeito, só para confirmar:\n\n📅 Data: ${formatDatetimePT(ctx.booking_datetime).split(' às ')[0]}\n⏰ Hora: ${formatTimePT(ctx.booking_datetime)}\n\nEstá tudo correto?`,
    context: ctx,
    booking_created: false,
    action: 'ask_confirmation',
    payload: { datetime: ctx.booking_datetime },
  });
}
      } else {
        // Store alternatives as structured suggestion slots
        if (avail.alternatives.length > 0) {
          ctx._bv2_suggested_slots = buildSuggestionSlots(avail.alternatives);
          ctx._bv2_waiting_slot_selection = true;
          ctx.step = 'ask_datetime';
        } else {
          ctx.step = 'confirm';
        }
        const altText = avail.alternatives.length > 0
          ? `\n\n${buildSuggestionSlots(avail.alternatives).map(s => `${s.index}. ${s.label}`).join('\n')}`
          : '\n\nInfelizmente não há mais horários disponíveis nesse dia.';
        return jsonResponse({
          response: `Esse horário não está disponível. Tenho estas alternativas:${altText}\n\nQual prefere?`,
          context: ctx,
          booking_created: false,
          action: 'show_alternatives',
          payload: { requested_datetime: ctx.booking_datetime, alternatives: avail.alternatives },
        });
      }
    }

    const result = processBookingV2(user_message, ctx);

    // ══════════════════════════════════════════════════════════════════════════
    // Proactive suggestion fetch (suggestion-first mode)
    // ══════════════════════════════════════════════════════════════════════════
    if (result.needsSuggestionFetch) {
      const slots = await fetchNextAvailableSlots(
        supabase, empresa_id, 3,
        result.suggestionPeriodFilter,
        result.suggestionForDate,
      );

      if (slots.length > 0) {
        const structuredSlots = buildSuggestionSlots(slots);
        result.context._bv2_suggested_slots = structuredSlots;
        result.context._bv2_waiting_slot_selection = true;
        const altText = formatSuggestionSlots(structuredSlots);

        if (result.action === 'acknowledge_and_ask_datetime') {
          result.response = `Percebo a situação. Vamos tratar disso.\n\nTenho disponibilidade em:\n${altText}\n\nQual prefere? 😊`;
        } else {
          result.response = `Tenho disponibilidade em:\n\n${altText}\n\nQual prefere? 😊`;
        }
        result.action = 'suggest_slots';
        result.payload = { suggestions: structuredSlots };
        console.log(`[Suggestions] slots generated: ${JSON.stringify(slots.map(s => s.substring(11, 16)))}`);
      } else {
        result.response = 'De momento não tenho disponibilidade nos próximos dias. Para que dia gostaria de marcar?';
        result.action = 'ask_datetime';
        result.payload = {};
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Reschedule availability check
    // ══════════════════════════════════════════════════════════════════════════
    if (result.needsAvailabilityCheck && result.context.step === 'reschedule_confirm' && result.context.reschedule_target) {
      const target = result.context.reschedule_target;
      const avail = await fetchAvailability(empresa_id, result.context.service_id, target);
      console.log(`[BookingV2] Reschedule availability: ${avail.available ? 'AVAILABLE' : 'CONFLICT'} for ${target}`);

      if (avail.available) {
        result.response = `Posso alterar o agendamento de ${formatDatetimePT(result.context.booking_datetime!)} para ${formatDatetimePT(target)}. Confirma a alteração? (Sim / Não)`;
        result.action = 'reschedule_ask_confirmation';
        result.payload = { original_datetime: result.context.booking_datetime, proposed_datetime: target };
      } else {
        const altText = avail.alternatives.length > 0
          ? `\n\nHorários disponíveis:\n${avail.alternatives.map((a, i) => `${i + 1}. ${formatTimePT(a)}`).join('\n')}`
          : '\n\nInfelizmente não há mais horários disponíveis nesse dia.';
        result.response = `Esse horário não está disponível.${altText}\n\nQual prefere?`;
        result.action = 'reschedule_show_alternatives';
        result.payload = { requested_datetime: target, alternatives: avail.alternatives };
        result.context.step = 'reschedule';
        result.context.reschedule_target = null;
      }

      return jsonResponse({
        response: result.response,
        context: result.context,
        booking_created: false,
        action: result.action,
        payload: result.payload,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Reschedule commit — update existing appointment
    // ══════════════════════════════════════════════════════════════════════════
    if (result.rescheduleCommit && result.context.reschedule_target && result.context.appointment_id) {
      const target = result.context.reschedule_target;
      const datePart = target.substring(0, 10);
      const timePart = target.includes('T') ? target.substring(11, 16) : '00:00';

      const finalCheck = await fetchAvailability(empresa_id, result.context.service_id, target);
      if (!finalCheck.available) {
        console.log('[BookingV2] Reschedule race condition — slot taken');
        result.context.step = 'reschedule';
        result.context.reschedule_target = null;
        return jsonResponse({
          response: 'Lamentamos, esse horário foi ocupado entretanto. Para que outro horário pretende alterar?',
          context: result.context,
          booking_created: false,
          action: 'reschedule_race_condition',
          payload: { requested_datetime: target },
        });
      }

      const { error } = await supabase
        .from('agendamentos')
        .update({ data: datePart, hora: timePart, start_datetime: target, updated_at: new Date().toISOString() })
        .eq('id', result.context.appointment_id)
        .eq('empresa_id', empresa_id);

      if (error) {
        console.error('[BookingV2] Reschedule DB error:', error);
        return jsonResponse({
          response: 'Ocorreu um erro ao alterar o agendamento. Por favor tente novamente.',
          context: result.context,
          booking_created: false,
          action: 'reschedule_error',
          payload: { error: 'db_update_failed' },
        });
      }

      console.log(`[BookingV2] Reschedule confirmed and committed: ${result.context.booking_datetime} → ${target}`);
      const originalDt = result.context.booking_datetime;
      result.context.booking_datetime = target;
      result.context.reschedule_target = null;
      result.context.step = 'done';

      return jsonResponse({
        response: `O seu agendamento foi alterado com sucesso para ${formatDatetimePT(target)}! ✅`,
        context: result.context,
        booking_created: false,
        action: 'reschedule_confirmed',
        payload: { original_datetime: originalDt, new_datetime: target },
      });
    }

    // Handle reschedule commit without appointment_id — find it from DB
    if (result.rescheduleCommit && result.context.reschedule_target && !result.context.appointment_id) {
      const origDt = result.context.booking_datetime;
      if (origDt) {
        const origDate = origDt.substring(0, 10);
        const origTime = origDt.includes('T') ? origDt.substring(11, 16) : '00:00';
        const { data: appts } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('data', origDate)
          .eq('hora', origTime)
          .in('estado', ['pendente', 'confirmado'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (appts && appts.length > 0) {
          result.context.appointment_id = appts[0].id;
          console.log(`[BookingV2] Found appointment for reschedule: ${appts[0].id}`);

          const target = result.context.reschedule_target!;
          const datePart = target.substring(0, 10);
          const timePart = target.includes('T') ? target.substring(11, 16) : '00:00';

          const finalCheck = await fetchAvailability(empresa_id, result.context.service_id, target);
          if (!finalCheck.available) {
            result.context.step = 'reschedule';
            result.context.reschedule_target = null;
            return jsonResponse({
              response: 'Lamentamos, esse horário foi ocupado entretanto. Para que outro horário pretende alterar?',
              context: result.context,
              booking_created: false,
              action: 'reschedule_race_condition',
              payload: { requested_datetime: target },
            });
          }

          const { error } = await supabase
            .from('agendamentos')
            .update({ data: datePart, hora: timePart, start_datetime: target, updated_at: new Date().toISOString() })
            .eq('id', result.context.appointment_id)
            .eq('empresa_id', empresa_id);

          if (error) {
            console.error('[BookingV2] Reschedule DB error:', error);
            return jsonResponse({
              response: 'Ocorreu um erro ao alterar o agendamento. Por favor tente novamente.',
              context: result.context,
              booking_created: false,
              action: 'reschedule_error',
              payload: { error: 'db_update_failed' },
            });
          }

          console.log(`[BookingV2] Reschedule confirmed and committed (auto-found): ${origDt} → ${target}`);
          result.context.booking_datetime = target;
          result.context.reschedule_target = null;
          result.context.step = 'done';

          return jsonResponse({
            response: `O seu agendamento foi alterado com sucesso para ${formatDatetimePT(target)}! ✅`,
            context: result.context,
            booking_created: false,
            action: 'reschedule_confirmed',
            payload: { original_datetime: origDt, new_datetime: target },
          });
        } else {
          console.warn('[BookingV2] Could not find appointment to reschedule');
          result.context.step = 'done';
          result.context.reschedule_target = null;
          return jsonResponse({
            response: 'Não foi possível encontrar o agendamento para alterar. Pode contactar-nos diretamente para assistência.',
            context: result.context,
            booking_created: false,
            action: 'reschedule_not_found',
            payload: {},
          });
        }
      }
    }

    // ── Availability check — SINGLE gate for all booking creation ──
    if (result.needsAvailabilityCheck && result.context.booking_datetime) {
      const avail = await fetchAvailability(empresa_id, result.context.service_id, result.context.booking_datetime);
      console.log(`[Validation] result: availability=${avail.available ? 'AVAILABLE' : 'CONFLICT'} | isConfirmationAttempt: ${result.isConfirmationAttempt} | booking_datetime: ${result.context.booking_datetime}`);

      if (avail.available) {
        if (result.isConfirmationAttempt) {
          if (!hasRequiredContact(result.context)) {
            result.context.pending_contact = true;
            console.log(`[BookingV2] CONFIRMED but missing contact → ask`);
            result.response = getMissingContactMessage(result.context);
            result.action = 'ask_contact';
            const missingFields: string[] = [];
            if (!result.context.customer_name) missingFields.push('name');
            if (!result.context.customer_email && !result.context.customer_phone) missingFields.push('contact');
            result.payload = { missing: missingFields, datetime: result.context.booking_datetime };
          } else {
            result.context.step = 'done';
            console.log(`[BookingV2] CONFIRMED + AVAILABLE → create booking for ${result.context.booking_datetime}`);
            result.response = `Agendamento confirmado com sucesso! ✅\n\nVai receber um email com todos os detalhes. Se precisar de alterar alguma coisa, estou por aqui.`;
            result.createBooking = true;
            result.action = 'booking_confirmed';
            result.payload = { datetime: result.context.booking_datetime, customer_name: result.context.customer_name };
          }
        } else {
          result.response = `Perfeito, só para confirmar:\n\n📅 Data: ${formatDatetimePT(result.context.booking_datetime).split(' às ')[0]}\n⏰ Hora: ${formatTimePT(result.context.booking_datetime)}\n\nEstá tudo correto?`;
          result.action = 'ask_confirmation';
          result.payload = { datetime: result.context.booking_datetime };
        }
      } else {
        // CONFLICT: store alternatives as structured slots
        const structuredAlts = buildSuggestionSlots(avail.alternatives);
        const altList = structuredAlts.length > 0
          ? `\n\n${formatSuggestionSlots(structuredAlts)}`
          : '\n\nInfelizmente não há mais horários disponíveis nesse dia.';
        result.response = `Esse horário não está disponível. Tenho estas alternativas:${altList}\n\nQual prefere?`;
        result.action = 'show_alternatives';
        result.payload = { requested_datetime: result.context.booking_datetime, alternatives: structuredAlts };
        // Store alternatives for slot selection
        if (structuredAlts.length > 0) {
          result.context._bv2_suggested_slots = structuredAlts;
          result.context._bv2_waiting_slot_selection = true;
          result.context._bv2_selected_slot = null;
          result.context.step = 'ask_datetime';
        }
      }
    }

    const dt = result.context.booking_datetime;
const datePart = dt.substring(0, 10);
const timePart = dt.substring(11, 16);

const { error, data } = await supabase
  .from('agendamentos')
  .insert({
    empresa_id,
    data: datePart,
    hora: timePart,
    start_datetime: dt,
    customer_name: result.context.customer_name,
    customer_email: result.context.customer_email,
    customer_phone: result.context.customer_phone,
    service_id: result.context.service_id,
    estado: 'confirmado',
  })
  .select()
  .single();

if (error) {
  console.error('[BookingV2] Direct DB error:', error);

  return jsonResponse({
    response: 'Ocorreu um erro ao criar o agendamento. Por favor tente novamente.',
    context: result.context,
    booking_created: false,
    action: 'booking_error',
    payload: { error: 'db_insert_failed' },
  });
}

console.log('[BookingV2] ✅ Booking created directly:', data.id);

result.context.appointment_id = data.id;

        // Ensure confirmation requested
        preEvents.push({
          event: 'confirmation_requested',
          payload: { selected_slot: dt },
        });

        // Process pre-events to advance lifecycle state
        for (const pe of preEvents) {
          const preExecId = `bv2_pre_${pe.event}_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
          const preResult = await processBookingEvent(supabase, {
            lifecycle_id: lifecycleId,
            event_type: pe.event,
            payload: pe.payload,
            execution_id: preExecId,
          });
          if (!preResult.success) {
            console.log(`[BookingV2] Lifecycle pre-event ${pe.event} skipped: ${preResult.error_code} (non-blocking)`);
          }
        }

        // Now process the actual confirmation
        const commitResult = await processBookingEvent(supabase, {
          lifecycle_id: lifecycleId,
          event_type: 'user_confirmed',
          payload: {
            selected_slot: dt,
            customer_name: result.context.customer_name,
            customer_email: result.context.customer_email,
            customer_phone: result.context.customer_phone,
            service_id: result.context.service_id,
          },
          execution_id: execId,
        });

        if (commitResult.success) {
          console.log(`[BookingV2] ✅ Booking committed via lifecycle: appointment=${commitResult.appointment_id}`);
          if (commitResult.appointment_id) {
            result.context.appointment_id = commitResult.appointment_id;
          }
          if (!result.context.service_id) {
            console.warn('[BookingV2] ⚠ Booking created without service_id');
          }
        } else if (commitResult.error_code === 'slot_conflict') {
          console.log('[BookingV2] Race condition caught via lifecycle — slot taken');
          result.response = 'Lamentamos, esse horário foi ocupado entretanto. Por favor escolha outro horário.';
          result.context.step = 'confirm';
          result.createBooking = false;
          result.action = 'race_condition';
          result.payload = { requested_datetime: dt };
        } else {
          console.error(`[BookingV2] Lifecycle commit failed: ${commitResult.error_code} — ${commitResult.error_message}`);
          result.response = 'Ocorreu um erro ao criar o agendamento. Por favor tente novamente.';
          result.context.step = 'confirm';
          result.action = 'booking_error';
          result.payload = { error: commitResult.error_code || 'lifecycle_commit_failed' };
        }
      } else {
        console.error('[BookingV2] ❌ Missing lifecycleId — booking blocked');

        return jsonResponse({
          response: 'Ocorreu um erro ao processar o agendamento. Vamos tentar novamente.',
          context: result.context,
          booking_created: false,
          action: 'booking_error',
          payload: { error: 'missing_lifecycle' },
        });
      }
    }

    // ── Deterministic Response Variation Layer ──
    let finalResponse = result.response;
    if (
      result.action &&
      VARIATABLE_ACTIONS.has(result.action) &&
      isGenericResponse(result.response)
    ) {
      const varied = getActionResponse(result.action, result.payload);
      if (varied) {
        console.log(`[ResponseVariation] Action=${result.action} → applied variation`);
        finalResponse = varied;
      }
    }

    // ── Optional LLM Response Refinement Layer ──
    const LLM_REFINABLE_ACTIONS = new Set([
      'acknowledge_and_ask_datetime',
      'ask_datetime',
      'ask_confirmation',
      'ask_contact',
      'booking_confirmed',
      'already_done',
    ]);

    if (
      finalResponse &&
      finalResponse.length >= 20 &&
      result.action &&
      LLM_REFINABLE_ACTIONS.has(result.action)
    ) {
      finalResponse = await refineLLMResponse(finalResponse, result.action, result.payload);
    }

    console.log(`[BookingV2] ══════════════════════════════════════════════`);
    console.log(`[BookingV2] Final state: step=${result.context.step}, booking_datetime=${result.context.booking_datetime}, selected_slot=${result.context._bv2_selected_slot}, action=${result.action}`);
    console.log(`[BookingV2] Final response: "${finalResponse?.substring(0, 80)}..."`);
    console.log(`[BookingV2] ══════════════════════════════════════════════`);

    return jsonResponse({
      response: finalResponse,
      context: result.context,
      booking_created: result.createBooking,
      action: result.action,
      payload: result.payload,
    });
  } catch (err) {
    console.error('[BookingV2] Unhandled error:', err);
    return jsonResponse({
      response: 'Ocorreu um erro inesperado. Por favor tente novamente.',
      context: null,
      booking_created: false,
      action: 'booking_error',
      payload: { error: 'unhandled_exception' },
    });
  }
});


// ─── Helper ──────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function jsonResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

