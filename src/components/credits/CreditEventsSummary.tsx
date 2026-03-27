import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { CREDIT_EVENT_LABELS, CreditEventType } from '@/lib/credits';
import { useEmpresaCreditEventsSummary } from '@/hooks/useCredits';

interface CreditEventsSummaryProps {
  empresaId: string | null;
}

export function CreditEventsSummary({ empresaId }: CreditEventsSummaryProps) {
  const { data: summary, isLoading } = useEmpresaCreditEventsSummary(empresaId);
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Consumo por Tipo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!summary || summary.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Consumo por Tipo
          </CardTitle>
          <CardDescription>Detalhamento do mês atual</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Sem eventos de consumo este mês.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const totalCredits = summary.reduce((acc, item) => acc + item.totalCredits, 0);
  const sortedSummary = [...summary].sort((a, b) => b.totalCredits - a.totalCredits);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Consumo por Tipo
        </CardTitle>
        <CardDescription>Detalhamento do mês atual</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedSummary.map((item) => {
            const percentage = totalCredits > 0 
              ? Math.round((item.totalCredits / totalCredits) * 100) 
              : 0;
            
            return (
              <div key={item.event_type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {CREDIT_EVENT_LABELS[item.event_type as CreditEventType] || item.event_type}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.count} {item.count === 1 ? 'evento' : 'eventos'}
                    </span>
                    <span className="font-medium">
                      {item.totalCredits} créditos
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 pt-4 border-t flex justify-between items-center">
          <span className="text-sm font-medium">Total</span>
          <span className="font-semibold">{totalCredits.toLocaleString()} créditos</span>
        </div>
      </CardContent>
    </Card>
  );
}
