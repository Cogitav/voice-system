import { 
  Mail, 
  Phone, 
  MessageCircle, 
  Globe, 
  Calendar, 
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Shield
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SettingKey, SETTING_KEYS } from '@/hooks/useSettings';
import { AIProvidersSettings } from './AIProvidersSettings';

interface IntegrationsSettingsProps {
  settings: Record<string, any>;
  onSettingChange: (key: SettingKey, value: any) => void;
  isLoading?: boolean;
}

type IntegrationStatus = 'active' | 'coming_soon' | 'planned';

interface Integration {
  id: string;
  settingKey: SettingKey;
  category: string;
  icon: React.ElementType;
  title: string;
  description: string;
  status: IntegrationStatus;
  helperText: string;
  enabledDescription?: string;
}

const integrations: Integration[] = [
  {
    id: 'email',
    settingKey: SETTING_KEYS.INTEGRATION_EMAIL_ENABLED,
    category: 'Comunicação',
    icon: Mail,
    title: 'Email',
    description: 'Envio de emails de follow-up e notificações',
    status: 'active',
    helperText: 'Permite configurar templates e regras de envio automático de emails após chamadas.',
    enabledDescription: 'Os emails serão enviados de acordo com as regras e templates configurados.'
  },
  {
    id: 'phone',
    settingKey: SETTING_KEYS.INTEGRATION_PHONE_ENABLED,
    category: 'Comunicação',
    icon: Phone,
    title: 'Chamadas Telefónicas',
    description: 'Gestão de chamadas de voz com agentes IA',
    status: 'coming_soon',
    helperText: 'Em desenvolvimento. Permitirá integração com sistemas de telefonia VoIP.'
  },
  {
    id: 'whatsapp',
    settingKey: SETTING_KEYS.INTEGRATION_WHATSAPP_ENABLED,
    category: 'Comunicação',
    icon: MessageCircle,
    title: 'WhatsApp',
    description: 'Comunicação via WhatsApp Business',
    status: 'planned',
    helperText: 'Planeado para versões futuras. Permitirá enviar mensagens via WhatsApp Business API.'
  },
  {
    id: 'webchat',
    settingKey: SETTING_KEYS.INTEGRATION_WEBCHAT_ENABLED,
    category: 'Comunicação',
    icon: Globe,
    title: 'Web Chat',
    description: 'Widget de chat para websites',
    status: 'planned',
    helperText: 'Planeado para versões futuras. Widget embebível para atendimento em tempo real.'
  },
  {
    id: 'calendar',
    settingKey: SETTING_KEYS.INTEGRATION_CALENDAR_ENABLED,
    category: 'Produtividade',
    icon: Calendar,
    title: 'Calendários',
    description: 'Sincronização com Google Calendar, Outlook, etc.',
    status: 'coming_soon',
    helperText: 'Em desenvolvimento. Permitirá sincronizar agendamentos com calendários externos.'
  },
  {
    id: 'crm',
    settingKey: SETTING_KEYS.INTEGRATION_CRM_ENABLED,
    category: 'Produtividade',
    icon: Users,
    title: 'CRM',
    description: 'Integração com sistemas de gestão de clientes',
    status: 'planned',
    helperText: 'Planeado para versões futuras. Suportará Salesforce, HubSpot, Pipedrive e outros.'
  }
];

const statusConfig: Record<IntegrationStatus, { label: string; variant: 'default' | 'secondary' | 'outline'; icon: React.ElementType }> = {
  active: { label: 'Ativo', variant: 'default', icon: CheckCircle2 },
  coming_soon: { label: 'Em Breve', variant: 'secondary', icon: Clock },
  planned: { label: 'Planeado', variant: 'outline', icon: Sparkles }
};

export function IntegrationsSettings({ settings, onSettingChange, isLoading }: IntegrationsSettingsProps) {
  const groupedIntegrations = integrations.reduce((acc, integration) => {
    if (!acc[integration.category]) {
      acc[integration.category] = [];
    }
    acc[integration.category].push(integration);
    return acc;
  }, {} as Record<string, Integration[]>);

  const isIntegrationEnabled = (integration: Integration) => {
    return settings[integration.settingKey] === true;
  };

  const canToggle = (integration: Integration) => {
    return integration.status === 'active';
  };

  return (
    <div className="space-y-8">
      {/* AI Providers Section */}
      <AIProvidersSettings />
      
      {/* Communication Channels Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Canais de Comunicação</CardTitle>
              <CardDescription className="mt-1">
                Controle quais canais de comunicação e ferramentas estão disponíveis na plataforma
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Admin Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Apenas Administradores</strong> podem configurar integrações. 
            Ativar uma integração permite que as empresas a utilizem, mas não executa nenhuma ação automaticamente.
            Cada integração requer configuração adicional antes de funcionar.
          </AlertDescription>
        </Alert>

        {/* Integration Categories */}
        {Object.entries(groupedIntegrations).map(([category, categoryIntegrations], categoryIndex) => (
          <div key={category} className="space-y-4">
            {categoryIndex > 0 && <Separator className="my-6" />}
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {category}
            </h3>
            <div className="grid gap-4">
              {categoryIntegrations.map((integration) => {
                const status = statusConfig[integration.status];
                const StatusIcon = status.icon;
                const IntegrationIcon = integration.icon;
                const enabled = isIntegrationEnabled(integration);
                const toggleable = canToggle(integration);

                return (
                  <div 
                    key={integration.id}
                    className={`
                      flex items-start gap-4 p-4 rounded-lg border transition-colors
                      ${enabled && toggleable ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}
                      ${!toggleable ? 'opacity-75' : ''}
                    `}
                  >
                    {/* Icon */}
                    <div className={`
                      p-2.5 rounded-lg shrink-0
                      ${enabled && toggleable ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
                    `}>
                      <IntegrationIcon className="h-5 w-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{integration.title}</h4>
                        <Badge variant={status.variant} className="gap-1 text-xs">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {integration.description}
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-2">
                        {enabled && integration.enabledDescription 
                          ? integration.enabledDescription 
                          : integration.helperText
                        }
                      </p>
                    </div>

                    {/* Toggle */}
                    <div className="shrink-0">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => onSettingChange(integration.settingKey, checked)}
                        disabled={isLoading || !toggleable}
                        aria-label={`${enabled ? 'Desativar' : 'Ativar'} ${integration.title}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* What happens info */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Como funcionam as integrações?</h4>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Ativo:</strong> Disponível para configuração e utilização imediata</span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>Em Breve:</strong> Em desenvolvimento ativo, disponível nas próximas atualizações</span>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>Planeado:</strong> No roadmap para versões futuras</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
