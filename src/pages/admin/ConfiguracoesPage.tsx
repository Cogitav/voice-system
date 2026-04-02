import { useState, useEffect } from 'react';
import { Save, Loader2, Settings } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { EmailFollowUpSettings } from '@/components/settings/EmailFollowUpSettings';
import { AgentDefaultsSettings } from '@/components/settings/AgentDefaultsSettings';
import { SystemBehaviorSettings } from '@/components/settings/SystemBehaviorSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { SystemEmailSettings } from '@/components/settings/SystemEmailSettings';
import { SystemEmailTemplateEditor } from '@/components/settings/SystemEmailTemplateEditor';
import { AdminCreditsSettings } from '@/components/credits/AdminCreditsSettings';
import { AdminCreditsOverview } from '@/components/credits/AdminCreditsOverview';
import { AdminCreditEventsDebug } from '@/components/credits/AdminCreditEventsDebug';
import { AdminSystemEmailLogs } from '@/components/credits/AdminSystemEmailLogs';
import { 
  useGlobalSettings, 
  useUpdateGlobalSettings, 
  SETTING_KEYS,
  DEFAULT_SETTINGS,
  SettingKey 
} from '@/hooks/useSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ConfiguracoesPage() {
  const { data: globalData, isLoading } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings();
  
  const [localSettings, setLocalSettings] = useState<Record<string, any>>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with loaded data
  useEffect(() => {
    if (globalData?.settings) {
      setLocalSettings(globalData.settings);
      setHasChanges(false);
    }
  }, [globalData]);

  const handleSettingChange = (key: SettingKey, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const updates = Object.entries(localSettings).map(([key, value]) => ({
      key: key as SettingKey,
      value
    }));
    
    await updateSettings.mutateAsync(updates);
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Settings className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Configurações Globais</h1>
                <Badge variant="outline" className="mt-1 text-xs font-normal">
                  Aplicam-se a toda a plataforma
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Defina os valores padrão para todas as empresas e agentes. 
              Estas configurações podem ser personalizadas individualmente por empresa quando necessário.
            </p>
          </div>
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="gap-2 shrink-0"
            size="lg"
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar Alterações
          </Button>
        </div>

        {/* Tabs for different settings sections */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="general">Definições Gerais</TabsTrigger>
            <TabsTrigger value="emails">Emails de Sistema</TabsTrigger>
            <TabsTrigger value="credits">Créditos</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <div className="grid gap-8">
              {/* Primary Section: Email Settings */}
              <section>
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Comunicação
                  </h2>
                </div>
                <EmailFollowUpSettings 
                  settings={localSettings}
                  onSettingChange={handleSettingChange}
                  isLoading={updateSettings.isPending}
                />
              </section>

              {/* Secondary Section: Agent Defaults */}
              <section>
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Atendimento
                  </h2>
                </div>
                <AgentDefaultsSettings 
                  settings={localSettings}
                  onSettingChange={handleSettingChange}
                  isLoading={updateSettings.isPending}
                />
              </section>

              {/* Info Section: How it works */}
              <section>
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Informação
                  </h2>
                </div>
                <SystemBehaviorSettings />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="emails" className="mt-6">
            <div className="space-y-8">
              <SystemEmailSettings
                settings={localSettings}
                onSettingChange={handleSettingChange}
                isLoading={updateSettings.isPending}
              />
              <SystemEmailTemplateEditor settings={localSettings} />
              <AdminSystemEmailLogs />
            </div>
          </TabsContent>

          <TabsContent value="credits" className="mt-6">
            <div className="space-y-8">
              <AdminCreditsOverview />
              <AdminCreditsSettings 
                settings={localSettings}
                onSettingChange={handleSettingChange}
              />
              <AdminCreditEventsDebug />
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsSettings 
              settings={localSettings}
              onSettingChange={handleSettingChange}
              isLoading={updateSettings.isPending}
            />
          </TabsContent>
        </Tabs>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}