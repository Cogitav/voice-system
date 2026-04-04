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

    // 🔥 ROLE VIA METADATA
    const userRole = user.user_metadata?.role;

    if (userRole !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Sem permissões' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // 🔥 ADMIN CLIENT
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    if (!body.email || !body.nome) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 🔥 CREATE USER (com email)
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

    // 🔥 CRIAR PROFILE
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        nome: body.nome,
        email: body.email,
        status: 'ativo',
      });

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);
    }

    // 🔥 CRIAR ROLE
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'cliente_normal',
      });

    if (roleError) {
      console.error("ROLE ERROR:", roleError);
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