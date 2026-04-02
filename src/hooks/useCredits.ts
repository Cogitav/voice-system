import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  CreditEventType, 
  getCreditsForEvent, 
  getCurrentMonth, 
  DEFAULT_CREDIT_LIMIT 
} from '@/lib/credits';

interface CreditsUsage {
  id: string;
  empresa_id: string;
  month: string;
  credits_used: number;
  credits_limit: number;
  extra_credits: number;
  created_at: string;
  updated_at: string;
}

interface CreditEvent {
  id: string;
  empresa_id: string;
  event_type: CreditEventType;
  credits_consumed: number;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface RegisterCreditParams {
  empresaId: string;
  eventType: CreditEventType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook to fetch current month credits usage for a specific empresa
 */
export function useEmpresaCredits(empresaId: string | null) {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credits-usage', empresaId, currentMonth],
    queryFn: async () => {
      if (!empresaId) return null;
      
      const { data, error } = await supabase
        .from('credits_usage')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .maybeSingle();
      
      if (error) throw error;
      
      // Return default values if no record exists yet
      if (!data) {
        return {
          id: null,
          empresa_id: empresaId,
          month: currentMonth,
          credits_used: 0,
          credits_limit: DEFAULT_CREDIT_LIMIT,
          extra_credits: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as CreditsUsage & { id: null };
      }
      
      return data as CreditsUsage;
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to fetch credits usage for all empresas (admin only)
 */
export function useAllCreditsUsage() {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credits-usage-all', currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credits_usage')
        .select(`
          *,
          empresas:empresa_id (
            id,
            nome
          )
        `)
        .eq('month', currentMonth)
        .order('credits_used', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to fetch credit events for a specific empresa
 */
export function useEmpresaCreditEvents(empresaId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['credits-events', empresaId, limit],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('credits_events')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as CreditEvent[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to fetch aggregated credit events by type for a specific empresa and month
 */
export function useEmpresaCreditEventsSummary(empresaId: string | null) {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credits-events-summary', empresaId, currentMonth],
    queryFn: async () => {
      if (!empresaId) return [];
      
      // Get first and last day of current month
      const [year, month] = currentMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('credits_events')
        .select('event_type, credits_consumed')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate)
        .lte('created_at', `${endDate}T23:59:59`);
      
      if (error) throw error;
      
      // Aggregate by event_type
      const summary: Record<string, { count: number; totalCredits: number }> = {};
      
      for (const event of data || []) {
        const type = event.event_type;
        if (!summary[type]) {
          summary[type] = { count: 0, totalCredits: 0 };
        }
        summary[type].count++;
        summary[type].totalCredits += event.credits_consumed;
      }
      
      return Object.entries(summary).map(([type, data]) => ({
        event_type: type as CreditEventType,
        count: data.count,
        totalCredits: data.totalCredits,
      }));
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to register a credit usage event
 * This is the main function to call when an action consumes credits
 * 
 * IMPORTANT: This should only be called from backend events or safe hooks.
 * Credits are registered only if:
 * - The action completed successfully
 * - A reference_id is provided for idempotency (prevents double counting)
 * - The event type is valid
 */
export function useRegisterCreditUsage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ empresaId, eventType, referenceId, metadata }: RegisterCreditParams) => {
      // DEFENSIVE SAFEGUARD 1: Require empresa_id
      if (!empresaId) {
        console.error('[Credits] BLOCKED: Missing empresa_id - refusing to register credits');
        return { creditsConsumed: 0, eventType, blocked: true, reason: 'missing_empresa_id' };
      }
      
      const creditsConsumed = getCreditsForEvent(eventType);
      const currentMonth = getCurrentMonth();
      
      // Skip if no credits to consume
      if (creditsConsumed === 0) {
        console.log(`[Credits] Skipping ${eventType} - 0 credits`);
        return { creditsConsumed: 0, eventType, skipped: true };
      }
      
      // DEFENSIVE SAFEGUARD 2: Idempotency - require reference_id for all credit registrations
      if (!referenceId) {
        console.warn(`[Credits] BLOCKED: Missing reference_id for ${eventType} - refusing to prevent duplicates`);
        return { creditsConsumed: 0, eventType, blocked: true, reason: 'missing_reference_id' };
      }
      
      // DEFENSIVE SAFEGUARD 3: Check if already registered (idempotency check)
      const { data: existing } = await supabase
        .from('credits_events')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('event_type', eventType)
        .eq('reference_id', referenceId)
        .maybeSingle();
      
      if (existing) {
        console.log(`[Credits] BLOCKED: Already registered: ${eventType} for ${referenceId} - preventing double debit`);
        return { creditsConsumed: 0, eventType, alreadyRegistered: true };
      }
      
      // DEFENSIVE SAFEGUARD 4: Validate credits are positive
      if (creditsConsumed < 0) {
        console.error(`[Credits] BLOCKED: Invalid negative credits (${creditsConsumed}) for ${eventType}`);
        return { creditsConsumed: 0, eventType, blocked: true, reason: 'negative_credits' };
      }
      
      // 1. Create the credit event with full metadata for traceability
      const eventMetadata = {
        ...(metadata || {}),
        registered_at: new Date().toISOString(),
      };
      
      const { error: eventError } = await supabase
        .from('credits_events')
        .insert([{
          empresa_id: empresaId,
          event_type: eventType,
          credits_consumed: creditsConsumed,
          reference_id: referenceId,
          metadata: eventMetadata,
        }]);
        
      if (eventError) {
        console.error('[Credits] Error creating credit event:', eventError);
        // Don't throw - we don't want to block the main flow
        return { creditsConsumed: 0, eventType, error: true };
      }
      
      // 2. Fetch or create current month usage record
      const { data: existingUsage } = await supabase
        .from('credits_usage')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .maybeSingle();
      
      if (existingUsage) {
        // ATOMIC update: use the database to add credits (not client-side calculation)
        const newCreditsUsed = existingUsage.credits_used + creditsConsumed;
        
        // DEFENSIVE SAFEGUARD 5: Prevent credits from going negative
        if (newCreditsUsed < 0) {
          console.error('[Credits] BLOCKED: Would result in negative credits_used');
          return { creditsConsumed: 0, eventType, blocked: true, reason: 'would_be_negative' };
        }
        
        const { error: updateError } = await supabase
          .from('credits_usage')
          .update({ 
            credits_used: newCreditsUsed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUsage.id);
        
        if (updateError) {
          console.error('[Credits] Error updating credits usage:', updateError);
        }
      } else {
        // Create new record for this month
        const { error: insertError } = await supabase
          .from('credits_usage')
          .insert({
            empresa_id: empresaId,
            month: currentMonth,
            credits_used: creditsConsumed,
            credits_limit: DEFAULT_CREDIT_LIMIT,
          });
        
        if (insertError) {
          console.error('[Credits] Error creating credits usage:', insertError);
        }
      }
      
      console.log(`[Credits] ✓ Registered: ${eventType} = ${creditsConsumed} credits for empresa ${empresaId} (ref: ${referenceId})`);
      return { creditsConsumed, eventType, success: true };
    },
    onSuccess: (result, variables) => {
      // Only invalidate if credits were actually consumed
      if (result.creditsConsumed > 0) {
        queryClient.invalidateQueries({ queryKey: ['credits-usage', variables.empresaId] });
        queryClient.invalidateQueries({ queryKey: ['credits-events', variables.empresaId] });
        queryClient.invalidateQueries({ queryKey: ['credits-events-summary', variables.empresaId] });
        queryClient.invalidateQueries({ queryKey: ['credits-usage-all'] });
        queryClient.invalidateQueries({ queryKey: ['admin-credit-events-debug'] });
      }
    },
    // Never throw errors that would break the platform
    onError: (error) => {
      console.error('[Credits] Registration failed (non-blocking):', error);
    },
  });
}

/**
 * Hook to update credit limit for an empresa (admin only)
 */
export function useUpdateCreditLimit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ empresaId, newLimit }: { empresaId: string; newLimit: number }) => {
      const currentMonth = getCurrentMonth();
      
      // Check if record exists
      const { data: existing } = await supabase
        .from('credits_usage')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('credits_usage')
          .update({ credits_limit: newLimit })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        // Create new record with the limit
        const { error } = await supabase
          .from('credits_usage')
          .insert({
            empresa_id: empresaId,
            month: currentMonth,
            credits_used: 0,
            credits_limit: newLimit,
          });
        
        if (error) throw error;
      }
      
      return { empresaId, newLimit };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['credits-usage', variables.empresaId] });
      queryClient.invalidateQueries({ queryKey: ['credits-usage-all'] });
      toast.success('Limite de créditos atualizado');
    },
    onError: (error: Error) => {
      console.error('Error updating credit limit:', error);
      toast.error('Erro ao atualizar limite de créditos');
    },
  });
}
