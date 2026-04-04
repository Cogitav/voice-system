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

    // 🔥 AUTH HEADER
    const authHeader = req.headers.get("authorization");

    console.log("AUTH HEADER:", authHeader);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Sem token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔥 USER CLIENT
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

    console.log("AUTH USER:", user);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔥 ADMIN CLIENT
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 🔥 ROLE DEBUG
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('public.user_roles')
      .select('*')
      .eq('user_id', user.id);

    console.log("USER ID:", user.id);
    console.log("ROLE DATA:", roleData);
    console.log("ROLE ERROR:", roleError);

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Sem role associada' }),
        { status: 403, headers: corsHeaders }
      );
    }

    if (roleData[0].role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Sem permissões' }),
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json();

    if (!body.email || !body.nome) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 🔥 CREATE USER
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

    return new Response(
      JSON.stringify({
        success: true,
        user_id: data.user.id,
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