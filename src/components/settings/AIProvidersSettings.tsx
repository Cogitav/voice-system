import { useState } from 'react';
import { Cpu, Loader2, TestTube2, Power, PowerOff, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  useAiProviders, 
  useUpdateAiProviderKey,
  useToggleAiProvider,
  useTestAiProvider,
  AI_PROVIDERS_INFO,
  type AiProvider 
} from '@/hooks/useAiProviders';
import { Skeleton } from '@/components/ui/skeleton';

export function AIProvidersSettings() {
  const { data: providers, isLoading } = useAiProviders();
  const updateKey = useUpdateAiProviderKey();
  const toggleProvider = useToggleAiProvider();
  const testProvider = useTestAiProvider();
  
  const [newApiKeys, setNewApiKeys] = useState<Record<string, string>>({});

  const handleSaveApiKey = async (providerId: string) => {
    const key = newApiKeys[providerId];
    if (key !== undefined && key !== '') {
      await updateKey.mutateAsync({ providerId, apiKey: key });
      setNewApiKeys(prev => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    }
  };

  const handleToggleEnabled = async (provider: AiProvider) => {
    await toggleProvider.mutateAsync({ 
      providerId: provider.id, 
      isEnabled: !provider.is_enabled 
    });
  };

  const handleTestConnection = async (providerId: string) => {
    await testProvider.mutateAsync(providerId);
  };

  const getStatusBadge = (status: AiProvider['status'], isEnabled: boolean) => {
    if (!isEnabled) {
      return (
        <Badge variant="outline" className="gap-1">
          <PowerOff className="h-3 w-3" />
          Desligado
        </Badge>
      );
    }

    switch (status) {
      case 'active':
        return (
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle className="h-3 w-3" />
            Ativo (OK)
          </Badge>
        );
      case 'auth_error':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Erro de autenticação
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            Por testar
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Fornecedores de IA</CardTitle>
            <CardDescription className="mt-1">
              Configure as APIs dos modelos de IA utilizados na plataforma
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Cpu className="h-4 w-4" />
          <AlertDescription>
            <strong>Configuração centralizada:</strong> As chaves de API configuradas aqui são utilizadas por todas as empresas. 
            Cada empresa pode escolher qual modelo utilizar, mas a autenticação é gerida centralmente.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {providers?.map((provider, index) => {
            const info = AI_PROVIDERS_INFO[provider.provider_key] || { name: provider.provider_name, icon: '🔮' };
            const hasNewKey = newApiKeys[provider.id] !== undefined;
            const isTestingThis = testProvider.isPending && testProvider.variables === provider.id;

            return (
              <div key={provider.id}>
                {index > 0 && <Separator className="mb-4" />}
                <div className={`
                  p-4 rounded-lg border transition-colors
                  ${provider.is_enabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}
                `}>
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{info.icon}</span>
                      <div>
                        <h4 className="font-medium">{info.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {provider.provider_key === 'openai' 
                            ? 'GPT-5 e modelos relacionados' 
                            : 'Gemini 2.5 e 3 series'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(provider.status, provider.is_enabled)}
                      <Switch
                        checked={provider.is_enabled}
                        onCheckedChange={() => handleToggleEnabled(provider)}
                        disabled={toggleProvider.isPending}
                        aria-label={`${provider.is_enabled ? 'Desativar' : 'Ativar'} ${info.name}`}
                      />
                    </div>
                  </div>

                  {/* API Key Input - never shows existing key, only allows setting new one */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Chave de API</label>
                    <div className="flex items-center gap-2">
                      {provider.has_api_key && !hasNewKey && (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type="password"
                            value="••••••••••••••••"
                            disabled
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNewApiKeys(prev => ({ ...prev, [provider.id]: '' }))}
                          >
                            Alterar
                          </Button>
                        </div>
                      )}
                      {(!provider.has_api_key || hasNewKey) && (
                        <div className="flex-1 flex gap-2">
                          <Input
                            type="password"
                            value={newApiKeys[provider.id] ?? ''}
                            onChange={(e) => setNewApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            placeholder={`Introduza a chave de API ${info.name}...`}
                          />
                          <Button
                            onClick={() => handleSaveApiKey(provider.id)}
                            disabled={updateKey.isPending || !newApiKeys[provider.id]}
                            size="sm"
                          >
                            {updateKey.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Guardar'
                            )}
                          </Button>
                          {hasNewKey && provider.has_api_key && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setNewApiKeys(prev => {
                                const next = { ...prev };
                                delete next[provider.id];
                                return next;
                              })}
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {provider.provider_key === 'openai'
                        ? 'Obtenha sua chave em platform.openai.com/api-keys'
                        : 'Obtenha sua chave em aistudio.google.com/apikey'}
                    </p>
                  </div>

                  {/* Test Connection Button */}
                  {provider.has_api_key && (
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={testProvider.isPending}
                        className="gap-2"
                      >
                        {isTestingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube2 className="h-4 w-4" />
                        )}
                        Testar ligação
                      </Button>
                      {provider.last_tested_at && (
                        <span className="text-xs text-muted-foreground">
                          Último teste: {new Date(provider.last_tested_at).toLocaleString('pt-PT')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* How it works */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Como funciona?</h4>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Power className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Ativar:</strong> Torna o fornecedor disponível para utilização pelas empresas</span>
            </div>
            <div className="flex items-start gap-2">
              <TestTube2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>Testar:</strong> Valida se a chave de API está correta e funcional</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>Fallback:</strong> Se o fornecedor falhar, o sistema usa automaticamente o Mock AI</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
