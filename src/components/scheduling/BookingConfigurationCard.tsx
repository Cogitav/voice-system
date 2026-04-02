import { useBookingConfiguration } from '@/hooks/useBookingConfiguration';
import { useSchedulingServices } from '@/hooks/useSchedulingServices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, User, Mail, Phone, MessageSquare, Clock, CalendarClock, Building, Globe, ShieldCheck } from 'lucide-react';

interface BookingConfigurationCardProps {
  empresaId: string;
}

export function BookingConfigurationCard({ empresaId }: BookingConfigurationCardProps) {
  const { config, isLoading, update, isUpdating } = useBookingConfiguration(empresaId);
  const { data: services, isLoading: servicesLoading } = useSchedulingServices(empresaId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!config) return null;

  const toggle = (field: string, value: boolean) => {
    update({ [field]: value });
  };

  const ToggleRow = ({ icon: Icon, label, description, field, value }: {
    icon: React.ElementType;
    label: string;
    description: string;
    field: string;
    value: boolean;
  }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={value}
        onCheckedChange={(v) => toggle(field, v)}
        disabled={isUpdating}
      />
    </div>
  );

  const activeServices = (services || []).filter(s => s.status === 'active');

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Configuração de Agendamento</CardTitle>
        </div>
        <CardDescription>
          Defina os campos obrigatórios e regras de agendamento para esta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Required Fields */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Campos Obrigatórios</h4>
          <div className="divide-y">
            <ToggleRow icon={User} label="Nome" description="Exigir nome do cliente" field="require_name" value={config.require_name} />
            <ToggleRow icon={Mail} label="Email" description="Exigir email do cliente" field="require_email" value={config.require_email} />
            <ToggleRow icon={Phone} label="Telefone" description="Exigir telefone do cliente" field="require_phone" value={config.require_phone} />
            <ToggleRow icon={MessageSquare} label="Motivo" description="Exigir motivo da marcação" field="require_reason" value={config.require_reason} />
          </div>
        </div>

        {/* Booking Rules */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Regras de Agendamento</h4>
          <div className="divide-y">
            <ToggleRow icon={CalendarClock} label="Mesmo dia" description="Permitir agendamentos no próprio dia" field="allow_same_day_booking" value={config.allow_same_day_booking} />
            <ToggleRow icon={Clock} label="Fora do horário" description="Permitir agendamentos fora do horário de funcionamento" field="allow_outside_business_hours" value={config.allow_outside_business_hours} />
          </div>
          <div className="flex items-center gap-3 py-3">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Antecedência mínima (minutos)</Label>
              <p className="text-xs text-muted-foreground">Tempo mínimo antes do agendamento</p>
            </div>
            <Input
              type="number"
              min={0}
              className="w-24"
              value={config.minimum_advance_minutes}
              onChange={(e) => update({ minimum_advance_minutes: parseInt(e.target.value) || 0 })}
              disabled={isUpdating}
            />
          </div>
        </div>

        {/* Fallback Service */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Serviço de Fallback</h4>
          <div className="flex items-start gap-3 py-3">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <Label className="text-sm font-medium">Serviço predefinido</Label>
                <p className="text-xs text-muted-foreground">
                  Serviço utilizado automaticamente quando a IA não consegue identificar o tratamento solicitado.
                </p>
              </div>
              <Select
                value={config.fallback_service_id || '_none'}
                onValueChange={(v) => update({ fallback_service_id: v === '_none' ? null : v } as any)}
                disabled={isUpdating || servicesLoading}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Nenhum (desativado)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum (desativado)</SelectItem>
                  {activeServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Calendar Mode */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Modo de Calendário</h4>
          <div className="divide-y">
            <ToggleRow icon={Building} label="Calendário interno" description="Usar calendário interno da plataforma" field="allow_internal_calendar" value={config.allow_internal_calendar} />
            <ToggleRow icon={Globe} label="Calendário externo" description="Permitir integração com calendários externos" field="allow_external_calendar" value={config.allow_external_calendar} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
