import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Lead {
  id: string;
  empresa_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  created_at: string;
  updated_at: string;
  // Joined data
  empresas?: { nome: string } | null;
  agentes?: { nome: string } | null;
}

interface UseLeadsParams {
  empresaId?: string;
  status?: Lead['status'];
  limit?: number;
}

export function useLeads(params: UseLeadsParams = {}) {
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['leads', params, userEmpresaId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          empresas:empresa_id(nome),
          agentes:agent_id(nome)
        `)
        .order('created_at', { ascending: false });

      // Filter by empresa (admins can see all, clients see their own)
      if (params.empresaId) {
        query = query.eq('empresa_id', params.empresaId);
      } else if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }

      if (params.status) {
        query = query.eq('status', params.status);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching leads:', error);
        throw error;
      }

      return data as Lead[];
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: Lead['status'] }) => {
      const { error } = await supabase
        .from('leads')
        .update({ status })
        .eq('id', leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Estado do lead atualizado');
    },
    onError: (error) => {
      console.error('Error updating lead status:', error);
      toast.error('Erro ao atualizar estado do lead');
    },
  });
}

// Lead statistics
export function useLeadsStats(empresaId?: string) {
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;
  const effectiveEmpresaId = empresaId || (!isAdmin ? userEmpresaId : undefined);

  return useQuery({
    queryKey: ['leads-stats', effectiveEmpresaId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('status, created_at');

      if (effectiveEmpresaId) {
        query = query.eq('empresa_id', effectiveEmpresaId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching leads stats:', error);
        throw error;
      }

      const stats = {
        total: data?.length || 0,
        new: 0,
        contacted: 0,
        qualified: 0,
        converted: 0,
        lost: 0,
        thisMonth: 0,
      };

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      data?.forEach((lead) => {
        if (lead.status) {
          stats[lead.status as keyof typeof stats]++;
        }
        if (new Date(lead.created_at) >= startOfMonth) {
          stats.thisMonth++;
        }
      });

      return stats;
    },
  });
}
