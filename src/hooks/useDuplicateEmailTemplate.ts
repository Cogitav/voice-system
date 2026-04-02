import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmailTemplate } from '@/hooks/useEmailTemplates';

export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceTemplate: EmailTemplate) => {
      const { data: template, error } = await supabase
        .from('email_templates')
        .insert({
          empresa_id: sourceTemplate.empresa_id,
          intent: sourceTemplate.intent,
          subject: `${sourceTemplate.subject} (cópia)`,
          body: sourceTemplate.body,
          is_active: false, // Start as inactive
          recipient_type: sourceTemplate.recipient_type,
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
      toast.success('Template duplicado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao duplicar template: ${error.message}`);
    },
  });
}
