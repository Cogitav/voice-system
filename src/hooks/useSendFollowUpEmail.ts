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

// ─── Lead-context email ───────────────────────────────────────────────────
// Reuses the same `send-follow-up-email` edge function but in lead mode.
// The edge function returns 200 with `{ success: false, reason }` for
// non-fatal failures (lead_not_found, no_template, email_send_failed); we
// translate those into a thrown Error so the caller can surface the reason
// in a toast. Existing chamada flow (useSendFollowUpEmail above) is
// unaffected by this hook.
interface SendLeadEmailParams {
  leadId: string;
  recipientEmail: string;
  clienteNome?: string;
}

interface SendFollowUpEmailResponse {
  success: boolean;
  reason?: string;
  error?: string;
  email_id?: string;
}

export function useSendLeadEmail() {
  return useMutation({
    mutationFn: async (params: SendLeadEmailParams) => {
      const { data, error } = await supabase.functions.invoke('send-follow-up-email', {
        body: {
          lead_id: params.leadId,
          recipient_email: params.recipientEmail,
          cliente_nome: params.clienteNome,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      const response = data as SendFollowUpEmailResponse | null;
      if (!response?.success) {
        const reason = response?.reason ?? response?.error ?? 'unknown_error';
        throw new Error(reason);
      }

      return response;
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
