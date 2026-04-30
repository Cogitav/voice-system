import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 🔥 AUTH
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Sem token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔥 CHECK ADMIN — server-side role resolution via SECURITY DEFINER RPC
    // Mirrors the pattern used by manage-ai-provider; relies on user_roles table,
    // never on client-supplied claims. RPC runs under the user's JWT.
    const { data: roleData, error: roleLookupError } = await supabaseUser.rpc('get_current_user_role');

    if (roleLookupError) {
      console.error("ROLE LOOKUP ERROR:", roleLookupError);
      return new Response(
        JSON.stringify({ error: 'Não foi possível verificar permissões' }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (roleData !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem criar utilizadores' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // 🔥 ADMIN CLIENT
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();

    if (!body.email || !body.nome) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 🔥 CREATE USER (INVITE)
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: { nome: body.nome },
      }
    );

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userId = data.user.id;

    // 🔥 CREATE PROFILE (COM ERRO VISÍVEL)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        nome: body.nome,
        email: body.email,
        empresa_id: body.empresa_id || null,
        status: 'ativo',
      });

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);

      return new Response(
        JSON.stringify({ error: 'Erro profile: ' + profileError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 🔥 CREATE ROLE (COM ERRO VISÍVEL)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: body.role || 'cliente_normal',
      });

    if (roleError) {
      console.error("ROLE ERROR:", roleError);

      return new Response(
        JSON.stringify({ error: 'Erro role: ' + roleError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Utilizador criado com sucesso',
        user_id: userId,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err: any) {
    console.error("ERROR:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});