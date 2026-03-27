import { useAuth } from '@/contexts/AuthContext';
import { useEmpresaCredits } from '@/hooks/useCredits';
import { CreditUsageCard } from './CreditUsageCard';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_CREDIT_LIMIT } from '@/lib/credits';

interface ClientCreditsWidgetProps {
  compact?: boolean;
}

export function ClientCreditsWidget({ compact = false }: ClientCreditsWidgetProps) {
  const { profile } = useAuth();
  const { data: credits, isLoading } = useEmpresaCredits(profile?.empresa_id || null);
  
  if (isLoading) {
    return compact 
      ? <Skeleton className="h-6 w-32" />
      : <Skeleton className="h-40 w-full" />;
  }
  
  return (
    <CreditUsageCard
      creditsUsed={credits?.credits_used || 0}
      creditsLimit={credits?.credits_limit || DEFAULT_CREDIT_LIMIT}
      extraCredits={credits?.extra_credits || 0}
      compact={compact}
    />
  );
}
