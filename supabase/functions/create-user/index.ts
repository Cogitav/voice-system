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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 🔴 AUTH FIX
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado (sem token)' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, anonKey);

    const {
      data: { user: authUser },
      error: userError,
    } = await supabaseUser.auth.getUser(token);

    if (userError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado (token inválido)' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔴 ADMIN CLIENT
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 🔴 ROLE CHECK
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id)
      .maybeSingle();

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('empresa_id')
      .eq('user_id', authUser.id)
      .maybeSingle();

    const caller: CallerInfo = {
      userId: authUser.id,
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
          JSON.stringify({ error: 'Role inválido' }),
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

    // 🔴 CREATE USER (INVITE FLOW)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
        data: { nome: body.nome },
      });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user.id;

    // 🔴 PROFILE
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabaseAdmin.from('profiles').insert({
        user_id: userId,
        empresa_id: targetEmpresaId,
        nome: body.nome,
        email: body.email,
        status: body.status || 'ativo',
      });
    }

    // 🔴 ROLE
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingRole) {
      await supabaseAdmin.from('user_roles').insert({
        user_id: userId,
        role: targetRole,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});