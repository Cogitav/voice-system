import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BusinessHour {
  id: string;
  empresa_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

export interface BusinessHourFormData {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

export { DAY_LABELS };

export function useBusinessHours(empresaId?: string) {
  return useQuery({
    queryKey: ['business-hours', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduling_business_hours')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('day_of_week', { ascending: true });
      if (error) throw error;
      return data as BusinessHour[];
    },
    enabled: !!empresaId,
  });
}

export function useUpsertBusinessHours(empresaId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hours: BusinessHourFormData[]) => {
      // Delete existing and re-insert (upsert strategy)
      await supabase
        .from('scheduling_business_hours')
        .delete()
        .eq('empresa_id', empresaId!);

      if (hours.length > 0) {
        const { error } = await supabase
          .from('scheduling_business_hours')
          .insert(hours.map(h => ({ ...h, empresa_id: empresaId! })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours', empresaId] });
      toast.success('Horário de funcionamento guardado');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao guardar horário: ${error.message}`);
    },
  });
}
