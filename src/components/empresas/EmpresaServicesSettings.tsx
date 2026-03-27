import { UseFormReturn } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageCircle, 
  Phone, 
  Calendar, 
  Mail,
  AlertTriangle,
  Shield,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceConfig {
  id: string;
  fieldName: 'service_chat_enabled' | 'service_voice_enabled' | 'service_scheduling_enabled' | 'service_email_enabled';
  label: string;
  description: string;
  icon: React.ElementType;
  warning?: string;
}

const SERVICES: ServiceConfig[] = [
  {
    id: 'chat',
    fieldName: 'service_chat_enabled',
    label: 'Chat',
    description: 'Widget de chat no website, inbox de mensagens, handoff humano e assistente IA interno.',
    icon: MessageCircle,
  },
  {
    id: 'voice',
    fieldName: 'service_voice_enabled',
    label: 'Voz',
    description: 'Chamadas telefónicas com agentes de voz IA, transcrição e resumos automáticos.',
    icon: Phone,
    warning: 'Este serviço consome mais recursos e tem custos operacionais mais elevados.',
  },
  {
    id: 'scheduling',
    fieldName: 'service_scheduling_enabled',
    label: 'Agendamentos',
    description: 'Criação de compromissos, sincronização com calendários externos e gestão de horários.',
    icon: Calendar,
  },
  {
    id: 'email',
    fieldName: 'service_email_enabled',
    label: 'Email',
    description: 'Emails de follow-up automáticos, notificações do sistema e alertas.',
    icon: Mail,
  },
];

interface EmpresaServicesSettingsProps {
  form: UseFormReturn<any>;
  empresaId?: string;  // For showing scheduling status
}

export function EmpresaServicesSettings({ form, empresaId }: EmpresaServicesSettingsProps) {
  const schedulingEnabled = form.watch('service_scheduling_enabled') ?? false;
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Serviços Ativos</h3>
        <p className="text-sm text-muted-foreground">
          Defina quais serviços estão disponíveis para esta empresa
        </p>
      </div>

      <Alert className="bg-muted/50 border-muted">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Serviços desativados ficam completamente inacessíveis. A empresa não conseguirá utilizar 
          funcionalidades relacionadas, nem consumir créditos nesses serviços.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          const isEnabled = form.watch(service.fieldName) ?? false;
          
          return (
            <div
              key={service.id}
              className={cn(
                'flex items-start gap-4 p-4 rounded-lg border transition-colors',
                isEnabled 
                  ? 'border-primary/50 bg-primary/5' 
                  : 'border-border bg-muted/30'
              )}
            >
              <div className={cn(
                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                isEnabled 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <Label 
                    htmlFor={service.fieldName} 
                    className="text-base font-medium cursor-pointer"
                  >
                    {service.label}
                  </Label>
                  <Switch
                    id={service.fieldName}
                    checked={isEnabled}
                    onCheckedChange={(checked) => form.setValue(service.fieldName, checked)}
                  />
                </div>
                <p className="text-sm text-muted-foreground pr-12">
                  {service.description}
                </p>
                {service.warning && isEnabled && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>{service.warning}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scheduling components are rendered separately outside the form in EmpresaFormDialog */}

      {/* Request Only Info when scheduling enabled but no calendar */}
      {schedulingEnabled && !empresaId && (
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Sem uma integração de calendário ativa, os agendamentos funcionarão em 
            <strong> modo de pedidos</strong>. A IA não poderá confirmar automaticamente - 
            apenas registar pedidos para confirmação manual.
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Nota:</strong> As permissões de serviço são independentes do plano de subscrição. 
          Os créditos são partilhados entre todos os serviços ativos.
        </p>
      </div>
    </div>
  );
}
