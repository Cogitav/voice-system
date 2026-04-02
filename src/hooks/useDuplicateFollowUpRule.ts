import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FollowUpRule } from '@/hooks/useFollowUpRules';

export function useDuplicateFollowUpRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceRule: FollowUpRule) => {
      // Create a new rule with same settings but for a different intent
      // The duplicate will need to be edited to select a new intent
      const { data: rule, error } = await supabase
        .from('follow_up_rules')
        .insert({
          empresa_id: sourceRule.empresa_id,
          intent: sourceRule.intent + '_copy', // Temporary - user must change
          send_email_client: sourceRule.send_email_client,
          send_email_company: sourceRule.send_email_company,
          create_appointment: sourceRule.create_appointment,
          register_only: sourceRule.register_only,
          mark_manual_followup: sourceRule.mark_manual_followup,
          client_template_id: sourceRule.client_template_id,
          company_template_id: sourceRule.company_template_id,
          company_notification_email: sourceRule.company_notification_email,
          is_active: false, // Start as inactive
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
      toast.success('Regra duplicada! Edite para definir uma nova intenção.');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate key')) {
        toast.error('Já existe uma regra para esta intenção. Altere a intenção após duplicar.');
      } else {
        toast.error(`Erro ao duplicar regra: ${error.message}`);
      }
    },
  });
}
