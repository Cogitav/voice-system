import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FollowUpRule {
  id: string;
  empresa_id: string;
  intent: string;
  send_email_client: boolean;
  send_email_company: boolean;
  create_appointment: boolean;
  register_only: boolean;
  mark_manual_followup: boolean;
  client_template_id: string | null;
  company_template_id: string | null;
  company_notification_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  empresa_nome?: string;
}

export interface FollowUpRuleFormData {
  empresa_id: string;
  intent: string;
  send_email_client?: boolean;
  send_email_company?: boolean;
  create_appointment?: boolean;
  register_only?: boolean;
  mark_manual_followup?: boolean;
  client_template_id?: string | null;
  company_template_id?: string | null;
  company_notification_email?: string | null;
  is_active?: boolean;
}

// Intent options - reusable across the app
export const FOLLOW_UP_INTENT_OPTIONS = [
  { value: 'informacao', label: 'Informação' },
  { value: 'agendamento', label: 'Agendamento' },
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'suporte', label: 'Suporte Técnico' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'cancelamento', label: 'Cancelamento' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'outro', label: 'Outro' },
];

export function useFollowUpRules() {
  return useQuery({
    queryKey: ['follow-up-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follow_up_rules')
        .select(`
          *,
          empresas(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data || []).map((rule: any) => ({
        ...rule,
        empresa_nome: rule.empresas?.nome || '-',
      })) as FollowUpRule[];
    },
  });
}

export function useFollowUpRulesByEmpresa(empresaId: string | null) {
  return useQuery({
    queryKey: ['follow-up-rules', 'empresa', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];

      const { data, error } = await supabase
        .from('follow_up_rules')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('intent', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return data as FollowUpRule[];
    },
    enabled: !!empresaId,
  });
}

export function useFollowUpRuleByIntent(empresaId: string | null, intent: string | null) {
  return useQuery({
    queryKey: ['follow-up-rules', 'empresa', empresaId, 'intent', intent],
    queryFn: async () => {
      if (!empresaId || !intent) return null;

      const { data, error } = await supabase
        .from('follow_up_rules')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('intent', intent)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data as FollowUpRule | null;
    },
    enabled: !!empresaId && !!intent,
  });
}

export function useCreateFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: FollowUpRuleFormData) => {
      const { data: rule, error } = await supabase
        .from('follow_up_rules')
        .insert({
          empresa_id: data.empresa_id,
          intent: data.intent,
          send_email_client: data.send_email_client ?? false,
          send_email_company: data.send_email_company ?? false,
          create_appointment: data.create_appointment ?? false,
          register_only: data.register_only ?? true,
          mark_manual_followup: data.mark_manual_followup ?? false,
          client_template_id: data.client_template_id || null,
          company_template_id: data.company_template_id || null,
          company_notification_email: data.company_notification_email || null,
          is_active: data.is_active ?? true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return rule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] });
      toast.success('Regra de follow-up criada com sucesso!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate key')) {
        toast.error('Já existe uma regra para esta intenção nesta empresa.');
      } else {
        toast.error(`Erro ao criar regra: ${error.message}`);
      }
    },
  });
}

export function useUpdateFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FollowUpRuleFormData> }) => {
      const updateData: any = {};
      
      if (data.send_email_client !== undefined) updateData.send_email_client = data.send_email_client;
      if (data.send_email_company !== undefined) updateData.send_email_company = data.send_email_company;
      if (data.create_appointment !== undefined) updateData.create_appointment = data.create_appointment;
      if (data.register_only !== undefined) updateData.register_only = data.register_only;
      if (data.mark_manual_followup !== undefined) updateData.mark_manual_followup = data.mark_manual_followup;
      if (data.client_template_id !== undefined) updateData.client_template_id = data.client_template_id || null;
      if (data.company_template_id !== undefined) updateData.company_template_id = data.company_template_id || null;
      if (data.company_notification_email !== undefined) updateData.company_notification_email = data.company_notification_email || null;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: rule, error } = await supabase
        .from('follow_up_rules')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return rule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] });
      toast.success('Regra atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar regra: ${error.message}`);
    },
  });
}

export function useDeleteFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('follow_up_rules')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] });
      toast.success('Regra eliminada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar regra: ${error.message}`);
    },
  });
}
