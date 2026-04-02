import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SystemEmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
  body_text: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all system email templates
 */
export function useSystemEmailTemplates() {
  return useQuery({
    queryKey: ['system-email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_email_templates')
        .select('*')
        .order('template_key');

      if (error) throw error;
      return data as SystemEmailTemplate[];
    },
  });
}

/**
 * Fetch a single system email template by key
 */
export function useSystemEmailTemplate(templateKey: string | null) {
  return useQuery({
    queryKey: ['system-email-templates', templateKey],
    queryFn: async () => {
      if (!templateKey) return null;
      
      const { data, error } = await supabase
        .from('system_email_templates')
        .select('*')
        .eq('template_key', templateKey)
        .maybeSingle();

      if (error) throw error;
      return data as SystemEmailTemplate | null;
    },
    enabled: !!templateKey,
  });
}

/**
 * Update a system email template
 */
export function useUpdateSystemEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<SystemEmailTemplate, 'subject' | 'body_html' | 'body_text' | 'is_active'>>;
    }) => {
      const { error } = await supabase
        .from('system_email_templates')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-email-templates'] });
      toast.success('Template atualizado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar template: ${error.message}`);
    },
  });
}

/**
 * Replace template variables with actual values for preview
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;
  
  // Replace simple variables {{variable_name}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value));
  });
  
  // Handle conditional logo block {{#logo}}...{{/logo}}
  if (variables.platform_logo_url) {
    result = result.replace(/{{#logo}}/g, '').replace(/{{\/logo}}/g, '');
  } else {
    result = result.replace(/{{#logo}}[\s\S]*?{{\/logo}}/g, '');
  }
  
  return result;
}

/**
 * Get preview data for a template
 */
export function getTemplatePreviewData(): Record<string, string | number> {
  return {
    empresa_nome: 'Empresa Exemplo',
    percentagem_utilizacao: 85,
    creditos_usados: '850',
    creditos_limite: '1.000',
    mes: 'Janeiro 2026',
    plano_nome: 'Plano Pro',
    platform_logo_url: '',
    platform_signature: '— Equipa AI Call Platform',
    platform_footer_text: 'Este é um email automático. Por favor não responda.',
  };
}
