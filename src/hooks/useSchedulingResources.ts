import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SchedulingResource {
  id: string;
  empresa_id: string;
  name: string;
  type: 'person' | 'room' | 'equipment';
  status: 'active' | 'inactive';
  default_appointment_duration_minutes: number;
  calendar_type: string;
  external_calendar_id: string | null;
  priority: number;
  color: string | null;
  capacity: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SchedulingResourceFormData {
  name: string;
  type: 'person' | 'room' | 'equipment';
  status: 'active' | 'inactive';
  default_appointment_duration_minutes: number;
  calendar_type: string;
  external_calendar_id?: string;
  priority: number;
}

export function useSchedulingResources(empresaId?: string) {
  return useQuery({
    queryKey: ['scheduling-resources', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduling_resources')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('priority', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as SchedulingResource[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateSchedulingResource(empresaId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SchedulingResourceFormData) => {
      if (!empresaId || empresaId.trim() === '') {
        console.error('[Resources] Missing empresa_id in profile. Cannot create resource.');
        throw new Error('Empresa ID is missing. Cannot create resource.');
      }
      const payload = { ...data, empresa_id: empresaId };
      console.log('[Resources] Creating resource for empresa:', empresaId);
      const { error } = await supabase
        .from('scheduling_resources')
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources', empresaId] });
      console.log('[Resources] Resource created successfully');
      toast.success('Recurso criado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar recurso: ${error.message}`);
    },
  });
}

export function useUpdateSchedulingResource(empresaId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingResourceFormData> }) => {
      const { error } = await supabase
        .from('scheduling_resources')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources', empresaId] });
      toast.success('Recurso atualizado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar recurso: ${error.message}`);
    },
  });
}

export function useDeleteSchedulingResource(empresaId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduling_resources')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources', empresaId] });
      toast.success('Recurso eliminado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar recurso: ${error.message}`);
    },
  });
}
