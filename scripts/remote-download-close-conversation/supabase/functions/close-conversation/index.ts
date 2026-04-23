import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLeadIfEligible } from '../_shared/lead-manager.ts';
import { getContext } from '../_shared/context-manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { conversation_id, reason, closed_by } = await req.json();

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'Missing conversation_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const db = getServiceClient();

    const { data: conv } = await db
      .from('conversations')
      .select('id, empresa_id, status')
      .eq('id', conversation_id)
      .single();

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conv.status === 'closed' || conv.status === 'completed') {
      return new Response(JSON.stringify({ success: true, already_closed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await db.from('conversations').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: closed_by ?? null,
      closure_reason: reason ?? 'manual',
    }).eq('id', conversation_id);

    const context = await getContext(conversation_id);
    const { data: agent } = await db
      .from('agentes')
      .select('id')
      .eq('empresa_id', conv.empresa_id)
      .eq('is_default_chat_agent', true)
      .single();

    await createLeadIfEligible(context, conv.empresa_id, agent?.id ?? '', conversation_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CLOSE_CONVERSATION_ERROR]', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
