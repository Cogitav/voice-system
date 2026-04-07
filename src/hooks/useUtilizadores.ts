import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Utilizador {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  empresa_id: string | null;
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

// 🔥 GET UTILIZADORES (FIX BUILD)
export function useUtilizadores() {
  return useQuery({
    queryKey: ['utilizadores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return data || [];
    },
  });
}

// 🔥 CREATE UTILIZADOR
export function useCreateUtilizador() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUtilizadorData) => {

      if (!data.empresa_id) {
        throw new Error('empresa_id em falta');
      }

      const { data: sessionData, error } = await supabase.auth.getSession();

      if (error || !sessionData.session) {
        throw new Error('Sessão inválida');
      }

      const token = sessionData.session.access_token;

      if (!token) {
        throw new Error('Token não encontrado');
      }

      const response = await fetch(
        'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
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

      toast.success('Convite enviado com sucesso!');
    },

    onError: (error: Error) => {
      toast.error(`Erro ao criar utilizador: ${error.message}`);
    },
  });
}