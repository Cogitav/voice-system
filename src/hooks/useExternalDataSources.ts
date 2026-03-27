import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Types for external data sources (admin-controlled only)
export interface ExternalDataSource {
  id: string;
  empresa_id: string;
  source_type: string;
  source_name: string;
  source_identifier: string | null;
  is_active: boolean;
  linked_at: string;
  metadata: Record<string, unknown>;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  external_data_source_limit: number;
  description: string | null;
  is_active: boolean;
}

export interface ExternalSourcesStatus {
  activeCount: number;
  limit: number;
  planName: string | null;
  isUnlimited: boolean;
}

/**
 * Hook for ADMIN only - full access to external data sources
 * Admins can view, add, and remove sources
 */
export function useExternalDataSourcesAdmin(empresaId: string | null) {
  return useQuery({
    queryKey: ['external-data-sources', 'admin', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('external_data_sources')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('linked_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching external data sources:', error);
        throw error;
      }
      
      return data as ExternalDataSource[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook for CLIENT only - read-only count of active sources
 * Clients can only see HOW MANY sources are active, not details
 * This preserves the separation between internal behavior and external data
 */
export function useExternalSourcesStatus(empresaId: string | null) {
  return useQuery({
    queryKey: ['external-sources-status', empresaId],
    queryFn: async (): Promise<ExternalSourcesStatus> => {
      if (!empresaId) {
        return { activeCount: 0, limit: 0, planName: null, isUnlimited: false };
      }
      
      // Get count of active sources (clients can read their own sources via RLS)
      const { count, error: countError } = await supabase
        .from('external_data_sources')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('is_active', true);
      
      if (countError) {
        console.error('Error fetching external sources count:', countError);
        // Non-blocking: return zeros on error
        return { activeCount: 0, limit: 0, planName: null, isUnlimited: false };
      }
      
      // Get subscription plan info for this empresa
      const { data: empresaData, error: empresaError } = await supabase
        .from('empresas')
        .select('subscription_plan_id')
        .eq('id', empresaId)
        .single();
      
      if (empresaError || !empresaData?.subscription_plan_id) {
        return { 
          activeCount: count || 0, 
          limit: 0, 
          planName: null, 
          isUnlimited: true // No plan means unlimited (backwards compatibility)
        };
      }
      
      // Get plan details (admins only can read plans, so this may fail for clients)
      // In that case, we just show the count without plan details
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('name, external_data_source_limit')
        .eq('id', empresaData.subscription_plan_id)
        .single();
      
      const limit = planData?.external_data_source_limit || 0;
      
      return {
        activeCount: count || 0,
        limit,
        planName: planData?.name || null,
        isUnlimited: limit === 0, // 0 means unlimited
      };
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook for ADMIN - fetch all subscription plans
 */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('external_data_source_limit', { ascending: true });
      
      if (error) {
        console.error('Error fetching subscription plans:', error);
        throw error;
      }
      
      return data as SubscriptionPlan[];
    },
  });
}

/**
 * Read-only list for agents to consult external sources
 * Returns ONLY authorization metadata, never actual external data
 * External data is consulted at runtime and never stored/cached
 */
export function useAgentExternalSources(empresaId: string | null) {
  return useQuery({
    queryKey: ['agent-external-sources', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('external_data_sources')
        .select('id, source_type, source_name, source_identifier, metadata')
        .eq('empresa_id', empresaId)
        .eq('is_active', true);
      
      if (error) {
        console.error('Error fetching agent external sources:', error);
        // Non-blocking: return empty on error
        return [];
      }
      
      // Return only authorization metadata for read-only consultation
      return data.map(source => ({
        id: source.id,
        type: source.source_type,
        name: source.source_name,
        identifier: source.source_identifier,
        // Exclude full metadata to maintain separation
      }));
    },
    enabled: !!empresaId,
  });
}
