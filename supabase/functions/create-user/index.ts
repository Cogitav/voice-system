import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type AppRole = 'admin' | 'cliente_coordenador' | 'cliente_normal';

interface CreateUserRequest {
  nome: string;
  email: string;
  empresa_id: string | null;
  role: AppRole;
  status: string;
}

interface CallerInfo {
  userId: string;
  role: AppRole | null;
  empresaId: string | null;
}

serve(async (req) => {

  console.log("METHOD:", req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('empresa_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const caller: CallerInfo = {
      userId: user.id,
      role: callerRole?.role as AppRole | null,
      empresaId: callerProfile?.empresa_id || null,
    };

    const isAdmin = caller.role === 'admin';
    const isCoordinator = caller.role === 'cliente_coordenador';

    if (!isAdmin && !isCoordinator) {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores e coordenadores podem criar utilizadores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateUserRequest = await req.json();

    if (!body.nome || !body.email) {
      return new Response(
        JSON.stringify({ error: 'Nome e email são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let targetRole: AppRole;
    let targetEmpresaId: string;

    if (isAdmin) {
      const allowedRoles: AppRole[] = ['cliente_coordenador', 'cliente_normal'];
      if (!body.role || !allowedRoles.includes(body.role)) {
        return new Response(
          JSON.stringify({ error: 'Role inválido. Apenas cliente_coordenador ou cliente_normal são permitidos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!body.empresa_id) {
        return new Response(
          JSON.stringify({ error: 'Empresa é obrigatória' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetRole = body.role;
      targetEmpresaId = body.empresa_id;
    } else {
      if (!caller.empresaId) {
        return new Response(
          JSON.stringify({ error: 'Coordenador sem empresa associada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetRole = 'cliente_normal';
      targetEmpresaId = caller.empresaId;
    }

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .select('id')
      .eq('id', targetEmpresaId)
      .maybeSingle();

    if (empresaError || !empresa) {
      return new Response(
        JSON.stringify({ error: 'Empresa não encontrada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Invite user — sends email with link to set password
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: { nome: body.nome },
      }
    );

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return new Response(
          JSON.stringify({ error: 'Este email já está registado no sistema' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Erro ao criar utilizador: ${authError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: 'Utilizador não foi criado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user.id;

    // ✅ CORRECÇÃO: Verifica se o perfil já existe antes de inserir
    // (pode acontecer se o convite já foi enviado anteriormente)
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: userId,
          empresa_id: targetEmpresaId,
          nome: body.nome,
          email: body.email,
          status: body.status || 'ativo',
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: `Erro ao criar perfil: ${profileError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ✅ CORRECÇÃO: Verifica se o role já existe antes de inserir
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role: targetRole,
        });

      if (roleInsertError) {
        console.error('Role assignment error:', roleInsertError);
        await supabaseAdmin.from('profiles').delete().eq('user_id', userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: `Erro ao atribuir role: ${roleInsertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`User created successfully: ${userId}, role: ${targetRole}, empresa: ${targetEmpresaId}`);

    // ✅ CORRECÇÃO: Devolve os dados completos do utilizador criado
    // para o frontend poder actualizar a lista sem precisar de fazer refresh
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Convite enviado com sucesso para o email do utilizador',
        user: {
          user_id: userId,
          nome: body.nome,
          email: body.email,
          role: targetRole,
          empresa_id: targetEmpresaId,
          status: body.status || 'ativo',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});