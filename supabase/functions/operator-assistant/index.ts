import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  sender_type: string;
  content: string;
  created_at: string;
  is_internal: boolean;
}

interface AssistantResponse {
  summary: string;
  detectedIntent: string;
  suggestedReplies: string[];
  nextActions: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(JSON.stringify({ error: "Missing conversationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, empresas(nome)")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Error fetching conversation:", convError);
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow if human_active
    if (conversation.status !== "human_active") {
      return new Response(JSON.stringify({ error: "Assistant only available when human is active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return new Response(JSON.stringify({ error: "Failed to fetch messages" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format conversation for AI
    const conversationHistory = (messages || [])
      .filter((m: Message) => !m.is_internal) // Only include client-visible messages
      .map((m: Message) => {
        const sender = m.sender_type === "client" ? "Cliente" : m.sender_type === "ai" ? "IA" : "Operador";
        return `[${sender}]: ${m.content}`;
      })
      .join("\n");

    const clientName = conversation.client_name || conversation.client_identifier || "Cliente";
    const companyName = conversation.empresas?.nome || "Empresa";

    const systemPrompt = `Você é um assistente interno para operadores humanos de atendimento ao cliente.
Sua função é ajudar o operador a responder melhor e mais rápido ao cliente.

REGRAS IMPORTANTES:
- Você NUNCA fala diretamente com o cliente
- Suas sugestões são apenas para o operador ver
- Seja conciso e prático
- Foque em ajudar o operador a resolver o problema do cliente

CONTEXTO:
- Empresa: ${companyName}
- Cliente: ${clientName}
- Canal: ${conversation.channel}

HISTÓRICO DA CONVERSA:
${conversationHistory || "Nenhuma mensagem ainda."}

Com base neste contexto, forneça:
1. Um resumo conciso da conversa (máximo 2 frases)
2. A intenção detectada do cliente (uma palavra ou frase curta)
3. Exatamente 3 sugestões de resposta que o operador pode usar (curtas, diretas, profissionais)
4. 2-3 próximas ações sugeridas (ex: "Propor agendamento", "Enviar link de pagamento", "Devolver à IA")

Responda APENAS em formato JSON válido seguindo esta estrutura exata:
{
  "summary": "string",
  "detectedIntent": "string", 
  "suggestedReplies": ["string", "string", "string"],
  "nextActions": ["string", "string"]
}`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analise a conversa e forneça as sugestões para o operador." },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse JSON from AI response
    let assistantData: AssistantResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        assistantData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Provide fallback response
      assistantData = {
        summary: "Não foi possível analisar a conversa automaticamente.",
        detectedIntent: "Indefinido",
        suggestedReplies: [
          "Olá! Como posso ajudá-lo hoje?",
          "Entendo. Deixe-me verificar isso para si.",
          "Há mais alguma coisa em que posso ajudar?",
        ],
        nextActions: ["Continuar atendimento", "Devolver à IA"],
      };
    }

    console.log("Operator assistant generated suggestions for conversation:", conversationId);

    return new Response(JSON.stringify(assistantData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Operator assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
