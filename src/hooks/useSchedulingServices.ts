import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SchedulingService {
  id: string;
  empresa_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  status: 'active' | 'inactive';
  priority: number;
  show_in_chat_menu: boolean;
  bookable: boolean;
  price: number | null;
  currency: string | null;
  promo_price: number | null;
  promo_start: string | null;
  promo_end: string | null;
  requires_reason: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulingServiceFormData {
  name: string;
  description?: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  status: 'active' | 'inactive';
  priority: number;
  show_in_chat_menu: boolean;
  bookable: boolean;
  price?: number | null;
  currency?: string;
  promo_price?: number | null;
  promo_start?: string | null;
  promo_end?: string | null;
  requires_reason?: boolean | null;
}

export function useSchedulingServices(empresaId?: string) {
  return useQuery({
    queryKey: ['scheduling-services', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduling_services')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('priority', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as SchedulingService[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateSchedulingService(empresaId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SchedulingServiceFormData) => {
      const { error } = await supabase
        .from('scheduling_services')
        .insert({ ...data, empresa_id: empresaId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services', empresaId] });
      toast.success('Serviço criado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar serviço: ${error.message}`);
    },
  });
}

export function useUpdateSchedulingService(empresaId?: string) {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingServiceFormData> }) => {
      // Defense-in-depth: non-admin users can only update rows in their own empresa.
      let query = supabase
        .from('scheduling_services')
        .update(data)
        .eq('id', id);
      if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services', empresaId] });
      toast.success('Serviço atualizado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar serviço: ${error.message}`);
    },
  });
}

export function useDeleteSchedulingService(empresaId?: string) {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;
  return useMutation({
    mutationFn: async (id: string) => {
      // Defense-in-depth: non-admin users can only delete rows in their own empresa.
      let query = supabase
        .from('scheduling_services')
        .delete()
        .eq('id', id);
      if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services', empresaId] });
      toast.success('Serviço eliminado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar serviço: ${error.message}`);
    },
  });
}

// Service-Resource associations
export interface ServiceResourceLink {
  id: string;
  service_id: string;
  resource_id: string;
  is_required: boolean;
}

export function useServiceResources(serviceId?: string) {
  return useQuery({
    queryKey: ['service-resources', serviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduling_service_resources')
        .select('*')
        .eq('service_id', serviceId!);
      if (error) throw error;
      return (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        service_id: d.service_id as string,
        resource_id: d.resource_id as string,
        is_required: (d.is_required as boolean) ?? true,
      })) as ServiceResourceLink[];
    },
    enabled: !!serviceId,
  });
}

export function useUpdateServiceResourceRequired(serviceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, isRequired }: { linkId: string; isRequired: boolean }) => {
      const { error } = await supabase
        .from('scheduling_service_resources')
        .update({ is_required: isRequired } as Record<string, unknown>)
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-resources', serviceId] });
      toast.success('Recurso atualizado');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar recurso: ${error.message}`);
    },
  });
}

export function useLinkServiceResource(serviceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await supabase
        .from('scheduling_service_resources')
        .insert({ service_id: serviceId!, resource_id: resourceId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-resources', serviceId] });
      toast.success('Recurso associado ao serviço');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao associar recurso: ${error.message}`);
    },
  });
}

export function useUnlinkServiceResource(serviceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await supabase
        .from('scheduling_service_resources')
        .delete()
        .eq('service_id', serviceId!)
        .eq('resource_id', resourceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-resources', serviceId] });
      toast.success('Recurso desassociado do serviço');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao desassociar recurso: ${error.message}`);
    },
  });
}
