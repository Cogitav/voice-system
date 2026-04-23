import { getServiceClient } from './supabase-client.ts';
import { CREDIT_COSTS, CREDIT_THRESHOLDS } from './constants.ts';
import { CreditCheck } from './types.ts';

type CreditAction = keyof typeof CREDIT_COSTS;

export async function checkCredits(empresaId: string, action: CreditAction): Promise<CreditCheck> {
  const cost = CREDIT_COSTS[action];

  if (cost === 0) {
    return { allowed: true, remaining: 999999, reason: null };
  }

  const db = getServiceClient();
  const month = new Date().toISOString().slice(0, 7);

  const { data, error } = await db
    .from('credits_usage')
    .select('credits_used, credits_limit, extra_credits')
    .eq('empresa_id', empresaId)
    .eq('month', month)
    .single();

  if (error || !data) {
    // No record = new month, allow with default limit
    return { allowed: true, remaining: 1000 - cost, reason: null };
  }

  const total_limit = (data.credits_limit ?? 1000) + (data.extra_credits ?? 0);
  const used = data.credits_used ?? 0;
  const remaining = total_limit - used;

  if (remaining < cost) {
    return {
      allowed: false,
      remaining,
      reason: 'Créditos insuficientes para esta operação.',
    };
  }

  return { allowed: true, remaining: remaining - cost, reason: null };
}

export async function consumeCredits(
  empresaId: string,
  action: CreditAction,
  referenceId?: string
): Promise<void> {
  const cost = CREDIT_COSTS[action];
  if (cost === 0) return;

  const db = getServiceClient();
  const month = new Date().toISOString().slice(0, 7);

  // Insert credit event
  await db.from('credits_events').insert({
    empresa_id: empresaId,
    event_type: action === 'message' ? 'message' : action === 'email_send' ? 'email' : 'other',
    credits_consumed: cost,
    reference_id: referenceId ?? null,
    metadata: { action },
  });

  // Upsert monthly usage
  const { data: existing } = await db
    .from('credits_usage')
    .select('id, credits_used')
    .eq('empresa_id', empresaId)
    .eq('month', month)
    .single();

  if (existing) {
    await db
      .from('credits_usage')
      .update({ credits_used: existing.credits_used + cost })
      .eq('empresa_id', empresaId)
      .eq('month', month);
  } else {
    await db.from('credits_usage').insert({
      empresa_id: empresaId,
      month,
      credits_used: cost,
      credits_limit: 1000,
      extra_credits: 0,
    });
  }

  // Check thresholds and notify if needed
  await checkAndNotifyThresholds(empresaId, month);
}

async function checkAndNotifyThresholds(empresaId: string, month: string): Promise<void> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from('credits_usage')
      .select('credits_used, credits_limit, extra_credits')
      .eq('empresa_id', empresaId)
      .eq('month', month)
      .single();

    if (!data) return;

    const total = (data.credits_limit ?? 1000) + (data.extra_credits ?? 0);
    const ratio = data.credits_used / total;

    let threshold_type: string | null = null;
    if (ratio >= CREDIT_THRESHOLDS.critical) threshold_type = 'critical';
    else if (ratio >= CREDIT_THRESHOLDS.warning) threshold_type = 'warning';
    else if (ratio >= CREDIT_THRESHOLDS.soft) threshold_type = 'soft';

    if (!threshold_type) return;

    // Check if already notified this threshold this month
    const { data: existing } = await db
      .from('credit_notifications')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('month', month)
      .eq('notification_type', threshold_type)
      .single();

    if (existing) return;

    // Register notification (email sending handled by send-credit-alert-email function)
    await db.from('credit_notifications').insert({
      empresa_id: empresaId,
      notification_type: threshold_type,
      threshold_percentage: Math.round(ratio * 100),
      month,
      credits_used: data.credits_used,
      limit_at_notification: total,
    });
  } catch {
    // Never throw from threshold check
  }
}
