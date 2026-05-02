import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface EmailTemplate {
  id: string;
  empresa_id: string;
  intent: string;
  subject: string;
  body: string;
  is_active: boolean;
  recipient_type: 'client' | 'company' | 'internal';
  created_at: string;
  updated_at: string;
  empresa_nome?: string;
}

export const RECIPIENT_TYPE_OPTIONS = [
  { value: 'client', label: 'Cliente' },
  { value: 'company', label: 'Empresa' },
  { value: 'internal', label: 'Notificação Interna' },
];

export interface EmailTemplateFormData {
  empresa_id: string;
  intent: string;
  subject: string;
  body: string;
  is_active?: boolean;
  recipient_type?: 'client' | 'company' | 'internal';
}

// Template categories — business-friendly labels backed by stable slugs.
// The slugs intentionally preserve compatibility with the existing
// auto-fire engine (platform-events.EVENT_TO_INTENT and follow_up_rules.intent),
// which still queries by slugs like 'agendamento' / 'cancelamento' / 'informacao'.
//
//   Display label        → DB slug (column email_templates.intent)
//   "Marcação"           → 'agendamento'        (matches booking_confirmed event)
//   "Informação"         → 'informacao'         (matches conversation_closed event)
//   "Cancelamento"       → 'cancelamento'       (matches booking_cancelled event)
//   "Outro"              → 'outro'
//   "Preço"              → 'preco'              (new — no auto event today)
//   "Remarcação"         → 'remarcacao'         (new — could map to booking_rescheduled later)
//   "Atendimento humano" → 'atendimento_humano' (new)
//   "Follow-up"          → 'follow_up'          (new)
export const INTENT_OPTIONS = [
  { value: 'agendamento', label: 'Marcação' },
  { value: 'informacao', label: 'Informação' },
  { value: 'preco', label: 'Preço' },
  { value: 'remarcacao', label: 'Remarcação' },
  { value: 'cancelamento', label: 'Cancelamento' },
  { value: 'atendimento_humano', label: 'Atendimento humano' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'outro', label: 'Outro' },
];

// Standardized template variable placeholders. Operators see and click these
// in the form; the edge function substitutes them at send time. Names match
// the lead-context replacements in send-follow-up-email (including the
// `cliente_email` / `cliente_telefone` aliases added for naming consistency).
export const TEMPLATE_VARIABLES = [
  { variable: '{{cliente_nome}}', description: 'Nome do cliente' },
  { variable: '{{cliente_email}}', description: 'Email do cliente' },
  { variable: '{{cliente_telefone}}', description: 'Telefone do cliente' },
  { variable: '{{empresa_nome}}', description: 'Nome da empresa' },
  { variable: '{{lead_status}}', description: 'Estado do lead' },
  { variable: '{{lead_source}}', description: 'Origem do lead' },
  { variable: '{{intent}}', description: 'Intent inferida da conversa' },
  { variable: '{{data_agendamento}}', description: 'Data do agendamento' },
  { variable: '{{hora_agendamento}}', description: 'Hora do agendamento' },
];

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select(`
          id,
          empresa_id,
          intent,
          subject,
          body,
          is_active,
          recipient_type,
          created_at,
          updated_at,
          empresas(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data || []).map((template: any) => ({
        ...template,
        empresa_nome: template.empresas?.nome || '-',
      })) as EmailTemplate[];
    },
  });
}

export function useEmailTemplatesByEmpresa(empresaId: string | null) {
  return useQuery({
    queryKey: ['email-templates', 'empresa', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data as EmailTemplate[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmailTemplateFormData) => {
      const { data: template, error } = await supabase
        .from('email_templates')
        .insert({
          empresa_id: data.empresa_id,
          intent: data.intent,
          subject: data.subject,
          body: data.body,
          is_active: data.is_active ?? true,
          recipient_type: data.recipient_type ?? 'client',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate key')) {
        toast.error('Já existe um template para esta intenção e destinatário nesta empresa.');
      } else {
        toast.error(`Erro ao criar template: ${error.message}`);
      }
    },
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmailTemplateFormData> }) => {
      // Defense-in-depth: non-admin users can only update templates in their own empresa.
      let query = supabase
        .from('email_templates')
        .update({
          intent: data.intent,
          subject: data.subject,
          body: data.body,
          is_active: data.is_active,
          recipient_type: data.recipient_type,
        })
        .eq('id', id);

      if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }

      const { data: template, error } = await query.select().single();

      if (error) {
        throw new Error(error.message);
      }

      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar template: ${error.message}`);
    },
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;

  return useMutation({
    mutationFn: async (id: string) => {
      // Defense-in-depth: non-admin users can only delete templates in their own empresa.
      let query = supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }

      const { error } = await query;

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template eliminado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar template: ${error.message}`);
    },
  });
}

export function useToggleEmailTemplate() {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const userEmpresaId = profile?.empresa_id;

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      // Defense-in-depth: non-admin users can only toggle templates in their own empresa.
      let query = supabase
        .from('email_templates')
        .update({ is_active })
        .eq('id', id);

      if (!isAdmin && userEmpresaId) {
        query = query.eq('empresa_id', userEmpresaId);
      }

      const { error } = await query;

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(variables.is_active ? 'Template ativado!' : 'Template desativado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar template: ${error.message}`);
    },
  });
}
