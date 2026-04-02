import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Resend client
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Credit rules - keep in sync with src/lib/credits.ts
const CREDIT_RULES: Record<string, number> = {
  call_completed: 30,
  call_short: 5,
  agent_test: 1,
  message: 1,
  email: 0,
  knowledge: 0,
  other: 0,
};

const DEFAULT_CREDIT_LIMIT = 1000;

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Register credit usage (backend-only, idempotent, non-blocking)
 */
async function registerCreditUsage(
  supabase: any,
  empresaId: string,
  eventType: string,
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const creditsConsumed = CREDIT_RULES[eventType] ?? 0;
    
    // Skip if no credits to consume
    if (creditsConsumed === 0) {
      console.log(`[Credits] Skipping ${eventType} - 0 credits`);
      return;
    }
    
    const currentMonth = getCurrentMonth();

    // Idempotency check: if reference_id provided, check if already registered
    if (referenceId) {
      const { data: existing } = await supabase
        .from('credits_events')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('event_type', eventType)
        .eq('reference_id', referenceId)
        .maybeSingle();
      
      if (existing) {
        console.log(`[Credits] Already registered: ${eventType} for ${referenceId}`);
        return;
      }
    }

    // 1. Create the credit event
    const { error: eventError } = await supabase
      .from('credits_events')
      .insert([{
        empresa_id: empresaId,
        event_type: eventType,
        credits_consumed: creditsConsumed,
        reference_id: referenceId || null,
        metadata: metadata || {},
      }]);

    if (eventError) {
      console.error('[Credits] Error creating event:', eventError);
      return; // Don't block - just log
    }

    // 2. Fetch or create current month usage record
    const { data: existingUsage } = await supabase
      .from('credits_usage')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('month', currentMonth)
      .maybeSingle();

    if (existingUsage) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('credits_usage')
        .update({ 
          credits_used: existingUsage.credits_used + creditsConsumed 
        })
        .eq('id', existingUsage.id);

      if (updateError) {
        console.error('[Credits] Error updating usage:', updateError);
      }
    } else {
      // Create new record for this month
      const { error: insertError } = await supabase
        .from('credits_usage')
        .insert({
          empresa_id: empresaId,
          month: currentMonth,
          credits_used: creditsConsumed,
          credits_limit: DEFAULT_CREDIT_LIMIT,
        });

      if (insertError) {
        console.error('[Credits] Error creating usage:', insertError);
      }
    }

    console.log(`[Credits] Registered: ${eventType} = ${creditsConsumed} credits for empresa ${empresaId}`);
  } catch (error) {
    // Never throw - credits are non-blocking
    console.error('[Credits] Registration failed (non-blocking):', error);
  }
}

async function sendEmail(to: string, from: string, subject: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
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
      return { success: false, error: data.message || "Failed to send email" };
    }
    
    return { success: true, id: data.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendFollowUpRequest {
  chamada_id: string;
  recipient_email: string;
  cliente_nome?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { chamada_id, recipient_email, cliente_nome }: SendFollowUpRequest = await req.json();

    if (!chamada_id || !recipient_email) {
      return new Response(
        JSON.stringify({ error: "chamada_id and recipient_email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch call details
    const { data: chamada, error: chamadaError } = await supabase
      .from("chamadas")
      .select(`
        id,
        intencao_detetada,
        resultado,
        empresa_id,
        empresas(nome)
      `)
      .eq("id", chamada_id)
      .single();

    if (chamadaError || !chamada) {
      console.log("Call not found:", chamada_id);
      return new Response(
        JSON.stringify({ success: false, reason: "call_not_found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const intent = chamada.intencao_detetada;
    const empresaId = chamada.empresa_id;
    const empresaNome = (chamada.empresas as any)?.nome || "Empresa";

    if (!intent) {
      console.log("No intent detected for call:", chamada_id);
      return new Response(
        JSON.stringify({ success: false, reason: "no_intent" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find active email template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("intent", intent)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.log("No active template found for intent:", intent, "empresa:", empresaId);
      return new Response(
        JSON.stringify({ success: false, reason: "no_template" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch agendamento if exists
    let agendamentoData = null;
    const { data: agendamento } = await supabase
      .from("agendamentos")
      .select("data, hora")
      .eq("chamada_id", chamada_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (agendamento) {
      agendamentoData = agendamento;
    }

    // Replace template variables
    let subject = template.subject;
    let body = template.body;

    const replacements: Record<string, string> = {
      "{{cliente_nome}}": cliente_nome || "Cliente",
      "{{empresa_nome}}": empresaNome,
      "{{resumo_chamada}}": chamada.resultado || "Chamada realizada",
      "{{data_agendamento}}": agendamentoData?.data || "-",
      "{{hora_agendamento}}": agendamentoData?.hora || "-",
    };

    for (const [key, value] of Object.entries(replacements)) {
      subject = subject.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
      body = body.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
    }

    // Send email
    const emailResult = await sendEmail(
      recipient_email,
      `${empresaNome} <onboarding@resend.dev>`,
      subject,
      body
    );

    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
      
      // Log the failure (no credits consumed on failure)
      await supabase.from("email_logs").insert({
        chamada_id: chamada_id,
        template_id: template.id,
        empresa_id: empresaId,
        recipient_email: recipient_email,
        subject: subject,
        body: body,
        status: "failed",
        error_message: emailResult.error,
      });

      return new Response(
        JSON.stringify({ success: false, reason: "email_send_failed", error: emailResult.error }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailResult.id);

    // Log the email send
    const { data: emailLog } = await supabase.from("email_logs").insert({
      chamada_id: chamada_id,
      template_id: template.id,
      empresa_id: empresaId,
      recipient_email: recipient_email,
      subject: subject,
      body: body,
      status: "sent",
      sent_at: new Date().toISOString(),
    }).select('id').single();

    // Register credit usage AFTER successful email send (non-blocking, idempotent)
    // Use email_log.id as reference for idempotency
    if (emailLog?.id) {
      registerCreditUsage(
        supabase,
        empresaId,
        'email',
        emailLog.id,
        { chamadaId: chamada_id, recipientEmail: recipient_email, templateId: template.id }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email_id: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-follow-up-email:", error);

    // Try to log the failure
    try {
      const { chamada_id, recipient_email }: Partial<SendFollowUpRequest> = await req.clone().json();
      if (chamada_id && recipient_email) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        
        // Get empresa_id from chamada
        const { data: chamada } = await supabase
          .from("chamadas")
          .select("empresa_id")
          .eq("id", chamada_id)
          .single();

        if (chamada) {
          await supabase.from("email_logs").insert({
            chamada_id: chamada_id,
            empresa_id: chamada.empresa_id,
            recipient_email: recipient_email,
            subject: "Error",
            body: "",
            status: "failed",
            error_message: error.message,
          });
        }
      }
    } catch {
      // Ignore logging errors
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
