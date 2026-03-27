import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronRight, TrendingUp, Zap } from 'lucide-react';
import { useCompaniesNeedingAttention } from '@/hooks/useCreditAlerts';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

export function AdminCreditsAlertsBanner() {
  const { data: companies, isLoading } = useCompaniesNeedingAttention();
  
  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  
  if (!companies || companies.length === 0) {
    return null;
  }
  
  const exceededCount = companies.filter(c => c.status === 'exceeded').length;
  const criticalCount = companies.filter(c => c.status === 'critical').length;
  const warningCount = companies.filter(c => c.status === 'warning').length;
  
  const mostCritical = companies[0];
  
  return (
    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <Zap className="h-4 w-4" />
        Alertas de Créditos
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {exceededCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              {exceededCount} excedida{exceededCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {criticalCount > 0 && (
            <Badge className="bg-orange-500 hover:bg-orange-600 gap-1">
              {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              {warningCount} em atenção
            </Badge>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <strong>{mostCritical.empresas.nome}</strong> está a {mostCritical.percentage}% 
            do limite ({mostCritical.credits_used.toLocaleString()} / {mostCritical.effectiveLimit.toLocaleString()})
          </p>
          
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/admin/empresas">
              Ver todas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
