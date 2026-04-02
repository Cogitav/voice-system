import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SendFollowUpEmailParams {
  chamadaId: string;
  recipientEmail: string;
  clienteNome?: string;
}

export function useSendFollowUpEmail() {
  return useMutation({
    mutationFn: async (params: SendFollowUpEmailParams) => {
      const { data, error } = await supabase.functions.invoke('send-follow-up-email', {
        body: {
          chamada_id: params.chamadaId,
          recipient_email: params.recipientEmail,
          cliente_nome: params.clienteNome,
        },
      });

      if (error) {
        console.error('Error sending follow-up email:', error);
        throw new Error(error.message);
      }

      return data;
    },
    // Silent operation - no toast on success/failure to avoid blocking call flow
    onError: (error: Error) => {
      console.error('Follow-up email failed:', error.message);
    },
  });
}

// Hook to trigger email after call completion - safe-fail
export function useTriggerFollowUpEmail() {
  const sendEmail = useSendFollowUpEmail();

  const triggerEmail = async (chamadaId: string, recipientEmail: string, clienteNome?: string) => {
    try {
      // Fire and forget - don't await to avoid blocking
      sendEmail.mutate({
        chamadaId,
        recipientEmail,
        clienteNome,
      });
    } catch (error) {
      // Safe-fail: log but don't throw
      console.error('Failed to trigger follow-up email:', error);
    }
  };

  return { triggerEmail, isLoading: sendEmail.isPending };
}
