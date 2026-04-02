import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CalendarPlus, 
  CalendarClock, 
  CalendarX, 
  Eye,
  Save,
  Loader2,
  AlertTriangle,
  Info
} from 'lucide-react';
import {
  useSchedulingCapabilities,
  useUpdateSchedulingCapabilities,
  SchedulingCapabilitiesUpdate,
} from '@/hooks/useSchedulingCapabilities';
import { cn } from '@/lib/utils';

interface CapabilityConfig {
  key: keyof SchedulingCapabilitiesUpdate;
  label: string;
  description: string;
  icon: React.ElementType;
  sensitive: boolean;
  defaultValue: boolean;
}

const CAPABILITIES: CapabilityConfig[] = [
  {
    key: 'allow_create_appointment',
    label: 'Criar Agendamentos',
    description: 'Permite que agentes IA criem novos agendamentos para clientes.',
    icon: CalendarPlus,
    sensitive: false,
    defaultValue: true,
  },
  {
    key: 'allow_reschedule_appointment',
    label: 'Reagendar',
    description: 'Permite que agentes IA alterem a data/hora de agendamentos existentes. Requer confirmação explícita do utilizador.',
    icon: CalendarClock,
    sensitive: true,
    defaultValue: false,
  },
  {
    key: 'allow_cancel_appointment',
    label: 'Cancelar Agendamentos',
    description: 'Permite que agentes IA cancelem agendamentos existentes. Requer confirmação explícita do utilizador.',
    icon: CalendarX,
    sensitive: true,
    defaultValue: false,
  },
  {
    key: 'allow_view_availability',
    label: 'Ver Disponibilidade',
    description: 'Permite que agentes IA consultem a disponibilidade de horários no calendário.',
    icon: Eye,
    sensitive: false,
    defaultValue: false,
  },
];

interface SchedulingCapabilitiesCardProps {
  empresaId: string;
  schedulingEnabled: boolean;
}

export function SchedulingCapabilitiesCard({ empresaId, schedulingEnabled }: SchedulingCapabilitiesCardProps) {
  const { data: capabilities, isLoading } = useSchedulingCapabilities(empresaId);
  const updateMutation = useUpdateSchedulingCapabilities(empresaId);

  const [local, setLocal] = useState<SchedulingCapabilitiesUpdate>({
    allow_create_appointment: true,
    allow_reschedule_appointment: false,
    allow_cancel_appointment: false,
    allow_view_availability: false,
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (capabilities) {
      setLocal({
        allow_create_appointment: capabilities.allow_create_appointment,
        allow_reschedule_appointment: capabilities.allow_reschedule_appointment,
        allow_cancel_appointment: capabilities.allow_cancel_appointment,
        allow_view_availability: capabilities.allow_view_availability,
      });
      setHasChanges(false);
    }
  }, [capabilities]);

  const handleToggle = (key: keyof SchedulingCapabilitiesUpdate, value: boolean) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(local, {
      onSuccess: () => setHasChanges(false),
    });
  };

  if (!schedulingEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sensitiveEnabled = local.allow_reschedule_appointment || local.allow_cancel_appointment;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Capacidades de Agendamento</CardTitle>
          </div>
          {hasChanges && (
            <Button type="button" size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Guardar
            </Button>
          )}
        </div>
        <CardDescription>
          Controle quais ações de agendamento os agentes IA podem executar para esta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          const isEnabled = local[cap.key];

          return (
            <div
              key={cap.key}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                isEnabled
                  ? cap.sensitive
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/20'
              )}
            >
              <div className={cn(
                'flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center mt-0.5',
                isEnabled
                  ? cap.sensitive
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={cap.key} className="text-sm font-medium cursor-pointer">
                      {cap.label}
                    </Label>
                    {cap.sensitive && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">
                        Sensível
                      </Badge>
                    )}
                  </div>
                  <Switch
                    id={cap.key}
                    checked={isEnabled}
                    onCheckedChange={(v) => handleToggle(cap.key, v)}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pr-10">
                  {cap.description}
                </p>
              </div>
            </div>
          );
        })}

        {sensitiveEnabled && (
          <Alert className="border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-xs">
              Ações sensíveis (reagendar/cancelar) alteram compromissos reais. 
              Os agentes pedirão sempre confirmação explícita ao utilizador antes de executar.
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-muted bg-muted/30">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Ações bloqueadas não consomem créditos. Se um cliente pedir uma ação desativada, 
            o agente explica a limitação e oferece transferência para um operador humano.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
