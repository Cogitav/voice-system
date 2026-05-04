/**
 * send-booking-reminders — Booking Reminder MVP (manual trigger).
 *
 * Sends a reminder email for confirmed bookings whose start_datetime falls
 * within each empresa's reminder window (booking_configuration.reminder_hours_before).
 *
 * Idempotency:
 *   - The query filters reminder_sent = false, so each agendamento is a
 *     candidate at most once.
 *   - reminder_sent flips to true ONLY after the email send succeeds.
 *     A failed send leaves reminder_sent = false so the next manual run
 *     retries the appointment (or it can be inspected via email_logs).
 *
 * Auth: admin role required (mirrors create-user / manage-ai-provider pattern).
 *
 * Request body (optional):
 *   { empresa_id?: string, max_days_ahead?: number, dry_run?: boolean }
 *
 * Response:
 *   { processed, sent, failed, skipped, results }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendBookingConfirmationEmail } from '../_shared/booking-email.ts';
import type { ConversationContext } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_REMINDER_HOURS_BEFORE = 24;
const MAX_DAYS_AHEAD_HARDCAP = 7; // safety cap on the bulk query window

interface ReminderResult {
  agendamento_id: string;
  empresa_id: string;
  outcome: 'sent' | 'skipped' | 'failed';
  reason?: string;
  detail?: string;
}

interface BookingConfigRow {
  empresa_id: string;
  reminder_enabled: boolean | null;
  reminder_hours_before: number | null;
}

interface AgendamentoRow {
  id: string;
  empresa_id: string;
  service_id: string | null;
  start_datetime: string;
  data: string;
  hora: string;
  cliente_email: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  scheduling_state: string;
  reminder_sent: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ─── Admin auth check (server-side, RPC-based) ─────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: roleData, error: roleError } = await supabaseUser.rpc('get_current_user_role');
    if (roleError) {
      console.error('[BOOKING_REMINDERS_AUTH_ERROR]', roleError);
      return jsonResponse({ error: 'Failed to verify role' }, 500);
    }
    if (roleData !== 'admin') {
      return jsonResponse({ error: 'Apenas administradores podem disparar lembretes' }, 403);
    }

    // ─── Parse optional body params ────────────────────────────────────────
    let body: { empresa_id?: string; max_days_ahead?: number; dry_run?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body → treat as defaults.
    }

    const dryRun = body.dry_run === true;
    const maxDaysAhead = clampNumber(body.max_days_ahead, 1, MAX_DAYS_AHEAD_HARDCAP, MAX_DAYS_AHEAD_HARDCAP);
    const empresaFilter = typeof body.empresa_id === 'string' && body.empresa_id.length > 0
      ? body.empresa_id
      : null;

    // ─── Service-role client (bypasses RLS for the cross-empresa scan) ────
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowIso = now.toISOString();
    const maxWindowEnd = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000).toISOString();

    // ─── 1. Bulk-fetch candidate agendamentos within the global window ────
    // Per-empresa filtering by their actual reminder_hours_before is done
    // client-side after this query, using the booking_configuration map.
    let query = db
      .from('agendamentos')
      .select(
        'id, empresa_id, service_id, start_datetime, data, hora, cliente_email, cliente_nome, cliente_telefone, scheduling_state, reminder_sent',
      )
      .eq('scheduling_state', 'confirmed')
      .eq('reminder_sent', false)
      .gt('start_datetime', nowIso)
      .lte('start_datetime', maxWindowEnd);

    if (empresaFilter) query = query.eq('empresa_id', empresaFilter);

    const { data: candidates, error: candidatesError } = await query;
    if (candidatesError) {
      console.error('[BOOKING_REMINDERS_QUERY_FAILED]', candidatesError);
      return jsonResponse({ error: 'Failed to fetch agendamentos', detail: candidatesError.message }, 500);
    }

    const rows = (candidates ?? []) as AgendamentoRow[];
    if (rows.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0, results: [], dry_run: dryRun }, 200);
    }

    // ─── 2. Fetch booking_configuration for the involved empresas ─────────
    const empresaIds = Array.from(new Set(rows.map((r) => r.empresa_id)));
    const { data: configs } = await db
      .from('booking_configuration')
      .select('empresa_id, reminder_enabled, reminder_hours_before')
      .in('empresa_id', empresaIds);

    const configMap = new Map<string, BookingConfigRow>();
    for (const cfg of (configs ?? []) as BookingConfigRow[]) {
      configMap.set(cfg.empresa_id, cfg);
    }

    // ─── 3. Per-empresa filter using each empresa's reminder window ───────
    const effectiveCandidates = rows.filter((row) => {
      const cfg = configMap.get(row.empresa_id);
      const enabled = cfg?.reminder_enabled ?? true;
      if (!enabled) return false;
      const hoursBefore = cfg?.reminder_hours_before ?? DEFAULT_REMINDER_HOURS_BEFORE;
      const cutoff = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
      return new Date(row.start_datetime) <= cutoff;
    });

    // ─── 4. For each candidate: resolve email, send, flip on success ──────
    const results: ReminderResult[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of effectiveCandidates) {
      const result = await processOne(db, row, dryRun);
      results.push(result);
      if (result.outcome === 'sent') sent++;
      else if (result.outcome === 'failed') failed++;
      else skipped++;
    }

    return jsonResponse(
      {
        processed: effectiveCandidates.length,
        sent,
        failed,
        skipped,
        results,
        dry_run: dryRun,
      },
      200,
    );
  } catch (error) {
    console.error('[BOOKING_REMINDERS_ERROR]', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});

async function processOne(
  // deno-lint-ignore no-explicit-any
  db: any,
  row: AgendamentoRow,
  dryRun: boolean,
): Promise<ReminderResult> {
  // Resolve recipient email. Prefer the agendamento's own field; fall back
  // to the customers table by phone (legacy bookings often have NULL
  // cliente_email but a populated phone).
  let recipientEmail = row.cliente_email?.trim() ?? '';
  let customerName = row.cliente_nome?.trim() ?? '';
  let customerPhone = row.cliente_telefone?.trim() ?? '';

  if (!recipientEmail && customerPhone) {
    const { data: customer } = await db
      .from('customers')
      .select('email, name')
      .eq('empresa_id', row.empresa_id)
      .eq('phone', customerPhone)
      .limit(1)
      .maybeSingle();
    if (customer?.email) {
      recipientEmail = String(customer.email).trim();
      if (!customerName && customer.name) customerName = String(customer.name);
    }
  }

  if (!recipientEmail) {
    return {
      agendamento_id: row.id,
      empresa_id: row.empresa_id,
      outcome: 'skipped',
      reason: 'missing_customer_email',
    };
  }

  // Resolve service name for the {{intent}} / {{servico_nome}} replacements.
  let serviceName: string | null = null;
  if (row.service_id) {
    const { data: service } = await db
      .from('scheduling_services')
      .select('name')
      .eq('id', row.service_id)
      .maybeSingle();
    serviceName = service?.name ?? null;
  }

  // Build a minimal pseudo-context — sendBookingConfirmationEmail only reads
  // customer_email/name/phone/service_name from the context.
  const pseudoContext = {
    customer_email: recipientEmail,
    customer_name: customerName || null,
    customer_phone: customerPhone || null,
    service_name: serviceName,
    confirmed_snapshot: null,
  } as unknown as ConversationContext;

  const dataAgendamento = row.data || row.start_datetime.slice(0, 10);
  const horaAgendamento = (row.hora || (row.start_datetime.match(/T(\d{2}:\d{2})/)?.[1] ?? '')).slice(0, 5);

  if (dryRun) {
    return {
      agendamento_id: row.id,
      empresa_id: row.empresa_id,
      outcome: 'skipped',
      reason: 'dry_run',
      detail: `would send to ${recipientEmail}`,
    };
  }

  // Use a fresh per-event cutoff so the booking-email idempotency window
  // (which would otherwise see the original confirmation email) does not
  // mistakenly skip the reminder.
  const eventCutoffAt = new Date().toISOString();

  const outcome = await sendBookingConfirmationEmail({
    db,
    context: pseudoContext,
    empresaId: row.empresa_id,
    bookingId: row.id,
    eventCutoffAt,
    dataAgendamento,
    horaAgendamento,
    conversationId: 'booking-reminder',
  });

  if (!outcome.sent) {
    return {
      agendamento_id: row.id,
      empresa_id: row.empresa_id,
      outcome: outcome.reason === 'send_failed' || outcome.reason === 'unexpected_error' ? 'failed' : 'skipped',
      reason: outcome.reason,
      detail: outcome.detail,
    };
  }

  // Flip reminder_sent only after success. We additionally guard against
  // races by checking reminder_sent = false in the UPDATE WHERE clause.
  const { error: updateError } = await db
    .from('agendamentos')
    .update({
      reminder_sent: true,
      reminder_sent_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('reminder_sent', false);

  if (updateError) {
    console.warn('[BOOKING_REMINDER_FLAG_UPDATE_FAILED]', {
      agendamento_id: row.id,
      error: updateError.message,
    });
    // The email did go out and is logged. We just couldn't flip the flag.
    return {
      agendamento_id: row.id,
      empresa_id: row.empresa_id,
      outcome: 'sent',
      reason: 'flag_update_failed',
      detail: updateError.message,
    };
  }

  return {
    agendamento_id: row.id,
    empresa_id: row.empresa_id,
    outcome: 'sent',
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
