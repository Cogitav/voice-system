import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditPackageType, CREDIT_PACKAGES, getCurrentMonth } from '@/lib/credits';

interface CreditPackage {
  id: string;
  empresa_id: string;
  package_type: CreditPackageType;
  credits_amount: number;
  month: string;
  added_by: string | null;
  notes: string | null;
  created_at: string;
}

interface AddPackageParams {
  empresaId: string;
  packageType: CreditPackageType;
  notes?: string;
}

/**
 * Hook to fetch credit packages for a specific empresa
 */
export function useEmpresaCreditPackages(empresaId: string | null) {
  return useQuery({
    queryKey: ['credit-packages', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CreditPackage[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to fetch credit packages for current month for a specific empresa
 */
export function useEmpresaCurrentMonthPackages(empresaId: string | null) {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credit-packages-current', empresaId, currentMonth],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CreditPackage[];
    },
    enabled: !!empresaId,
  });
}

/**
 * Hook to fetch all credit packages (admin only)
 */
export function useAllCreditPackages() {
  const currentMonth = getCurrentMonth();
  
  return useQuery({
    queryKey: ['credit-packages-all', currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_packages')
        .select(`
          *,
          empresas:empresa_id (
            id,
            nome
          )
        `)
        .eq('month', currentMonth)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to add a credit package (admin only)
 */
export function useAddCreditPackage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ empresaId, packageType, notes }: AddPackageParams) => {
      const currentMonth = getCurrentMonth();
      const packageConfig = CREDIT_PACKAGES[packageType];
      
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Create the package record
      const { data: pkg, error: pkgError } = await supabase
        .from('credit_packages')
        .insert({
          empresa_id: empresaId,
          package_type: packageType,
          credits_amount: packageConfig.credits,
          month: currentMonth,
          added_by: user?.id || null,
          notes: notes || null,
        })
        .select()
        .single();
      
      if (pkgError) throw pkgError;
      
      // 2. Update the credits_usage extra_credits field
      const { data: existingUsage } = await supabase
        .from('credits_usage')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth)
        .maybeSingle();
      
      if (existingUsage) {
        const { error: updateError } = await supabase
          .from('credits_usage')
          .update({ 
            extra_credits: (existingUsage.extra_credits || 0) + packageConfig.credits 
          })
          .eq('id', existingUsage.id);
        
        if (updateError) {
          console.error('[CreditPackages] Error updating extra_credits:', updateError);
        }
      } else {
        // Create new record for this month with extra credits
        const { error: insertError } = await supabase
          .from('credits_usage')
          .insert({
            empresa_id: empresaId,
            month: currentMonth,
            credits_used: 0,
            credits_limit: 1000, // Default, will be overwritten by plan
            extra_credits: packageConfig.credits,
          });
        
        if (insertError) {
          console.error('[CreditPackages] Error creating credits_usage:', insertError);
        }
      }
      
      return pkg;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['credit-packages', variables.empresaId] });
      queryClient.invalidateQueries({ queryKey: ['credit-packages-current', variables.empresaId] });
      queryClient.invalidateQueries({ queryKey: ['credit-packages-all'] });
      queryClient.invalidateQueries({ queryKey: ['credits-usage', variables.empresaId] });
      queryClient.invalidateQueries({ queryKey: ['credits-usage-all'] });
      toast.success('Pack de créditos adicionado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error adding credit package:', error);
      toast.error('Erro ao adicionar pack de créditos');
    },
  });
}
