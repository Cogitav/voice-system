import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Resend client
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Verified sender address. Resolved once at cold-start. Set
// EMAIL_FROM_ADDRESS in Supabase Edge Function secrets to a domain
// verified in Resend for production sends. The Resend test address is
// kept as a defensive fallback only — it is rate-limited and only allows
// sending to the workspace owner.
const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") || "onboarding@resend.dev";

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

function mapIntentToLabel(intent: string | null): string {
  switch (intent) {
    case "BOOKING_NEW":
    case "CONFIRMATION":
    case "SLOT_SELECTION":
    case "TIME_BASED_SELECTION":
      return "Marcação";
    case "DATE_CHANGE":
    case "RESCHEDULE":
      return "Remarcação";
    case "INFO_REQUEST":
      return "Informação";
    case "PRICE_REQUEST":
      return "Preço";
    case "CANCEL":
      return "Cancelamento";
    case "HUMAN_REQUEST":
      return "Atendimento humano";
    default:
      return "Outro";
  }
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
  // Provide exactly one of chamada_id (call-context email) or lead_id
  // (lead-context email). Validated at runtime via XOR check.
  chamada_id?: string;
  lead_id?: string;
  // For the lead path, template_id is REQUIRED — manual lead emails use
  // explicit operator-selected templates instead of intent-based lookup.
  // Ignored by the chamada path (which keeps intent-based lookup unchanged).
  template_id?: string;
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
    const { chamada_id, lead_id, template_id, recipient_email, cliente_nome }: SendFollowUpRequest = await req.json();

    if (!recipient_email) {
      return new Response(
        JSON.stringify({ error: "recipient_email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const hasChamada = typeof chamada_id === 'string' && chamada_id.length > 0;
    const hasLead = typeof lead_id === 'string' && lead_id.length > 0;

    // XOR: exactly one source allowed.
    if (hasChamada === hasLead) {
      return new Response(
        JSON.stringify({ error: "exactly one of chamada_id or lead_id must be provided" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ─── Lead-context email path ─────────────────────────────────────────────
    // Mirrors the chamada path below in shape (lookup → template → replace →
    // send → log → credits) but sources its context from the leads table and
    // the linked conversation. email_logs.chamada_id is set to NULL for these
    // rows; lead linkage is preserved via empresa_id + recipient_email + sent_at
    // (no schema change). Returns early so the chamada path runs unchanged.
    if (hasLead) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select(`
          id,
          empresa_id,
          name,
          email,
          phone,
          status,
          source,
          conversation_id,
          empresas:empresa_id (nome),
          conversations:conversation_id (main_intent, conversation_context)
        `)
        .eq("id", lead_id!)
        .single();

      if (leadError || !lead) {
        console.log("Lead not found:", lead_id);
        return new Response(
          JSON.stringify({ success: false, reason: "lead_not_found" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const empresaId = lead.empresa_id;
      const empresaNome = (lead as any).empresas?.nome || "Empresa";

      // Resolve intent: live conversation_context.current_intent →
      // persisted conversations.main_intent → generic 'lead_followup' fallback.
      const conv = (lead as any).conversations;
      const ctxField = conv?.conversation_context;
      const ctxIntent =
        ctxField && typeof ctxField === "object" && "current_intent" in ctxField
          ? (ctxField as Record<string, unknown>).current_intent
          : null;
      const intent =
        typeof ctxIntent === "string" && ctxIntent.trim().length > 0
          ? ctxIntent
          : typeof conv?.main_intent === "string" && conv.main_intent.trim().length > 0
          ? conv.main_intent
          : "lead_followup";

      // Manual lead emails require an operator-selected template_id.
      // We deliberately bypass intent-based lookup here because the lead-side
      // intent ontologies (BOOKING_NEW / 'Agendamento' / etc.) do NOT align
      // with email_templates.intent slugs ('agendamento' / 'informacao' / ...).
      // The intent variable above is still resolved — it remains useful for
      // {{intent}} substitution in the template body.
      if (!template_id || typeof template_id !== "string" || template_id.length === 0) {
        return new Response(
          JSON.stringify({ error: "template_id is required for lead emails" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: template, error: templateError } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", template_id)
        .eq("empresa_id", empresaId)
        .eq("is_active", true)
        .single();

      if (templateError || !template) {
        console.log("Template not found or inactive:", template_id, "empresa:", empresaId);
        return new Response(
          JSON.stringify({ success: false, reason: "no_template" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const leadName = lead.name || cliente_nome || "Cliente";

      let subject = template.subject;
      let body = template.body;

      const replacements: Record<string, string> = {
        // Lead-context variables (canonical: cliente_FIELD form, matching the
        // standardized list in src/hooks/useEmailTemplates.ts TEMPLATE_VARIABLES).
        "{{cliente_nome}}": leadName,
        "{{cliente_email}}": lead.email || recipient_email,
        "{{cliente_telefone}}": lead.phone || "",
        "{{empresa_nome}}": empresaNome,
        "{{lead_status}}": lead.status || "",
        "{{lead_source}}": lead.source || "",
        "{{intent}}": mapIntentToLabel(intent),
        // Backward-compatible aliases (FIELD_cliente form) for templates
        // authored against the previous variable naming.
        "{{nome_cliente}}": leadName,
        "{{email_cliente}}": lead.email || recipient_email,
        "{{telefone_cliente}}": lead.phone || "",
        // Call-only variables — empty string when no chamada in scope.
        "{{resumo_chamada}}": "",
        "{{data_agendamento}}": "",
        "{{hora_agendamento}}": "",
      };

      for (const [key, value] of Object.entries(replacements)) {
        subject = subject.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
        body = body.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
      }

      const emailResult = await sendEmail(
        recipient_email,
        `${empresaNome} <${EMAIL_FROM_ADDRESS}>`,
        subject,
        body
      );

      if (!emailResult.success) {
        console.error("Failed to send lead email:", emailResult.error);

        // Log failure (no credits consumed). chamada_id intentionally NULL.
        await supabase.from("email_logs").insert({
          chamada_id: null,
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

      console.log("Lead email sent successfully:", emailResult.id);

      // Log success. chamada_id intentionally NULL for lead emails.
      const { data: emailLog } = await supabase
        .from("email_logs")
        .insert({
          chamada_id: null,
          template_id: template.id,
          empresa_id: empresaId,
          recipient_email: recipient_email,
          subject: subject,
          body: body,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (emailLog?.id) {
        registerCreditUsage(
          supabase,
          empresaId,
          "email",
          emailLog.id,
          {
            leadId: lead_id,
            recipientEmail: recipient_email,
            templateId: template.id,
            conversationId: lead.conversation_id,
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, email_id: emailResult.id }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ─── Chamada-context email path (unchanged) ──────────────────────────────
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
      `${empresaNome} <${EMAIL_FROM_ADDRESS}>`,
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

    // Try to log the failure for whichever context (chamada or lead) was supplied.
    try {
      const { chamada_id, lead_id, recipient_email }: Partial<SendFollowUpRequest> =
        await req.clone().json();
      if (recipient_email) {
        const hasChamada = typeof chamada_id === "string" && chamada_id.length > 0;
        const hasLead = typeof lead_id === "string" && lead_id.length > 0;

        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        let empresaId: string | null = null;
        let logChamadaId: string | null = null;

        if (hasChamada) {
          const { data: chamada } = await supabase
            .from("chamadas")
            .select("empresa_id")
            .eq("id", chamada_id!)
            .single();
          empresaId = chamada?.empresa_id ?? null;
          logChamadaId = chamada_id!;
        } else if (hasLead) {
          const { data: lead } = await supabase
            .from("leads")
            .select("empresa_id")
            .eq("id", lead_id!)
            .single();
          empresaId = lead?.empresa_id ?? null;
        }

        if (empresaId) {
          await supabase.from("email_logs").insert({
            chamada_id: logChamadaId,
            empresa_id: empresaId,
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
