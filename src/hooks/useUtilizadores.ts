import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth, AppRole } from '@/contexts/AuthContext';

export interface Utilizador {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  role: AppRole;
  status: string;
  created_at: string;
}

export interface CreateUtilizadorData {
  nome: string;
  email: string;
  empresa_id: string;
  role: 'cliente_coordenador' | 'cliente_normal';
  status: string;
}

export interface UpdateUtilizadorData {
  profileId: string;
  nome?: string;
  role?: 'cliente_coordenador' | 'cliente_normal';
  status?: string;
}

export function useUtilizadores(empresaFilter?: string, includeArchived = false) {
  const { isAdmin, profile } = useAuth();

  return useQuery({
    queryKey: ['utilizadores', empresaFilter, includeArchived],
    queryFn: async () => {
      // Fetch profiles with empresa info
      let query = supabase
        .from('profiles')
        .select(`
          id,
          user_id,
          nome,
          email,
          empresa_id,
          status,
          created_at,
          deleted_at,
          empresas (nome, deleted_at)
        `)
        .order('created_at', { ascending: false });

      // Apply empresa filter if provided (admin filtering) or auto-filter for coordinators
      if (empresaFilter) {
        query = query.eq('empresa_id', empresaFilter);
      } else if (!isAdmin && profile?.empresa_id) {
        query = query.eq('empresa_id', profile.empresa_id);
      }

      // Filter out soft-deleted unless explicitly requested
      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }

      const { data: profiles, error: profilesError } = await query;

      if (profilesError) {
        throw new Error(profilesError.message);
      }

      // Filter out users from deleted empresas (unless viewing archived)
      const filteredProfiles = includeArchived 
        ? profiles 
        : (profiles || []).filter((p: any) => !p.empresas?.deleted_at);

      // Fetch roles for the users we have access to
      const userIds = (filteredProfiles || []).map(p => p.user_id);
      
      if (userIds.length === 0) {
        return [];
      }

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (rolesError) {
        throw new Error(rolesError.message);
      }

      // Create a map of user_id to role
      const roleMap = new Map<string, AppRole>();
      roles?.forEach((r) => {
        roleMap.set(r.user_id, r.role as AppRole);
      });

      // Combine data
      const utilizadores: Utilizador[] = (filteredProfiles || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        nome: p.nome,
        email: p.email,
        empresa_id: p.empresa_id,
        empresa_nome: p.empresas?.nome || null,
        role: roleMap.get(p.user_id) || 'cliente_normal',
        status: p.status,
        created_at: p.created_at,
      }));

      return utilizadores;
    },
  });
}

export function useCreateUtilizador() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUtilizadorData) => {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session.session) {
        throw new Error('Não autenticado');
      }

      const response = await fetch(
        'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar utilizador');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      toast.success('Convite enviado com sucesso!', {
        description: 'O utilizador receberá um email para definir a sua password.',
        duration: 6000,
      });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar utilizador: ${error.message}`);
    },
  });
}

export function useUpdateUtilizador() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, nome, role, status }: UpdateUtilizadorData) => {
      // Update profile if nome or status changed
      if (nome !== undefined || status !== undefined) {
        const updates: { nome?: string; status?: string } = {};
        if (nome !== undefined) updates.nome = nome;
        if (status !== undefined) updates.status = status;

        const { error: profileError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', profileId);

        if (profileError) {
          throw new Error(profileError.message);
        }
      }

      // Update role if changed (admin only, handled at RLS level)
      if (role !== undefined) {
        // First get the user_id from profile
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', profileId)
          .single();

        if (fetchError || !profile) {
          throw new Error('Perfil não encontrado');
        }

        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', profile.user_id);

        if (roleError) {
          throw new Error(roleError.message);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      toast.success('Utilizador atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar utilizador: ${error.message}`);
    },
  });
}

export function useUpdateUtilizadorStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, status }: { profileId: string; status: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', profileId);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      toast.success('Status atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar status: ${error.message}`);
    },
  });
}

export function useEmpresaUserCount(empresaId?: string) {
  return useQuery({
    queryKey: ['empresa-user-count', empresaId],
    queryFn: async () => {
      if (!empresaId) return 0;
      
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId);

      if (error) {
        throw new Error(error.message);
      }

      return count || 0;
    },
    enabled: !!empresaId,
  });
}
