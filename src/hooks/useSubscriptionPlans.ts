import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  external_data_source_limit: number;
  monthly_credit_envelope: number;
  voice_quality_profile: string;
  alert_threshold_soft: number;
  alert_threshold_warning: number;
  alert_threshold_critical: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all active subscription plans (BASE, PRO, ADVANCED)
 * Admin-only access
 */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('monthly_credit_envelope', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return data as SubscriptionPlan[];
    },
  });
}

/**
 * Get plan by ID
 */
export function useSubscriptionPlan(planId: string | null) {
  return useQuery({
    queryKey: ['subscription-plan', planId],
    queryFn: async () => {
      if (!planId) return null;
      
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as SubscriptionPlan;
    },
    enabled: !!planId,
  });
}

/**
 * Get suggested price hints for each plan (UI only - informational)
 */
export const PLAN_PRICE_HINTS: Record<string, { min: number; max: number }> = {
  BASE: { min: 99, max: 199 },
  PRO: { min: 299, max: 499 },
  ADVANCED: { min: 799, max: 1499 },
};
