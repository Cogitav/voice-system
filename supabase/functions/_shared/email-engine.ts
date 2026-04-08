/**
 * Email Engine v2.0
 *
 * Sends transactional emails via Resend API.
 * Supports both hardcoded templates (fallback) and DB-driven templates
 * via _override_subject / _override_body variables.
 *
 * Does NOT modify: intent router, booking engine, service resolver.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const RESEND_API_KEY = () => Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM_SYSTEM = () => Deno.env.get('EMAIL_FROM_SYSTEM') || 'no-reply@linhadeprojeto.pt';

// =============================================
// Types
// =============================================

export interface SendPlatformEmailParams {
  empresa_id: string;
  template: EmailTemplateKey;
  to: string;
  variables: Record<string, string>;
  supabase?: SupabaseClient;
}

export type EmailTemplateKey =
  | 'booking_confirmation'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'conversation_followup';

interface EmailTemplate {
  subject: string;
  body: string;
}

// =============================================
// Template Definitions (Fallback)
// =============================================

function getTemplate(key: EmailTemplateKey, vars: Record<string, string>): EmailTemplate {
  // If overrides are provided (from DB templates via FollowUpEngine), use them
  if (vars._override_subject && vars._override_body) {
    return {
      subject: vars._override_subject,
      body: vars._override_body,
    };
  }

  const v = (k: string) => vars[k] || '-';

  const templates: Record<EmailTemplateKey, EmailTemplate> = {
    booking_confirmation: {
      subject: `Confirmação de Agendamento - ${v('empresa_nome')}`,
      body: [
        `Olá ${v('cliente_nome') || v('client_name')},`,
        '',
        `O seu agendamento foi confirmado com sucesso.`,
        '',
        `Serviço: ${v('servico_nome') || v('service_name')}`,
        `Data: ${v('data_agendamento') || v('appointment_date')}`,
        `Hora: ${v('hora_agendamento') || v('appointment_time')}`,
        '',
        `Caso precise de alterar ou cancelar, entre em contacto connosco.`,
        '',
        `Obrigado,`,
        v('empresa_nome'),
      ].join('\n'),
    },
    booking_rescheduled: {
      subject: `Agendamento Reagendado - ${v('empresa_nome')}`,
      body: [
        `Olá ${v('cliente_nome') || v('client_name')},`,
        '',
        `O seu agendamento foi reagendado com sucesso.`,
        '',
        `Nova data: ${v('data_agendamento') || v('appointment_date')}`,
        `Nova hora: ${v('hora_agendamento') || v('appointment_time')}`,
        `Serviço: ${v('servico_nome') || v('service_name')}`,
        '',
        `Obrigado,`,
        v('empresa_nome'),
      ].join('\n'),
    },
    booking_cancelled: {
      subject: `Agendamento Cancelado - ${v('empresa_nome')}`,
      body: [
        `Olá ${v('cliente_nome') || v('client_name')},`,
        '',
        `O seu agendamento foi cancelado conforme solicitado.`,
        '',
        `Serviço: ${v('servico_nome') || v('service_name')}`,
        `Data original: ${v('data_agendamento') || v('appointment_date')}`,
        '',
        `Se pretender reagendar, não hesite em contactar-nos.`,
        '',
        `Obrigado,`,
        v('empresa_nome'),
      ].join('\n'),
    },
    conversation_followup: {
      subject: `Resumo da sua conversa - ${v('empresa_nome')}`,
      body: [
        `Olá ${v('cliente_nome') || v('client_name')},`,
        '',
        `Obrigado pelo seu contacto.`,
        '',
        `Resumo: ${v('resumo_atendimento') || v('summary')}`,
        '',
        `Se precisar de mais alguma coisa, estamos ao seu dispor.`,
        '',
        `Obrigado,`,
        v('empresa_nome'),
      ].join('\n'),
    },
  };

  return templates[key];
}

// =============================================
// Email Sender
// =============================================

const apiKey = Deno.env.get('RESEND_API_KEY');

if (!apiKey) {
  console.warn('[EmailEngine] RESEND_API_KEY not configured — skipping email');
  return { success: false, error: 'RESEND_API_KEY not configured' };
}

  const empresaNome = variables['empresa_nome'] || 'Empresa';
  const emailTemplate = getTemplate(template, variables);

  // Resolve sender: company-specific override or global system default
  const systemFrom = EMAIL_FROM_SYSTEM();
  const senderAddress = variables['empresa_email'] || systemFrom;
  const fromHeader = `${empresaNome} <${senderAddress}>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [to],
        subject: emailTemplate.subject,
        text: emailTemplate.body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[EmailEngine] Send failed:', data);
      await logEmail(supabase, empresa_id, template, to, emailTemplate, 'failed', data.message);
      return { success: false, error: data.message || 'Send failed' };
    }

    console.log(`[EmailEngine] Email sent: ${template} to ${to}, id=${data.id}`);
    await logEmail(supabase, empresa_id, template, to, emailTemplate, 'sent');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EmailEngine] Exception:', msg);
    await logEmail(supabase, empresa_id, template, to, emailTemplate, 'failed', msg);
    return { success: false, error: msg };
  }
}

// =============================================
// Logging (non-blocking)
// =============================================

async function logEmail(
  supabase: SupabaseClient | undefined,
  empresaId: string,
  templateKey: string,
  recipientEmail: string,
  emailTemplate: EmailTemplate,
  status: 'sent' | 'failed',
  errorMessage?: string,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('email_logs').insert({
      empresa_id: empresaId,
      recipient_email: recipientEmail,
      subject: emailTemplate.subject,
      body: emailTemplate.body,
      status,
      error_message: errorMessage || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.warn('[EmailEngine] Log insert failed (non-blocking):', e);
  }
}
