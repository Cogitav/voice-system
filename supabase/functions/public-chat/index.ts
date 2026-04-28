import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createEmptyContext } from '../_shared/context-manager.ts';
import { log } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, sessionId, empresaSlug, conversationId, content } = body;

    if (!action) {
      return response({ error: 'Missing action' }, 400);
    }

    const db = getServiceClient();

    // ACTION: get-empresa
    if (action === 'get-empresa') {
      if (!empresaSlug) return response({ error: 'Missing empresaSlug' }, 400);

      const { data: empresa } = await db
        .from('empresas')
        .select(`
          id,
          nome,
          slug,
          widget_primary_color,
          widget_secondary_color,
          widget_background_color,
          widget_user_message_color,
          widget_agent_message_color,
          widget_agent_text_color,
          widget_user_text_color,
          widget_input_background_color,
          widget_input_text_color,
          widget_button_color,
          widget_theme_mode,
          widget_border_radius,
          widget_size,
          widget_header_text,
          widget_avatar_url,
          default_welcome_message,
          service_chat_enabled
        `)
        .eq('slug', empresaSlug)
        .eq('status', 'ativo')
        .single();

      if (!empresa || !empresa.service_chat_enabled) {
        return response({ error: 'Chat not available' }, 403);
      }

      const { data: agent } = await db
        .from('agentes')
        .select('nome, welcome_message, initial_greeting, response_delay_ms')
        .eq('empresa_id', empresa.id)
        .eq('is_default_chat_agent', true)
        .eq('status', 'ativo')
        .single();

      const branding = {
        widget_primary_color: empresa.widget_primary_color ?? null,
        widget_secondary_color: empresa.widget_secondary_color ?? null,
        widget_background_color: empresa.widget_background_color ?? null,
        widget_user_message_color: empresa.widget_user_message_color ?? null,
        widget_agent_message_color: empresa.widget_agent_message_color ?? null,
        widget_agent_text_color: empresa.widget_agent_text_color ?? null,
        widget_user_text_color: empresa.widget_user_text_color ?? null,
        widget_input_background_color: empresa.widget_input_background_color ?? null,
        widget_input_text_color: empresa.widget_input_text_color ?? null,
        widget_button_color: empresa.widget_button_color ?? null,
        widget_theme_mode: empresa.widget_theme_mode ?? null,
        widget_border_radius: empresa.widget_border_radius ?? null,
        widget_size: empresa.widget_size ?? null,
        widget_header_text: empresa.widget_header_text ?? null,
        widget_avatar_url: empresa.widget_avatar_url ?? null,
      };

      console.log('[FLOW_BRANDING_PAYLOAD_READY]', JSON.stringify({
        empresa_id: empresa.id,
        empresa_slug: empresa.slug,
        branding_fields: Object.keys(branding),
      }));

      return response({ empresa, agent, branding });
    }

    // ACTION: init-conversation
    if (action === 'init-conversation') {
      if (!empresaSlug) return response({ error: 'Missing empresaSlug' }, 400);

      const { data: empresa } = await db
        .from('empresas')
        .select('id, service_chat_enabled')
        .eq('slug', empresaSlug)
        .eq('status', 'ativo')
        .single();

      if (!empresa || !empresa.service_chat_enabled) {
        return response({ error: 'Chat not available' }, 403);
      }

      const emptyContext = createEmptyContext();

      const { data: conv } = await db
        .from('conversations')
        .insert({
          empresa_id: empresa.id,
          channel: 'chat',
          status: 'ai_active',
          owner: 'ai',
          client_identifier: sessionId ?? `anon-${crypto.randomUUID()}`,
          conversation_state: 'idle',
          conversation_context: emptyContext,
          context_version: 1,
        })
        .select('id')
        .single();

      if (!conv) return response({ error: 'Failed to create conversation' }, 500);

      await log({
        empresa_id: empresa.id,
        conversation_id: conv.id,
        event_type: 'CONVERSATION_STARTED',
        message: 'New conversation via public-chat widget',
      });

      const { data: agent } = await db
        .from('agentes')
        .select('welcome_message, initial_greeting')
        .eq('empresa_id', empresa.id)
        .eq('is_default_chat_agent', true)
        .eq('status', 'ativo')
        .single();

      const { data: menuServices } = await db
        .from('scheduling_services')
        .select('id, name, description, priority')
        .eq('empresa_id', empresa.id)
        .eq('show_in_chat_menu', true)
        .eq('status', 'active')
        .eq('bookable', true)
        .order('priority', { ascending: true })
        .limit(8);

      const baseMessage = agent?.initial_greeting ?? agent?.welcome_message ?? 'Olá! Como posso ajudar?';

      let welcomeMessage = baseMessage;
      if (menuServices && menuServices.length > 0) {
        const serviceList = menuServices
          .map((s, i) => `${i + 1}. ${s.name}${s.description ? ` — ${s.description}` : ''}`)
          .join('\n');
        welcomeMessage = `${baseMessage}\n\nComo posso ajudar? Escolha uma opção ou escreva a sua questão:\n\n${serviceList}`;
      }

      await db.from('messages').insert({
        conversation_id: conv.id,
        sender_type: 'ai',
        content: welcomeMessage,
      });

      return response({
        conversationId: conv.id,
        welcomeMessage,
        greetingMessage: welcomeMessage,
      });
    }

    // ACTION: get-conversation
    if (action === 'get-conversation') {
      if (!conversationId) return response({ error: 'Missing conversationId' }, 400);

      const { data: conv } = await db
        .from('conversations')
        .select('id, status, owner, conversation_state')
        .eq('id', conversationId)
        .single();

      if (!conv) return response({ error: 'Conversation not found' }, 404);

      return response({ conversation: conv });
    }

    // ACTION: get-messages
    if (action === 'get-messages') {
      if (!conversationId) return response({ error: 'Missing conversationId' }, 400);

      const { data: messages } = await db
        .from('messages')
        .select('id, sender_type, content, created_at')
        .eq('conversation_id', conversationId)
        .eq('is_internal', false)
        .order('created_at', { ascending: true });

      return response({ messages: messages ?? [] });
    }

    // ACTION: send-message
    if (action === 'send-message') {
      if (!conversationId || !content) {
        return response({ error: 'Missing conversationId or content' }, 400);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const aiResponse = await fetch(`${supabaseUrl}/functions/v1/chat-ai-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: content }),
      });

      const aiData = await aiResponse.json();

      return response({
        reply: aiData.reply,
        blocked: aiData.blocked ?? false,
        error: aiData.error ?? null,
      });
    }

    return response({ error: `Unknown action: ${action}` }, 400);

  } catch (error) {
    console.error('[PUBLIC_CHAT_ERROR]', error);
    return response({ error: 'Internal error' }, 500);
  }
});
