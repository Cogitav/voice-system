import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify identity
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

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller's role and empresa
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

    // Check permissions
    const isAdmin = caller.role === 'admin';
    const isCoordinator = caller.role === 'cliente_coordenador';

    if (!isAdmin && !isCoordinator) {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores e coordenadores podem criar utilizadores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();

    // Validate required fields
    if (!body.nome || !body.email) {
      return new Response(
        JSON.stringify({ error: 'Nome e email são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the role and empresa based on caller permissions
    let targetRole: AppRole;
    let targetEmpresaId: string;

    if (isAdmin) {
      // Admins can create any role except admin
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
      // Coordinators can only create cliente_normal within their empresa
      if (!caller.empresaId) {
        return new Response(
          JSON.stringify({ error: 'Coordenador sem empresa associada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetRole = 'cliente_normal';
      targetEmpresaId = caller.empresaId;
    }

    // Verify empresa exists
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

    // Invite user by email - this sends an invite email with a link to set password
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: { nome: body.nome },
      }
    );

    if (authError) {
      // Handle duplicate email error
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

    // Create profile
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

    // Assign role
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

    console.log(`User created successfully: ${userId}, role: ${targetRole}, empresa: ${targetEmpresaId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Convite enviado com sucesso para o email do utilizador',
        user_id: userId,
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
