import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM } from "../_shared/llm-provider.ts";

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
  success?: boolean;
  message?: string;
  summary: string;
  detectedIntent: string;
  suggestedReplies: string[];
  nextActions: string[];
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fallbackAssistantResponse(message: string): AssistantResponse {
  return {
    success: false,
    message,
    summary: "Sugestoes automaticas temporariamente indisponiveis.",
    detectedIntent: "Indefinido",
    suggestedReplies: [
      "Ola! Estou a acompanhar o seu pedido. Pode dar-me mais alguns detalhes?",
      "Obrigado pela informacao. Vou verificar internamente e ja lhe dou uma resposta.",
      "Percebo. Posso ajudar com mais alguma coisa relacionada com este pedido?",
    ],
    nextActions: [
      "Continuar atendimento manual",
      "Pedir mais contexto",
      "Devolver a IA quando apropriado",
    ],
  };
}

function normalizeAssistantData(value: unknown): AssistantResponse {
  const data = value as Partial<AssistantResponse> | null;
  const fallback = fallbackAssistantResponse("Sugestoes indisponiveis.");
  const suggestedReplies = Array.isArray(data?.suggestedReplies)
    ? data.suggestedReplies.filter((item): item is string => typeof item === "string").slice(0, 3)
    : [];
  const nextActions = Array.isArray(data?.nextActions)
    ? data.nextActions.filter((item): item is string => typeof item === "string").slice(0, 3)
    : [];

  return {
    success: true,
    summary: typeof data?.summary === "string" && data.summary.trim()
      ? data.summary
      : "Resumo indisponivel.",
    detectedIntent: typeof data?.detectedIntent === "string" && data.detectedIntent.trim()
      ? data.detectedIntent
      : "Indefinido",
    suggestedReplies: suggestedReplies.length > 0 ? suggestedReplies : fallback.suggestedReplies,
    nextActions: nextActions.length > 0 ? nextActions : fallback.nextActions,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(fallbackAssistantResponse("Sessao invalida. Volte a iniciar sessao."));
    }

    let body: { conversationId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(fallbackAssistantResponse("Pedido invalido."));
    }

    const conversationId = body.conversationId;
    if (!conversationId) {
      return jsonResponse(fallbackAssistantResponse("Conversa nao indicada."));
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      console.error("Operator assistant missing Supabase environment variables");
      return jsonResponse(fallbackAssistantResponse("Configuracao Supabase indisponivel."));
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, empresas(nome)")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Error fetching conversation:", convError);
      return jsonResponse(fallbackAssistantResponse("Conversa nao encontrada ou sem acesso."));
    }

    if (conversation.status !== "human_active") {
      return jsonResponse(
        fallbackAssistantResponse("O assistente interno so fica disponivel quando o atendimento humano esta ativo."),
      );
    }

    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return jsonResponse(fallbackAssistantResponse("Nao foi possivel carregar as mensagens da conversa."));
    }

    const conversationHistory = (messages || [])
      .filter((m: Message) => !m.is_internal)
      .map((m: Message) => {
        const sender = m.sender_type === "client" ? "Cliente" : m.sender_type === "ai" ? "IA" : "Operador";
        return `[${sender}]: ${m.content}`;
      })
      .join("\n");

    const clientName = conversation.client_name || conversation.client_identifier || "Cliente";
    const companyName = conversation.empresas?.nome || "Empresa";

    const systemPrompt = `Es um assistente interno para operadores humanos de atendimento ao cliente.
A tua funcao e ajudar o operador a responder melhor e mais rapidamente ao cliente.

REGRAS IMPORTANTES:
- Nunca falas diretamente com o cliente.
- As sugestoes sao apenas para o operador.
- Se conciso, pratico e profissional.
- Foca-te em ajudar o operador a resolver o problema do cliente.

CONTEXTO:
- Empresa: ${companyName}
- Cliente: ${clientName}
- Canal: ${conversation.channel}

HISTORICO DA CONVERSA:
${conversationHistory || "Nenhuma mensagem ainda."}

Com base neste contexto, fornece:
1. Um resumo conciso da conversa, maximo 2 frases.
2. A intencao detectada do cliente, numa palavra ou frase curta.
3. Exatamente 3 sugestoes de resposta que o operador pode usar.
4. 2-3 proximas acoes sugeridas.

Responde APENAS em JSON valido com esta estrutura:
{
  "summary": "string",
  "detectedIntent": "string",
  "suggestedReplies": ["string", "string", "string"],
  "nextActions": ["string", "string"]
}`;

    if (!conversation.empresa_id) {
      return jsonResponse(fallbackAssistantResponse("Conversa sem empresa associada."));
    }

    let content = "";
    try {
      const llmResponse = await callLLM({
        system_prompt: systemPrompt,
        user_message: "Analisa a conversa e fornece sugestoes para o operador.",
        response_format: "json",
        temperature: 0.2,
        max_tokens: 700,
      }, conversation.empresa_id);
      content = llmResponse.content;
    } catch (llmError) {
      console.error("Operator assistant LLM unavailable:", llmError);
      return jsonResponse(fallbackAssistantResponse("Fornecedor de IA indisponivel ou nao configurado."));
    }

    if (!content) {
      return jsonResponse(fallbackAssistantResponse("O fornecedor de IA devolveu uma resposta vazia."));
    }

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const assistantData = normalizeAssistantData(JSON.parse(jsonMatch[0]));
      console.log("Operator assistant generated suggestions for conversation:", conversationId);
      return jsonResponse(assistantData);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content, parseError);
      return jsonResponse(fallbackAssistantResponse("Nao foi possivel interpretar a resposta da IA."));
    }
  } catch (error) {
    console.error("Operator assistant error:", error);
    return jsonResponse(
      fallbackAssistantResponse(error instanceof Error ? error.message : "Erro inesperado no assistente interno."),
    );
  }
});
