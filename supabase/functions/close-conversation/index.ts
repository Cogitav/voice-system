import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CloseRequest {
  conversationId: string;
  closureReason: string;
  closureNote?: string;
}

interface SummaryResponse {
  summary: string;
  main_intent: string;
  result: string;
  next_action: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { conversationId, closureReason, closureNote } = await req.json() as CloseRequest;

    if (!conversationId || !closureReason) {
      return new Response(
        JSON.stringify({ error: 'conversationId and closureReason are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch conversation with messages
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, empresas(nome)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('Error fetching messages:', msgError);
    }

    // Generate AI summary
    let aiSummary: SummaryResponse = {
      summary: 'Conversa encerrada sem mensagens suficientes para análise.',
      main_intent: 'Não identificado',
      result: closureReason === 'resolved' ? 'Resolvido' : 'Não resolvido',
      next_action: 'Nenhuma ação necessária',
    };

    if (messages && messages.length > 0) {
      try {
        const conversationText = messages
          .map((m: any) => `${m.sender_type === 'client' ? 'Cliente' : m.sender_type === 'ai' ? 'IA' : 'Operador'}: ${m.content}`)
          .join('\n');

        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        if (LOVABLE_API_KEY) {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3-flash-preview',
              messages: [
                {
                  role: 'system',
                  content: `Você é um assistente que analisa conversas de atendimento ao cliente.
Analise a conversa abaixo e retorne um JSON com exatamente estas propriedades:
- summary: resumo conciso da conversa (máx 150 palavras)
- main_intent: a intenção principal do cliente (ex: "Dúvida sobre produto", "Suporte técnico", "Reclamação")
- result: o resultado da conversa (ex: "Resolvido", "Encaminhado", "Pendente follow-up", "Venda potencial")
- next_action: próxima ação sugerida, se aplicável (ex: "Enviar proposta", "Agendar reunião", "Nenhuma")

Responda APENAS com o JSON, sem texto adicional.`,
                },
                {
                  role: 'user',
                  content: `Motivo do encerramento: ${closureReason}
${closureNote ? `Nota do operador: ${closureNote}` : ''}

Conversa:
${conversationText}`,
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            
            try {
              // Try to parse JSON from the response
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                aiSummary = {
                  summary: parsed.summary || aiSummary.summary,
                  main_intent: parsed.main_intent || aiSummary.main_intent,
                  result: parsed.result || aiSummary.result,
                  next_action: parsed.next_action || aiSummary.next_action,
                };
              }
            } catch (parseError) {
              console.error('Failed to parse AI response:', parseError);
            }
          } else {
            console.error('AI API error:', aiResponse.status, await aiResponse.text());
          }
        }
      } catch (aiError) {
        console.error('Error generating AI summary:', aiError);
      }
    }

    // Update conversation with closure data and summary
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        status: 'closed',
        closure_reason: closureReason,
        closure_note: closureNote || null,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        summary: aiSummary.summary,
        main_intent: aiSummary.main_intent,
        result: aiSummary.result,
        next_action: aiSummary.next_action,
      })
      .eq('id', conversationId);

    if (updateError) {
      console.error('Error updating conversation:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to close conversation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert system message for closure event
    const { error: msgInsertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'system',
        content: `Conversa encerrada: ${closureReason === 'resolved' ? 'Resolvido' : closureReason === 'no_response' ? 'Sem resposta' : closureReason === 'spam' ? 'Spam' : closureReason === 'duplicate' ? 'Duplicado' : closureReason === 'transferred' ? 'Transferido' : 'Outro motivo'}`,
        is_internal: false,
      });

    if (msgInsertError) {
      console.error('Error inserting system message:', msgInsertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: aiSummary,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in close-conversation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
