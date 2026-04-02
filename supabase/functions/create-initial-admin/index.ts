import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if admin already exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError) {
      throw new Error(`Error checking existing admins: ${checkError.message}`);
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Já existe um administrador no sistema.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Admin credentials
    const adminEmail = 'admin@voiceai.pt';
    const adminPassword = 'Admin123!';
    const adminName = 'Administrador Principal';

    // Create user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        nome: adminName,
      },
    });

    if (authError) {
      throw new Error(`Error creating auth user: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error('User was not created');
    }

    const userId = authData.user.id;

    // Create profile with empresa_id = NULL
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        empresa_id: null,
        nome: adminName,
        email: adminEmail,
        status: 'ativo',
      });

    if (profileError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Error creating profile: ${profileError.message}`);
    }

    // Assign admin role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'admin',
      });

    if (roleError) {
      // Rollback: delete profile and auth user
      await supabaseAdmin.from('profiles').delete().eq('user_id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Error assigning role: ${roleError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Administrador criado com sucesso!',
        credentials: {
          email: adminEmail,
          password: adminPassword,
        },
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
