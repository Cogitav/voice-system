import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Info, Package, Zap } from 'lucide-react';
import { 
  getUsagePercentage, 
  getUsageStatus, 
  getUsageColorClass,
  getUsageTextColorClass,
  getUsageStatusLabel,
} from '@/lib/credits';

interface CreditUsageCardProps {
  creditsUsed: number;
  creditsLimit: number;
  extraCredits?: number;
  empresaNome?: string;
  showCompanyName?: boolean;
  compact?: boolean;
}

export function CreditUsageCard({
  creditsUsed,
  creditsLimit,
  extraCredits = 0,
  empresaNome,
  showCompanyName = false,
  compact = false,
}: CreditUsageCardProps) {
  const effectiveLimit = creditsLimit + extraCredits;
  const percentage = getUsagePercentage(creditsUsed, effectiveLimit);
  const status = getUsageStatus(percentage);
  const colorClass = getUsageColorClass(status);
  const textColorClass = getUsageTextColorClass(status);
  const statusLabel = getUsageStatusLabel(status);
  
  const showWarning = percentage >= 70;
  const isExceeded = percentage >= 100;
  
  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-[100px]">
            <Progress 
              value={Math.min(percentage, 100)} 
              className="h-2"
              indicatorClassName={colorClass}
            />
          </div>
          <span className={`text-sm font-medium ${textColorClass}`}>
            {percentage}%
          </span>
          {showWarning && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className={`h-4 w-4 ${isExceeded ? 'text-destructive' : 'text-yellow-500'}`} />
              </TooltipTrigger>
              <TooltipContent>
                {isExceeded 
                  ? 'Limite excedido. O serviço continua normalmente.' 
                  : 'A aproximar-se do limite mensal.'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Utilização Mensal
              {showCompanyName && empresaNome && (
                <span className="text-muted-foreground font-normal">— {empresaNome}</span>
              )}
            </CardTitle>
            <CardDescription>
              {percentage}% do uso mensal
            </CardDescription>
          </div>
          {showWarning && (
            <Badge 
              variant={isExceeded ? "destructive" : status === 'critical' ? "destructive" : "secondary"} 
              className="gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              {statusLabel}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Progress 
            value={Math.min(percentage, 100)} 
            className="h-3"
            indicatorClassName={colorClass}
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{percentage}% utilizado</span>
            {extraCredits > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Package className="h-3 w-3" />
                +{extraCredits.toLocaleString()} extra
              </span>
            )}
          </div>
        </div>
        
        {/* High-level usage categories for clients - without exact numbers */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <UsageCategory label="Chamadas" percentage={35} />
          <UsageCategory label="Mensagens" percentage={45} />
          <UsageCategory label="Automações" percentage={20} />
        </div>
        
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Os créditos são repostos mensalmente. A utilização é monitorizada continuamente 
            mas nunca bloqueia o funcionamento da plataforma.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageCategory({ label, percentage }: { label: string; percentage: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{percentage}%</p>
    </div>
  );
}
