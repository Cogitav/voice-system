import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Calendar, 
  CalendarCheck, 
  CalendarX, 
  AlertTriangle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSchedulingStatus, SchedulingState } from '@/hooks/useSchedulingStatus';

interface SchedulingStatusBadgeProps {
  empresaId: string;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const STATE_CONFIG: Record<SchedulingState, {
  icon: React.ElementType;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  colorClass: string;
}> = {
  'REAL_TIME_SCHEDULING_ACTIVE': {
    icon: CalendarCheck,
    variant: 'default',
    colorClass: 'bg-primary/10 text-primary border-primary/20',
  },
  'REQUEST_ONLY': {
    icon: Clock,
    variant: 'secondary',
    colorClass: 'bg-accent text-accent-foreground border-accent',
  },
  'SCHEDULING_DISABLED': {
    icon: CalendarX,
    variant: 'outline',
    colorClass: 'bg-muted text-muted-foreground',
  },
};

export function SchedulingStatusBadge({ 
  empresaId, 
  showDescription = false,
  size = 'md' 
}: SchedulingStatusBadgeProps) {
  const { data: status, isLoading } = useSchedulingStatus(empresaId);

  if (isLoading) {
    return (
      <Badge variant="outline" className="animate-pulse">
        <Calendar className="h-3 w-3 mr-1" />
        A verificar...
      </Badge>
    );
  }

  if (!status) {
    return null;
  }

  const config = STATE_CONFIG[status.state];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className="space-y-2">
      <Badge 
        variant={config.variant}
        className={cn(
          'font-medium border',
          config.colorClass,
          sizeClasses[size]
        )}
      >
        <Icon className={cn(iconSizes[size], 'mr-1.5')} />
        {status.status_label}
      </Badge>
      
      {showDescription && (
        <p className="text-xs text-muted-foreground">
          {status.status_description}
        </p>
      )}
    </div>
  );
}

/**
 * Full scheduling status card for Admin UI
 */
interface SchedulingStatusCardProps {
  empresaId: string;
}

export function SchedulingStatusCard({ empresaId }: SchedulingStatusCardProps) {
  const { data: status, isLoading } = useSchedulingStatus(empresaId);

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-muted rounded w-2/3"></div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const isActive = status.state === 'REAL_TIME_SCHEDULING_ACTIVE';
  const isRequestOnly = status.state === 'REQUEST_ONLY';

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Estado do Agendamento</span>
        </div>
        <SchedulingStatusBadge empresaId={empresaId} size="md" />
      </div>

      {/* Warning for REQUEST_ONLY */}
      {isRequestOnly && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            Modo Apenas Pedidos
          </AlertTitle>
          <AlertDescription>
            Sem integração de calendário ativa. Os agendamentos não podem ser confirmados 
            automaticamente pela IA. Os pedidos serão registados para confirmação manual.
          </AlertDescription>
        </Alert>
      )}

      {/* Success for REAL_TIME */}
      {isActive && (
        <Alert className="border-primary/30 bg-primary/10">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>
            Agendamento em Tempo Real
          </AlertTitle>
          <AlertDescription>
            Calendário conectado ({status.calendar_provider}). A IA pode confirmar 
            agendamentos automaticamente após verificação de disponibilidade.
          </AlertDescription>
        </Alert>
      )}

      {/* Info for DISABLED */}
      {status.state === 'SCHEDULING_DISABLED' && (
        <Alert>
          <CalendarX className="h-4 w-4" />
          <AlertTitle>Serviço Desativado</AlertTitle>
          <AlertDescription>
            O serviço de agendamentos está desativado para esta empresa. 
            Ative-o nas definições de serviços para permitir marcações.
          </AlertDescription>
        </Alert>
      )}

      {/* AI Behavior explanation */}
      <div className="bg-muted/50 rounded-lg p-3 text-sm">
        <p className="font-medium mb-1">Comportamento da IA:</p>
        {isActive && (
          <p className="text-muted-foreground">
            A IA pode dizer "O agendamento foi confirmado" <strong>apenas</strong> após 
            receber confirmação de sucesso do sistema.
          </p>
        )}
        {isRequestOnly && (
          <p className="text-muted-foreground">
            A IA irá sempre dizer "Registámos o seu pedido" e nunca "agendamento confirmado". 
            A equipa deve confirmar manualmente.
          </p>
        )}
        {status.state === 'SCHEDULING_DISABLED' && (
          <p className="text-muted-foreground">
            A IA irá informar que o agendamento automático não está disponível e 
            oferecerá alternativas como contacto direto.
          </p>
        )}
      </div>
    </div>
  );
}
