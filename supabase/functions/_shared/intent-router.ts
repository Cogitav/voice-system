/**
 * Intent Router Layer v1.0
 *
 * Deterministic intent classification for all conversation channels
 * (chat, voice, widgets). Runs BEFORE the service resolver and booking pipeline.
 *
 * This module ONLY classifies intent and sets current_intent.
 * It does NOT modify: service_id, booking_in_progress, conversation_state.
 */

// =============================================
// Platform Intents
// =============================================

export enum Intent {
  BOOKING_NEW = 'BOOKING_NEW',
  BOOKING_RESCHEDULE = 'BOOKING_RESCHEDULE',
  BOOKING_CANCEL = 'BOOKING_CANCEL',
  AVAILABILITY_REQUEST = 'AVAILABILITY_REQUEST',
  PRICE_REQUEST = 'PRICE_REQUEST',
  HUMAN_ESCALATION = 'HUMAN_ESCALATION',
  COMMERCIAL_INFO = 'COMMERCIAL',
  SUPPORT = 'SUPPORT',
  OTHER = 'OTHER',
}

// =============================================
// Keyword Dictionaries
// =============================================

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  [Intent.BOOKING_NEW]: [
    'marcar', 'agendar', 'consulta', 'reuniao', 'appointment', 'booking',
    'visita', 'reservar', 'marcacao', 'agendamento',
  ],
  [Intent.BOOKING_RESCHEDULE]: [
    'reagendar', 'alterar data', 'mudar horario', 'trocar data',
    'mudar data', 'alterar horario',
  ],
  [Intent.BOOKING_CANCEL]: [
    'cancelar', 'anular', 'desmarcar',
  ],
  [Intent.AVAILABILITY_REQUEST]: [
    'disponibilidade', 'disponivel', 'quando posso', 'quando podem',
    'horarios disponiveis', 'vagas', 'livre', 'quando tem', 'quando ha',
    'proxima vaga', 'proximo horario',
    'de manha', 'da manha', 'pela manha', 'de tarde', 'da tarde', 'pela tarde',
  ],
  [Intent.PRICE_REQUEST]: [
    'preco', 'quanto custa', 'valor', 'custo', 'price',
    'quanto pago', 'mensalidade', '€', 'euros',
  ],
  [Intent.HUMAN_ESCALATION]: [
    'falar com alguem', 'falar com humano', 'atendimento humano',
    'operador', 'humano', 'falar com a equipa', 'ligar para alguem',
    'falar com pessoa',
  ],
  [Intent.COMMERCIAL_INFO]: [
    'informacao', 'informacoes', 'saber mais', 'explicar', 'como funciona',
    'planos', 'horarios', 'servicos', 'tabela',
  ],
  [Intent.SUPPORT]: [
    'problema', 'erro', 'ajuda tecnica', 'nao funciona', 'bug',
  ],
  [Intent.OTHER]: [],
};

// =============================================
// Booking Intent Family
// =============================================

export const BOOKING_INTENT_FAMILY = new Set<Intent>([
  Intent.BOOKING_NEW,
  Intent.BOOKING_RESCHEDULE,
  Intent.BOOKING_CANCEL,
  Intent.AVAILABILITY_REQUEST,
]);

export function isBookingIntent(intent: Intent): boolean {
  return BOOKING_INTENT_FAMILY.has(intent);
}

// =============================================
// Deterministic Classification
// =============================================

function normalizeForIntent(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s€]/g, '')
    .trim();
}

/**
 * Tier 1 — Deterministic keyword scoring.
 * Returns the intent if a clear winner exists, or null if ambiguous.
 */
export function classifyIntentDeterministic(message: string): Intent | null {
  const normalized = normalizeForIntent(message);

  const scores: Record<string, number> = {};
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        score += kw.split(' ').length > 1 ? 15 : 10;
      }
    }
    scores[intent] = score;
  }

  const sorted = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0][0] as Intent;
  if (sorted[0][1] - sorted[1][1] >= 5) return sorted[0][0] as Intent;

  return null;
}

/**
 * Full intent classification — deterministic only.
 * If no clear match, returns OTHER.
 */
export function classifyIntent(message: string): Intent {
  const deterministic = classifyIntentDeterministic(message);
  if (deterministic) {
    console.log(`[IntentRouter] Deterministic: ${deterministic}`);
    return deterministic;
  }
  console.log('[IntentRouter] No deterministic match — returning OTHER');
  return Intent.OTHER;
}

// =============================================
// Routing Decision
// =============================================

export type IntentRoute =
  | 'price_engine'
  | 'booking_pipeline'
  | 'human_handoff'
  | 'knowledge_base'
  | 'ai_conversation';

/**
 * Maps a classified intent to a routing destination.
 * This is a pure function — no side effects.
 */
export function routeIntent(intent: Intent): IntentRoute {
  switch (intent) {
    case Intent.PRICE_REQUEST:
      return 'price_engine';
    case Intent.BOOKING_NEW:
    case Intent.BOOKING_RESCHEDULE:
    case Intent.BOOKING_CANCEL:
    case Intent.AVAILABILITY_REQUEST:
      return 'booking_pipeline';
    case Intent.HUMAN_ESCALATION:
      return 'human_handoff';
    case Intent.COMMERCIAL_INFO:
      return 'knowledge_base';
    case Intent.SUPPORT:
    case Intent.OTHER:
    default:
      return 'ai_conversation';
  }
}

// =============================================
// Router Entry Point
// =============================================

export interface IntentRouterResult {
  intent: Intent;
  route: IntentRoute;
  isBooking: boolean;
}

/**
 * Single entry point for the intent router.
 * Classifies the message and returns the routing decision.
 *
 * Does NOT modify any context or state — caller is responsible for that.
 */
export function runIntentRouter(message: string): IntentRouterResult {
  const intent = classifyIntent(message);
  const route = routeIntent(intent);
  const booking = isBookingIntent(intent);

  console.log(`[IntentRouter] Result: intent=${intent}, route=${route}, isBooking=${booking}`);

  return { intent, route, isBooking: booking };
}
