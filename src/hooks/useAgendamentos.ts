import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Agendamento {
  id: string;
  empresa_id: string;
  empresa_nome?: string;
  agente_id: string | null;
  agente_nome?: string;
  chamada_id: string | null;
  data: string;
  hora: string;
  estado: string;
  notas: string | null;
  cliente_telefone: string | null;
  cliente_nome: string | null;
  external_calendar_id: string | null;
  external_calendar_type: string | null;
  created_at: string;
}

export interface AgendamentoFormData {
  empresa_id: string;
  agente_id?: string | null;
  chamada_id?: string | null;
  data: string;
  hora: string;
  estado?: string;
  notas?: string;
  cliente_telefone?: string;
  cliente_nome?: string;
}

export interface AgendamentoFilters {
  empresa_id?: string;
  agente_id?: string;
  estado?: string;
  data_inicio?: string;
  data_fim?: string;
}

export function useAgendamentos(filters?: AgendamentoFilters) {
  return useQuery({
    queryKey: ['agendamentos', filters],
    queryFn: async () => {
      let query = supabase
        .from('agendamentos')
        .select(`
          id,
          empresa_id,
          agente_id,
          chamada_id,
          data,
          hora,
          estado,
          notas,
          cliente_telefone,
          cliente_nome,
          external_calendar_id,
          external_calendar_type,
          created_at,
          empresas(nome),
          agentes(nome)
        `)
        .order('data', { ascending: true })
        .order('hora', { ascending: true });

      if (filters?.empresa_id) {
        query = query.eq('empresa_id', filters.empresa_id);
      }
      if (filters?.agente_id) {
        query = query.eq('agente_id', filters.agente_id);
      }
      if (filters?.estado) {
        query = query.eq('estado', filters.estado);
      }
      if (filters?.data_inicio) {
        query = query.gte('data', filters.data_inicio);
      }
      if (filters?.data_fim) {
        query = query.lte('data', filters.data_fim);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data.map((agendamento: any) => ({
        ...agendamento,
        empresa_nome: agendamento.empresas?.nome || 'N/A',
        agente_nome: agendamento.agentes?.nome || null,
      })) as Agendamento[];
    },
  });
}

export function useAgendamento(id: string | undefined) {
  return useQuery({
    queryKey: ['agendamentos', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('agendamentos')
        .select(`
          id,
          empresa_id,
          agente_id,
          chamada_id,
          data,
          hora,
          estado,
          notas,
          cliente_telefone,
          cliente_nome,
          external_calendar_id,
          external_calendar_type,
          created_at,
          empresas(nome),
          agentes(nome)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) return null;

      return {
        ...data,
        empresa_nome: (data as any).empresas?.nome || 'N/A',
        agente_nome: (data as any).agentes?.nome || null,
      } as Agendamento;
    },
    enabled: !!id,
  });
}

export function useCreateAgendamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: AgendamentoFormData) => {
      const { data, error } = await supabase
        .from('agendamentos')
        .insert({
          empresa_id: formData.empresa_id,
          agente_id: formData.agente_id || null,
          chamada_id: formData.chamada_id || null,
          data: formData.data,
          hora: formData.hora,
          estado: formData.estado || 'pendente',
          notas: formData.notas || null,
          cliente_telefone: formData.cliente_telefone || null,
          cliente_nome: formData.cliente_nome || null,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      toast.success('Agendamento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar agendamento: ${error.message}`);
    },
  });
}

export function useUpdateAgendamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgendamentoFormData> }) => {
      const { data: agendamento, error } = await supabase
        .from('agendamentos')
        .update({
          empresa_id: data.empresa_id,
          agente_id: data.agente_id,
          data: data.data,
          hora: data.hora,
          estado: data.estado,
          notas: data.notas,
          cliente_telefone: data.cliente_telefone,
          cliente_nome: data.cliente_nome,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return agendamento;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      toast.success('Agendamento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar agendamento: ${error.message}`);
    },
  });
}

export function useDeleteAgendamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      toast.success('Agendamento eliminado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar agendamento: ${error.message}`);
    },
  });
}
