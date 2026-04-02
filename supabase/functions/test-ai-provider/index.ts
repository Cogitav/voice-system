import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for provider access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to check role
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient.rpc('get_current_user_role');
    
    if (roleError || roleData !== 'admin') {
      console.error('Access denied - not admin:', roleError);
      return new Response(
        JSON.stringify({ success: false, message: 'Apenas administradores podem testar fornecedores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { providerId } = await req.json();

    if (!providerId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Provider ID é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get provider details using admin client
    const { data: provider, error: providerError } = await supabaseAdmin
      .from('ai_providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (providerError || !provider) {
      console.error('Provider not found:', providerError);
      return new Response(
        JSON.stringify({ success: false, message: 'Fornecedor não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!provider.api_key) {
      // Update status
      await supabaseAdmin
        .from('ai_providers')
        .update({ status: 'inactive', last_tested_at: new Date().toISOString() })
        .eq('id', providerId);

      return new Response(
        JSON.stringify({ success: false, message: 'Chave de API não configurada', status: 'inactive' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test the API connection based on provider type
    let testSuccess = false;
    let testMessage = '';

    try {
      if (provider.provider_key === 'openai') {
        // Test OpenAI API
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${provider.api_key}`,
          },
        });

        if (response.ok) {
          testSuccess = true;
          testMessage = 'Ligação OpenAI bem sucedida';
        } else {
          const errorData = await response.json().catch(() => ({}));
          testMessage = errorData.error?.message || `Erro HTTP ${response.status}`;
        }
      } else if (provider.provider_key === 'google') {
        // Test Google Gemini API via a simple model list call
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${provider.api_key}`, {
          method: 'GET',
        });

        if (response.ok) {
          testSuccess = true;
          testMessage = 'Ligação Google Gemini bem sucedida';
        } else {
          const errorData = await response.json().catch(() => ({}));
          testMessage = errorData.error?.message || `Erro HTTP ${response.status}`;
        }
      } else {
        testMessage = 'Fornecedor não suportado para testes';
      }
    } catch (apiError) {
      console.error('API test error:', apiError);
      testMessage = apiError instanceof Error ? apiError.message : 'Erro de ligação';
    }

    // Update provider status
    const newStatus = testSuccess ? 'active' : 'auth_error';
    await supabaseAdmin
      .from('ai_providers')
      .update({ 
        status: newStatus, 
        last_tested_at: new Date().toISOString(),
        // Also enable if test successful and was disabled
        ...(testSuccess && !provider.is_enabled ? {} : {})
      })
      .eq('id', providerId);

    console.log(`[AI Provider Test] ${provider.provider_key}: ${testSuccess ? 'SUCCESS' : 'FAILED'} - ${testMessage}`);

    return new Response(
      JSON.stringify({ 
        success: testSuccess, 
        message: testMessage,
        status: newStatus 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Test AI provider error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro interno',
        status: 'auth_error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
