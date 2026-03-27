/**
 * Follow-Up Rules Engine
 *
 * Evaluates active follow-up rules for a given empresa + intent,
 * loads configured email templates from DB, and sends emails via EmailEngine.
 *
 * This is the ONLY module responsible for executing post-event actions.
 * Does NOT modify: booking engine, state machine, intent router.
 */

import { sendPlatformEmail } from './email-engine.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// =============================================
// Types
// =============================================

export interface FollowUpEventPayload {
  cliente_nome?: string;
  empresa_nome?: string;
  servico_nome?: string;
  data_agendamento?: string;
  hora_agendamento?: string;
  resumo_atendimento?: string;
  contacto_empresa?: string;
  email?: string;
  [key: string]: string | undefined;
}

export interface ExecuteFollowUpParams {
  empresa_id: string;
  intent: string;
  payload: FollowUpEventPayload;
  supabase: SupabaseClient;
}

interface FollowUpRule {
  id: string;
  empresa_id: string;
  intent: string;
  send_email_client: boolean;
  send_email_company: boolean;
  client_template_id: string | null;
  company_template_id: string | null;
  company_notification_email: string | null;
  is_active: boolean;
}

interface EmailTemplate {
  id: string;
  subject: string;
  body: string;
  intent: string;
  recipient_type: string;
}

// =============================================
// Template Variable Interpolation
// =============================================

function interpolateTemplate(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    result = result.replace(regex, value || '-');
  }
  // Also support {key} syntax
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value || '-');
  }
  return result;
}

// =============================================
// Email Logging
// =============================================

async function logFollowUpEmail(
  supabase: SupabaseClient,
  empresaId: string,
  templateId: string | null,
  recipientEmail: string,
  emailType: string,
  subject: string,
  body: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
): Promise<void> {
  try {
    await supabase.from('email_logs').insert({
      empresa_id: empresaId,
      template_id: templateId,
      recipient_email: recipientEmail,
      subject,
      body,
      status,
      error_message: errorMessage || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.warn('[FollowUpEngine] Email log insert failed (non-blocking):', e);
  }
}

// =============================================
// Main Engine
// =============================================

/**
 * Evaluate and execute follow-up rules for a given empresa + intent.
 * Fire-and-forget — never throws.
 */
export async function executeFollowUpRules(params: ExecuteFollowUpParams): Promise<void> {
  const { empresa_id, intent, payload, supabase } = params;

  console.log(`[FollowUpEngine] Evaluating rules for empresa=${empresa_id}, intent=${intent}`);

  try {
    // 1. Find active rules for this empresa + intent
    const { data: rules, error: rulesError } = await supabase
      .from('follow_up_rules')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('intent', intent)
      .eq('is_active', true);

    if (rulesError) {
      console.error('[FollowUpEngine] Failed to fetch rules:', rulesError);
      return;
    }

    if (!rules || rules.length === 0) {
      console.log(`[FollowUpEngine] No active rules for intent="${intent}" — skipping`);
      return;
    }

    // Build template variables
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) vars[k] = v;
    }

    for (const rule of rules as FollowUpRule[]) {
      console.log(`[FollowUpEngine] Processing rule ${rule.id}: send_client=${rule.send_email_client}, send_company=${rule.send_email_company}`);

      // 2a. Send email to client
      if (rule.send_email_client && payload.email) {
        await sendTemplateEmail(
          supabase,
          empresa_id,
          rule.client_template_id,
          payload.email,
          vars,
          'cliente',
        );
      }

      // 2b. Send email to company
      if (rule.send_email_company && rule.company_notification_email) {
        await sendTemplateEmail(
          supabase,
          empresa_id,
          rule.company_template_id,
          rule.company_notification_email,
          vars,
          'empresa',
        );
      }
    }

    console.log(`[FollowUpEngine] Completed processing ${rules.length} rule(s)`);
  } catch (err) {
    console.error('[FollowUpEngine] Error:', err);
  }
}

/**
 * Load a template from DB, interpolate variables, and send via EmailEngine.
 */
async function sendTemplateEmail(
  supabase: SupabaseClient,
  empresaId: string,
  templateId: string | null,
  recipientEmail: string,
  vars: Record<string, string>,
  emailType: string,
): Promise<void> {
  if (!templateId) {
    console.log(`[FollowUpEngine] No template configured for ${emailType} — skipping`);
    return;
  }

  try {
    // Load template from DB
    const { data: template, error: tplError } = await supabase
      .from('email_templates')
      .select('id, subject, body, intent, recipient_type')
      .eq('id', templateId)
      .eq('is_active', true)
      .maybeSingle();

    if (tplError || !template) {
      console.warn(`[FollowUpEngine] Template ${templateId} not found or inactive`);
      await logFollowUpEmail(supabase, empresaId, templateId, recipientEmail, emailType, '-', '-', 'failed', 'Template not found or inactive');
      return;
    }

    const tpl = template as EmailTemplate;

    // Interpolate variables
    const subject = interpolateTemplate(tpl.subject, vars);
    const body = interpolateTemplate(tpl.body, vars);

    // Send via EmailEngine
    const result = await sendPlatformEmail({
      empresa_id: empresaId,
      template: 'booking_confirmation', // template key is irrelevant — we pass interpolated content
      to: recipientEmail,
      variables: {
        ...vars,
        _override_subject: subject,
        _override_body: body,
      },
      supabase,
    });

    // Log to email_logs with template_id
    await logFollowUpEmail(
      supabase,
      empresaId,
      tpl.id,
      recipientEmail,
      emailType,
      subject,
      body,
      result.success ? 'sent' : 'failed',
      result.error,
    );

    console.log(`[FollowUpEngine] ${emailType} email ${result.success ? 'sent' : 'FAILED'} to ${recipientEmail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FollowUpEngine] Error sending ${emailType} email:`, msg);
    await logFollowUpEmail(supabase, empresaId, templateId, recipientEmail, emailType, '-', '-', 'failed', msg);
  }
}
