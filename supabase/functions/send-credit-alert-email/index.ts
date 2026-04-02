import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AlertType = 'credits_70' | 'credits_85' | 'credits_100';

interface CreditAlertRequest {
  empresa_id: string;
  alert_type: AlertType;
  empresa_nome: string;
  empresa_email: string | null;
  admin_email: string;
  credits_used: number;
  credits_limit: number;
  percentage: number;
  is_test_environment?: boolean;
}

interface EmailTemplate {
  id: string;
  template_key: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_active: boolean;
}

interface GlobalSettings {
  email_sender_address?: string;
  email_sender_name?: string;
  platform_logo_url?: string;
  platform_footer_text?: string;
  platform_signature?: string;
}

/**
 * Fetch admin-editable template from database
 */
async function getTemplate(
  supabase: any,
  templateKey: string
): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('system_email_templates')
    .select('*')
    .eq('template_key', templateKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[CreditAlert] Error fetching template:', error);
    return null;
  }

  return data;
}

/**
 * Fetch global settings for email configuration
 */
async function getGlobalSettings(supabase: any): Promise<GlobalSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('scope', 'global')
    .in('key', [
      'email_sender_address',
      'email_sender_name',
      'platform_logo_url',
      'platform_footer_text',
      'platform_signature',
    ]);

  if (error) {
    console.error('[CreditAlert] Error fetching settings:', error);
    return {};
  }

  const settings: GlobalSettings = {};
  data?.forEach((s: { key: string; value: any }) => {
    settings[s.key as keyof GlobalSettings] = s.value;
  });

  return settings;
}

/**
 * Replace template variables with actual values
 */
function replaceVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;

  // Replace simple variables {{variable_name}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value));
  });

  // Handle conditional logo block {{#logo}}...{{/logo}}
  if (variables.platform_logo_url) {
    result = result.replace(/{{#logo}}/g, '').replace(/{{\/logo}}/g, '');
  } else {
    result = result.replace(/{{#logo}}[\s\S]*?{{\/logo}}/g, '');
  }

  return result;
}

/**
 * Fallback templates in case DB templates are not available
 */
function getFallbackTemplate(
  alertType: AlertType,
  empresaNome: string,
  percentage: number,
  creditsUsed: number,
  creditsLimit: number,
  settings: GlobalSettings
): { subject: string; bodyHtml: string; bodyText: string } {
  const platformName = settings.email_sender_name || 'AI Call Platform';
  const signature = settings.platform_signature || `— ${platformName}`;
  const footer = settings.platform_footer_text || 'Notificação automática de sistema';

  const templates: Record<AlertType, { subject: string; body: string }> = {
    credits_70: {
      subject: `Utilização de créditos a ${percentage}%`,
      body: `Olá ${empresaNome},

Informamos que a utilização do seu plafond mensal de créditos atingiu ${percentage}% (${creditsUsed.toLocaleString('pt-PT')} de ${creditsLimit.toLocaleString('pt-PT')}).

O serviço continua a funcionar normalmente.
Este aviso serve apenas para acompanhamento do consumo.

${signature}
${footer}`,
    },
    credits_85: {
      subject: `Atenção à utilização de créditos (${percentage}%)`,
      body: `Olá ${empresaNome},

A utilização de créditos atingiu ${percentage}% do limite mensal (${creditsUsed.toLocaleString('pt-PT')} de ${creditsLimit.toLocaleString('pt-PT')}).

Recomendamos acompanhar o consumo para evitar excedentes.

${signature}
${footer}`,
    },
    credits_100: {
      subject: `Limite de créditos ultrapassado (${percentage}%)`,
      body: `Olá ${empresaNome},

O consumo mensal de créditos ultrapassou o limite contratado (${creditsUsed.toLocaleString('pt-PT')} de ${creditsLimit.toLocaleString('pt-PT')} – ${percentage}%).

O serviço continua ativo, mas o consumo adicional será considerado excedente.

${signature}
${footer}`,
    },
  };

  const t = templates[alertType];
  return {
    subject: t.subject,
    bodyHtml: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${t.body}</pre>`,
    bodyText: t.body,
  };
}

async function sendEmail(
  to: string[],
  subject: string,
  bodyHtml: string,
  bodyText: string,
  senderName: string,
  senderEmail: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[CreditAlert] RESEND_API_KEY not configured');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to,
        subject,
        html: bodyHtml,
        text: bodyText,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[CreditAlert] Resend API error:', data);
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('[CreditAlert] Send error:', error);
    return { success: false, error: error.message };
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const request: CreditAlertRequest = await req.json();
    const {
      empresa_id,
      alert_type,
      empresa_nome,
      empresa_email,
      admin_email,
      credits_used,
      credits_limit,
      percentage,
      is_test_environment = false,
    } = request;

    console.log(`[CreditAlert] Processing ${alert_type} for empresa ${empresa_id}${is_test_environment ? ' (TEST ENV)' : ''}`);

    // Validate required fields
    if (!empresa_id || !alert_type || !admin_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: empresa_id, alert_type, admin_email' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const currentMonth = getCurrentMonth();

    // Fetch global settings for branding
    const globalSettings = await getGlobalSettings(supabase);
    const senderName = globalSettings.email_sender_name || 'AI Call Platform';
    const senderEmail = globalSettings.email_sender_address || 'onboarding@resend.dev';

    // For test environments, log as skipped and don't send
    if (is_test_environment) {
      console.log(`[CreditAlert] Skipping email for TEST ENVIRONMENT empresa ${empresa_id}`);

      await supabase
        .from('system_email_logs')
        .insert([{
          empresa_id,
          alert_type,
          month: currentMonth,
          recipients: [admin_email, ...(empresa_email ? [empresa_email] : [])],
          subject: `[SKIPPED] Alerta de créditos ${alert_type}`,
          body: 'Email skipped - Test environment',
          status: 'skipped_test_env',
          metadata: {
            credits_used,
            credits_limit,
            percentage,
            empresa_nome,
            is_test_environment: true,
          },
        }]);

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'test_environment',
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check idempotency - only one email per threshold per month
    const { data: existingAlert } = await supabase
      .from('system_email_logs')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('alert_type', alert_type)
      .eq('month', currentMonth)
      .eq('status', 'sent')
      .maybeSingle();

    if (existingAlert) {
      console.log(`[CreditAlert] Alert ${alert_type} already sent for empresa ${empresa_id} in ${currentMonth}`);
      return new Response(
        JSON.stringify({ success: false, reason: 'already_sent' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build recipient list with deduplication
    const recipients = new Set<string>([admin_email]);

    // For 85% and 100% alerts, also notify company contact
    if ((alert_type === 'credits_85' || alert_type === 'credits_100') && empresa_email) {
      recipients.add(empresa_email);
    }

    const recipientList = Array.from(recipients);

    if ((alert_type === 'credits_85' || alert_type === 'credits_100') && !empresa_email) {
      console.warn(`[CreditAlert] Warning: No empresa email for ${empresa_id} - only admin will be notified`);
    }

    // Fetch admin-editable template
    const dbTemplate = await getTemplate(supabase, alert_type);

    let subject: string;
    let bodyHtml: string;
    let bodyText: string;

    if (dbTemplate) {
      // Use admin-editable template with variable replacement
      const variables: Record<string, string | number> = {
        empresa_nome,
        percentagem_utilizacao: percentage,
        creditos_usados: credits_used.toLocaleString('pt-PT'),
        creditos_limite: credits_limit.toLocaleString('pt-PT'),
        mes: new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }),
        plano_nome: 'Plano Standard',
        platform_logo_url: globalSettings.platform_logo_url || '',
        platform_signature: globalSettings.platform_signature || `— ${senderName}`,
        platform_footer_text: globalSettings.platform_footer_text || 'Notificação automática de sistema',
      };

      subject = replaceVariables(dbTemplate.subject, variables);
      bodyHtml = replaceVariables(dbTemplate.body_html, variables);
      bodyText = replaceVariables(dbTemplate.body_text, variables);
    } else {
      // Use fallback template
      console.warn(`[CreditAlert] No active template found for ${alert_type}, using fallback`);
      const fallback = getFallbackTemplate(alert_type, empresa_nome, percentage, credits_used, credits_limit, globalSettings);
      subject = fallback.subject;
      bodyHtml = fallback.bodyHtml;
      bodyText = fallback.bodyText;
    }

    // Create log entry first (pending status)
    const { data: logEntry, error: logError } = await supabase
      .from('system_email_logs')
      .insert([{
        empresa_id,
        alert_type,
        month: currentMonth,
        recipients: recipientList,
        subject,
        body: bodyText,
        status: 'pending',
        metadata: {
          credits_used,
          credits_limit,
          percentage,
          empresa_nome,
          template_id: dbTemplate?.id || null,
        },
      }])
      .select('id')
      .single();

    if (logError) {
      console.error('[CreditAlert] Failed to create log entry:', logError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create log entry' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email
    const emailResult = await sendEmail(recipientList, subject, bodyHtml, bodyText, senderName, senderEmail);

    // Update log with result
    if (emailResult.success) {
      await supabase
        .from('system_email_logs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);

      console.log(`[CreditAlert] ✓ Sent ${alert_type} to ${recipientList.join(', ')}`);

      return new Response(
        JSON.stringify({
          success: true,
          email_id: emailResult.id,
          recipients: recipientList,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else {
      await supabase
        .from('system_email_logs')
        .update({
          status: 'failed',
          error_message: emailResult.error,
        })
        .eq('id', logEntry.id);

      console.error(`[CreditAlert] ✗ Failed to send ${alert_type}: ${emailResult.error}`);

      return new Response(
        JSON.stringify({
          success: false,
          reason: 'send_failed',
          error: emailResult.error,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  } catch (error: any) {
    console.error('[CreditAlert] Handler error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
