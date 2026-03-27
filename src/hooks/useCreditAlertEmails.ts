import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertThresholdType, getCurrentMonth } from '@/lib/credits';

interface SendCreditAlertParams {
  empresaId: string;
  alertType: AlertThresholdType;
  empresaNome: string;
  empresaEmail: string | null;
  adminEmail: string;
  creditsUsed: number;
  creditsLimit: number;
  percentage: number;
  isTestEnvironment?: boolean; // If true, email will be logged but not sent
}

/**
 * Map internal alert types to email alert types
 */
function mapAlertType(alertType: AlertThresholdType): 'credits_70' | 'credits_85' | 'credits_100' {
  switch (alertType) {
    case 'soft_70':
      return 'credits_70';
    case 'warning_85':
      return 'credits_85';
    case 'overage_100':
      return 'credits_100';
    default:
      return 'credits_70';
  }
}

/**
 * Hook to send credit alert emails via edge function
 * Handles idempotency - only sends once per threshold per month
 */
export function useSendCreditAlertEmail() {
  return useMutation({
    mutationFn: async ({
      empresaId,
      alertType,
      empresaNome,
      empresaEmail,
      adminEmail,
      creditsUsed,
      creditsLimit,
      percentage,
      isTestEnvironment = false,
    }: SendCreditAlertParams) => {
      const emailAlertType = mapAlertType(alertType);
      
      console.log(`[CreditAlertEmail] Sending ${emailAlertType} for empresa ${empresaId}${isTestEnvironment ? ' (TEST ENV)' : ''}`);

      const { data, error } = await supabase.functions.invoke('send-credit-alert-email', {
        body: {
          empresa_id: empresaId,
          alert_type: emailAlertType,
          empresa_nome: empresaNome,
          empresa_email: empresaEmail,
          admin_email: adminEmail,
          credits_used: creditsUsed,
          credits_limit: creditsLimit,
          percentage,
          is_test_environment: isTestEnvironment,
        },
      });

      if (error) {
        console.error('[CreditAlertEmail] Invocation error:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.skipped && data?.reason === 'test_environment') {
        console.log(`[CreditAlertEmail] Skipped (test env) for ${variables.empresaId}`);
      } else if (data?.success) {
        console.log(`[CreditAlertEmail] ✓ Alert sent for ${variables.empresaId}`);
      } else if (data?.reason === 'already_sent') {
        console.log(`[CreditAlertEmail] Skipped - already sent for ${variables.empresaId}`);
      } else {
        console.warn(`[CreditAlertEmail] Send returned:`, data);
      }
    },
    onError: (error) => {
      // Non-blocking - just log
      console.error('[CreditAlertEmail] Failed (non-blocking):', error);
    },
  });
}

/**
 * Hook to check if an alert email was already sent for a threshold this month
 */
export function useCheckAlertEmailSent(empresaId: string | null, alertType: AlertThresholdType) {
  const currentMonth = getCurrentMonth();
  const emailAlertType = mapAlertType(alertType);

  return {
    checkIfSent: async () => {
      if (!empresaId) return false;

      const { data } = await supabase
        .from('system_email_logs')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('alert_type', emailAlertType)
        .eq('month', currentMonth)
        .eq('status', 'sent')
        .maybeSingle();

      return !!data;
    },
  };
}
