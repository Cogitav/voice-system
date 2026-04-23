import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { LIMITS } from '../_shared/constants.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const db = getServiceClient();
    const cutoff = new Date(Date.now() - LIMITS.idle_conversation_minutes * 60 * 1000).toISOString();

    const { data: idleConvs } = await db
      .from('conversations')
      .select('id, empresa_id')
      .in('status', ['ai_active', 'waiting_human'])
      .lt('last_message_at', cutoff);

    if (!idleConvs || idleConvs.length === 0) {
      return new Response(JSON.stringify({ closed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ids = idleConvs.map(c => c.id);

    await db.from('conversations')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closure_reason: 'idle_timeout',
      })
      .in('id', ids);

    console.log(`[CLOSE_IDLE] Closed ${ids.length} idle conversations`);

    return new Response(JSON.stringify({ closed: ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CLOSE_IDLE_ERROR]', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
