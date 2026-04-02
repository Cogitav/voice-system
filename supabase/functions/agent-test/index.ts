import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentConfig {
  nome: string;
  idioma: string | null;
  descricao_funcao: string | null;
  contexto_negocio: string | null;
  prompt_base: string | null;
  regras: string | null;
  empresa_id: string;
}

interface KnowledgeItem {
  title: string;
  type: string;
  content: string | null;
  source_url: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

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

function buildSystemPrompt(agent: AgentConfig, knowledge: KnowledgeItem[]): string {
  const parts: string[] = [];

  // 1. Agent identity and role
  parts.push(`Você é ${agent.nome}, um agente de IA de voz.`);
  
  if (agent.idioma) {
    parts.push(`Idioma principal: ${agent.idioma}`);
  }

  // 2. Job description
  if (agent.descricao_funcao) {
    parts.push(`\n## Descrição da Função\n${agent.descricao_funcao}`);
  }

  // 3. Business context
  if (agent.contexto_negocio) {
    parts.push(`\n## Contexto de Negócio\n${agent.contexto_negocio}`);
  }

  // 4. Core behavior (system prompt)
  if (agent.prompt_base) {
    parts.push(`\n## Instruções de Comportamento\n${agent.prompt_base}`);
  }

  // 5. Rules and restrictions
  if (agent.regras) {
    parts.push(`\n## Regras e Restrições\n${agent.regras}`);
  }

  // 6. Knowledge base
  if (knowledge.length > 0) {
    parts.push(`\n## Base de Conhecimento\nUtilize as seguintes informações para responder com precisão:`);
    
    knowledge.forEach((item, index) => {
      parts.push(`\n### ${index + 1}. ${item.title} (${item.type})`);
      if (item.content) {
        parts.push(item.content);
      }
      if (item.source_url) {
        parts.push(`Fonte: ${item.source_url}`);
      }
    });
  }

  // 7. Simulation context
  parts.push(`\n## Contexto de Simulação\nEsta é uma simulação de teste. Responda como se estivesse numa chamada telefónica real com um cliente.\nSeja natural, profissional e siga todas as regras definidas.\nMantenha as respostas concisas e adequadas para comunicação por voz.`);

  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { agentId, messages } = await req.json() as { 
      agentId: string; 
      messages: Message[] 
    };

    if (!agentId) {
      return new Response(JSON.stringify({ error: "agentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch agent configuration
    const { data: agent, error: agentError } = await supabase
      .from("agentes")
      .select("nome, idioma, descricao_funcao, contexto_negocio, prompt_base, regras, empresa_id")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch knowledge base (company-level + agent-specific)
    const { data: knowledge, error: knowledgeError } = await supabase
      .from("agent_knowledge_base")
      .select("title, type, content, source_url")
      .eq("empresa_id", agent.empresa_id)
      .eq("status", "active")
      .or(`agent_id.eq.${agentId},agent_id.is.null`);

    if (knowledgeError) {
      console.error("Error fetching knowledge:", knowledgeError);
    }

    const systemPrompt = buildSystemPrompt(agent as AgentConfig, knowledge || []);

    // Call Lovable AI Gateway with streaming
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Register credit usage AFTER successful AI response (non-blocking)
    // Use a unique reference to ensure idempotency
    const messageCount = messages.filter(m => m.role === 'user').length;
    const referenceId = `agent_test_${agentId}_${Date.now()}_${messageCount}`;
    
    registerCreditUsage(
      supabase,
      agent.empresa_id,
      'agent_test',
      referenceId,
      { agentId, messageCount }
    );

    // Return streaming response
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (e) {
    console.error("agent-test error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
