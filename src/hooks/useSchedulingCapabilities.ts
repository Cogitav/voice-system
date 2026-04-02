import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SchedulingCapabilities {
  id: string;
  empresa_id: string;
  allow_create_appointment: boolean;
  allow_reschedule_appointment: boolean;
  allow_cancel_appointment: boolean;
  allow_view_availability: boolean;
  created_at: string;
  updated_at: string;
}

export type SchedulingCapabilitiesUpdate = Pick<
  SchedulingCapabilities,
  'allow_create_appointment' | 'allow_reschedule_appointment' | 'allow_cancel_appointment' | 'allow_view_availability'
>;

export function useSchedulingCapabilities(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['scheduling-capabilities', empresaId],
    queryFn: async () => {
      if (!empresaId) return null;
      const { data, error } = await supabase
        .from('scheduling_capabilities')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data as SchedulingCapabilities | null;
    },
    enabled: !!empresaId,
  });
}

export function useUpdateSchedulingCapabilities(empresaId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: SchedulingCapabilitiesUpdate) => {
      if (!empresaId) throw new Error('No empresa ID');

      const { data, error } = await supabase
        .from('scheduling_capabilities')
        .upsert({
          empresa_id: empresaId,
          ...updates,
        }, { onConflict: 'empresa_id' })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-capabilities', empresaId] });
      toast.success('Capacidades de agendamento atualizadas');
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });
}
