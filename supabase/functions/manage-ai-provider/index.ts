import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify admin auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: roleData, error: roleError } = await supabaseClient.rpc('get_current_user_role');
    if (roleError || roleData !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem gerir fornecedores de IA' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { action, providerId, apiKey, isEnabled } = await req.json();

    if (!providerId) {
      return new Response(
        JSON.stringify({ error: 'providerId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_key') {
      // Save API key server-side only
      const updates: Record<string, unknown> = {
        api_key: apiKey || null,
        status: 'inactive', // reset status when key changes
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from('ai_providers')
        .update(updates)
        .eq('id', providerId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: 'Chave de API atualizada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'toggle_enabled') {
      const updates: Record<string, unknown> = {
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      };
      if (!isEnabled) {
        updates.status = 'inactive';
      }

      const { error } = await supabaseAdmin
        .from('ai_providers')
        .update(updates)
        .eq('id', providerId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: isEnabled ? 'Fornecedor ativado' : 'Fornecedor desativado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não suportada' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('manage-ai-provider error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
