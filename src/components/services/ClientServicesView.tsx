import { 
  MessageCircle, 
  Phone, 
  Calendar, 
  Mail,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServiceAccessFlags, PLATFORM_SERVICES } from '@/hooks/useServiceAccess';

const SERVICE_ICONS = {
  chat: MessageCircle,
  voice: Phone,
  scheduling: Calendar,
  email: Mail,
} as const;

interface ClientServicesViewProps {
  services: ServiceAccessFlags;
}

export function ClientServicesView({ services }: ClientServicesViewProps) {
  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Serviços Disponíveis</h3>
        <p className="text-sm text-muted-foreground">
          Serviços ativos para a sua empresa. Contacte o administrador para alterações.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORM_SERVICES.map((service) => {
          const Icon = SERVICE_ICONS[service.id];
          const isEnabled = services[service.id];
          
          return (
            <div
              key={service.id}
              className={cn(
                'flex items-start gap-3 p-4 rounded-lg border transition-colors',
                isEnabled 
                  ? 'border-primary/30 bg-primary/5' 
                  : 'border-border bg-muted/30 opacity-60'
              )}
            >
              <div className={cn(
                'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                isEnabled 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-4 w-4" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{service.label}</span>
                  {isEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {service.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/50 rounded-lg p-3 mt-4">
        <p className="text-xs text-muted-foreground">
          Os serviços são geridos pelo administrador da plataforma. Se precisar de ativar 
          funcionalidades adicionais, por favor entre em contacto.
        </p>
      </div>
    </div>
  );
}
