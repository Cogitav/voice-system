import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  getCurrentMonth, 
  AlertThresholdType,
  ALERT_THRESHOLDS,
  getTriggeredAlerts,
} from '@/lib/credits';
import { useSendCreditAlertEmail } from './useCreditAlertEmails';

interface CreditNotification {
  id: string;
  empresa_id: string;
  notification_type: AlertThresholdType;
  threshold_percentage: number;
  month: string;
  notified_admin_at: string | null;
  notified_company_at: string | null;
  credits_used_at_notification: number;
  credits_limit_at_notification: number;
  created_at: string;
}

interface CreditNotificationWithEmpresa extends CreditNotification {
  empresas: {
    id: string;
    nome: string;
    email: string | null;
  };
}

/**
 * Hook to fetch credit notifications for a specific empresa
 */
export function useEmpresaCreditNotifications(empresaId: string | null) {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credit-notifications', empresaId, currentMonth],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('credit_notifications')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .order('threshold_percentage', { ascending: true });
      
      if (error) throw error;
      return data as CreditNotification[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to fetch all credit notifications (admin only)
 */
export function useAllCreditNotifications() {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credit-notifications-all', currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_notifications')
        .select(`
          *,
          empresas:empresa_id (
            id,
            nome,
            email
          )
        `)
        .eq('month', currentMonth)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CreditNotificationWithEmpresa[];
    },
  });
}

/**
 * Hook to check and create notifications based on current usage
 * This should be called when credit usage changes
 * Now also triggers email notifications via edge function
 */
export function useCheckCreditAlerts() {
  const queryClient = useQueryClient();
  const sendAlertEmail = useSendCreditAlertEmail();
  
  return useMutation({
    mutationFn: async ({ 
      empresaId, 
      empresaNome,
      empresaEmail,
      adminEmail,
      creditsUsed, 
      creditsLimit,
      extraCredits = 0,
    }: { 
      empresaId: string; 
      empresaNome: string;
      empresaEmail: string | null;
      adminEmail: string;
      creditsUsed: number; 
      creditsLimit: number;
      extraCredits?: number;
    }) => {
      const currentMonth = getCurrentMonth();
      const effectiveLimit = creditsLimit + extraCredits;
      const percentage = effectiveLimit > 0 
        ? Math.round((creditsUsed / effectiveLimit) * 100) 
        : 0;
      
      // Determine which alerts should be triggered
      const triggeredAlerts = getTriggeredAlerts(percentage);
      
      // Check which notifications already exist for this month
      const { data: existingNotifications } = await supabase
        .from('credit_notifications')
        .select('notification_type')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth);
      
      const existingTypes = new Set(
        existingNotifications?.map(n => n.notification_type) || []
      );
      
      // Create new notifications for newly triggered thresholds
      const newNotifications = triggeredAlerts.filter(
        type => !existingTypes.has(type)
      );
      
      for (const notificationType of newNotifications) {
        const thresholdValue = notificationType === 'soft_70' ? ALERT_THRESHOLDS.SOFT
          : notificationType === 'warning_85' ? ALERT_THRESHOLDS.WARNING
          : ALERT_THRESHOLDS.OVERAGE;
        
        const { error } = await supabase
          .from('credit_notifications')
          .insert({
            empresa_id: empresaId,
            notification_type: notificationType,
            threshold_percentage: thresholdValue,
            month: currentMonth,
            notified_admin_at: new Date().toISOString(),
            // Company notification only for 85%+ alerts
            notified_company_at: thresholdValue >= ALERT_THRESHOLDS.WARNING 
              ? new Date().toISOString() 
              : null,
            credits_used_at_notification: creditsUsed,
            credits_limit_at_notification: effectiveLimit,
          });
        
        if (error) {
          // Ignore unique constraint violations (race condition)
          if (!error.message.includes('duplicate key')) {
            console.error('[CreditAlerts] Error creating notification:', error);
          }
        } else {
          console.log(`[CreditAlerts] Created ${notificationType} alert for empresa ${empresaId}`);
          
          // Send email notification (non-blocking)
          if (adminEmail) {
            sendAlertEmail.mutate({
              empresaId,
              alertType: notificationType,
              empresaNome,
              empresaEmail,
              adminEmail,
              creditsUsed,
              creditsLimit: effectiveLimit,
              percentage,
            });
          }
        }
      }
      
      return { 
        percentage, 
        newNotifications, 
        triggeredAlerts 
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['credit-notifications', variables.empresaId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['credit-notifications-all'] 
      });
    },
    onError: (error) => {
      console.error('[CreditAlerts] Check failed:', error);
    },
  });
}

/**
 * Hook to get companies that need attention (admin dashboard)
 */
export function useCompaniesNeedingAttention() {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['companies-needing-attention', currentMonth],
    queryFn: async () => {
      // Get all companies with their credit usage
      const { data: usageData, error } = await supabase
        .from('credits_usage')
        .select(`
          *,
          empresas:empresa_id (
            id,
            nome,
            email,
            status
          )
        `)
        .eq('month', currentMonth);
      
      if (error) throw error;
      
      // Filter to companies that are in warning, critical, or exceeded state
      const companiesNeedingAttention = (usageData || [])
        .map(usage => {
          const effectiveLimit = usage.credits_limit + (usage.extra_credits || 0);
          const percentage = effectiveLimit > 0 
            ? Math.round((usage.credits_used / effectiveLimit) * 100) 
            : 0;
          
          return {
            ...usage,
            percentage,
            effectiveLimit,
            status: percentage >= 100 ? 'exceeded' 
              : percentage >= 85 ? 'critical' 
              : percentage >= 70 ? 'warning' 
              : 'normal',
          };
        })
        .filter(c => c.percentage >= 70)
        .sort((a, b) => b.percentage - a.percentage);
      
      return companiesNeedingAttention;
    },
  });
}
