import { getServiceClient } from './supabase-client.ts';
import { ConversationContext } from './types.ts';
import { consumeCredits } from './credit-manager.ts';

type EmailTemplate = {
  id: string;
  subject: string;
  body: string;
};

type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM_ADDRESS = Deno.env.get('EMAIL_FROM_ADDRESS') || 'onboarding@resend.dev';

function replaceTemplateVariables(template: string, replacements: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return output;
}

async function sendEmail(
  to: string,
  from: string,
  subject: string,
  text: string,
): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type BookingEmailOutcome =
  | { sent: true; emailLogId: string; providerEmailId: string | null }
  | {
      sent: false;
      reason:
        | 'missing_customer_email'
        | 'template_lookup_failed'
        | 'no_template'
        | 'already_sent'
        | 'send_failed'
        | 'log_failed'
        | 'unexpected_error';
      detail?: string;
    };

export async function sendBookingConfirmationEmail(params: {
  db: ReturnType<typeof getServiceClient>;
  context: ConversationContext;
  empresaId: string;
  bookingId: string;
  eventCutoffAt: string;
  dataAgendamento: string;
  horaAgendamento: string;
  conversationId: string;
}): Promise<BookingEmailOutcome> {
  const {
    db,
    context,
    empresaId,
    bookingId,
    eventCutoffAt,
    dataAgendamento,
    horaAgendamento,
    conversationId,
  } = params;

  try {
    const recipientEmail = context.customer_email?.trim();
    if (!recipientEmail) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'missing_customer_email',
        booking_id: bookingId,
        conversation_id: conversationId,
      });
      return { sent: false, reason: 'missing_customer_email' };
    }

    const { data: templates, error: templateError } = await db
      .from('email_templates')
      .select('id, subject, body')
      .eq('empresa_id', empresaId)
      .eq('intent', 'agendamento')
      .eq('is_active', true)
      .eq('recipient_type', 'client')
      .order('created_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_TEMPLATE_LOOKUP_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: templateError.message,
      });
      return { sent: false, reason: 'template_lookup_failed', detail: templateError.message };
    }

    const template = (templates?.[0] ?? null) as EmailTemplate | null;
    if (!template) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'no_active_client_agendamento_template',
        booking_id: bookingId,
        conversation_id: conversationId,
      });
      return { sent: false, reason: 'no_template' };
    }

    const { data: existingLogs } = await db
      .from('email_logs')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('template_id', template.id)
      .eq('recipient_email', recipientEmail)
      .eq('status', 'sent')
      .gte('created_at', eventCutoffAt)
      .limit(1);

    if (existingLogs?.length) {
      console.log('[BOOKING_CONFIRMATION_EMAIL_SKIPPED]', {
        reason: 'already_sent',
        booking_id: bookingId,
        email_log_id: existingLogs[0].id,
        conversation_id: conversationId,
      });
      return { sent: false, reason: 'already_sent' };
    }

    const { data: empresa } = await db
      .from('empresas')
      .select('nome')
      .eq('id', empresaId)
      .maybeSingle();

    const empresaNome = empresa?.nome || 'Empresa';
    const serviceName = context.service_name || context.confirmed_snapshot?.service_name || 'Servico';
    const replacements = {
      '{{cliente_nome}}': context.customer_name || 'Cliente',
      '{{cliente_email}}': recipientEmail,
      '{{cliente_telefone}}': context.customer_phone || '',
      '{{empresa_nome}}': empresaNome,
      '{{data_agendamento}}': dataAgendamento,
      '{{hora_agendamento}}': horaAgendamento.slice(0, 5),
      '{{intent}}': serviceName,
      '{{servico_nome}}': serviceName,
      '{{nome_cliente}}': context.customer_name || 'Cliente',
      '{{email_cliente}}': recipientEmail,
      '{{telefone_cliente}}': context.customer_phone || '',
    };

    const subject = replaceTemplateVariables(template.subject, replacements);
    const body = replaceTemplateVariables(template.body, replacements);
    const emailResult = await sendEmail(
      recipientEmail,
      `${empresaNome} <${EMAIL_FROM_ADDRESS}>`,
      subject,
      body,
    );

    if (!emailResult.success) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: emailResult.error,
      });

      await db.from('email_logs').insert({
        chamada_id: null,
        template_id: template.id,
        empresa_id: empresaId,
        recipient_email: recipientEmail,
        subject,
        body,
        status: 'failed',
        error_message: emailResult.error ?? 'Failed to send email',
      });
      return { sent: false, reason: 'send_failed', detail: emailResult.error ?? undefined };
    }

    const { data: emailLog, error: emailLogError } = await db
      .from('email_logs')
      .insert({
        chamada_id: null,
        template_id: template.id,
        empresa_id: empresaId,
        recipient_email: recipientEmail,
        subject,
        body,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (emailLogError || !emailLog?.id) {
      console.warn('[BOOKING_CONFIRMATION_EMAIL_LOG_FAILED]', {
        booking_id: bookingId,
        conversation_id: conversationId,
        error: emailLogError?.message ?? 'Missing email_log id',
      });
      return { sent: false, reason: 'log_failed', detail: emailLogError?.message ?? undefined };
    }

    await consumeCredits(empresaId, 'email_send', emailLog.id);
    console.log('[BOOKING_CONFIRMATION_EMAIL_SENT]', {
      booking_id: bookingId,
      conversation_id: conversationId,
      email_log_id: emailLog.id,
      provider_email_id: emailResult.id ?? null,
    });
    return { sent: true, emailLogId: emailLog.id, providerEmailId: emailResult.id ?? null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[BOOKING_CONFIRMATION_EMAIL_ERROR]', {
      booking_id: bookingId,
      conversation_id: conversationId,
      error: detail,
    });
    return { sent: false, reason: 'unexpected_error', detail };
  }
}
