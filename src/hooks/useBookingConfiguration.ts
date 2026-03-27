import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BookingConfiguration {
  id: string;
  empresa_id: string;
  require_name: boolean;
  require_email: boolean;
  require_phone: boolean;
  require_reason: boolean;
  allow_same_day_booking: boolean;
  allow_outside_business_hours: boolean;
  minimum_advance_minutes: number;
  allow_internal_calendar: boolean;
  allow_external_calendar: boolean;
  fallback_service_id: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingConfigurationUpdate = Partial<Omit<BookingConfiguration, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>>;

export function useBookingConfiguration(empresaId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['booking-configuration', empresaId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!empresaId) return null;
      const { data, error } = await supabase
        .from('booking_configuration' as any)
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BookingConfiguration | null;
    },
    enabled: !!empresaId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: BookingConfigurationUpdate) => {
      if (!empresaId) throw new Error('empresa_id required');
      const { data, error } = await supabase
        .from('booking_configuration' as any)
        .update(updates as any)
        .eq('empresa_id', empresaId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Configuração de agendamento guardada');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao guardar: ${error.message}`);
    },
  });

  return {
    config: query.data,
    isLoading: query.isLoading,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
