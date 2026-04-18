import { UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bot, Sparkles, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAiProviders } from '@/hooks/useAiProviders';

// Available AI models grouped by provider
const AVAILABLE_MODELS = [
  {
    provider: 'google',
    label: 'Google',
    models: [
      { value: 'gemini-2.5-flash-preview-04-17', label: 'Gemini 2.5 Flash', recommended: true },
      { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro', recommended: false },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', recommended: false },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', recommended: false },
    ]
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', recommended: true },
      { value: 'gpt-4o', label: 'GPT-4o', recommended: false },
    ]
  }
];

const DEFAULT_MODEL = 'gemini-1.5-flash';

interface ChatAISettingsProps {
  // deno-lint-ignore no-explicit-any
  form: UseFormReturn<any>;
}

export function ChatAISettings({ form }: ChatAISettingsProps) {
  const { data: providers, isLoading: providersLoading } = useAiProviders();

  const isRealAIEnabled = form.watch('chat_ai_real_enabled');
  const selectedModel = form.watch('chat_ai_model');
  const selectedModelInfo = AVAILABLE_MODELS.flatMap(g => g.models).find(m => m.value === selectedModel);

  // Determine provider status
  const getProviderStatus = (providerKey: string) => {
    if (providersLoading || !providers) return { enabled: false, hasKey: false };
    const provider = providers.find(p => p.provider_key === providerKey);
    return {
      enabled: provider?.is_enabled ?? false,
      hasKey: provider?.has_api_key ?? false,
      status: provider?.status ?? 'inactive',
    };
  };

  const geminiStatus = getProviderStatus('gemini');
  const openaiStatus = getProviderStatus('openai');

  // Check if the selected model's provider is available
  const selectedProviderKey = selectedModel?.startsWith('gpt-') ? 'openai' : 'gemini';
  const selectedProviderStatus = getProviderStatus(selectedProviderKey);
  const isSelectedProviderReady = selectedProviderStatus.enabled && selectedProviderStatus.hasKey;

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Bot className="h-5 w-5" />
          Configuração de IA
        </h3>
        <p className="text-sm text-muted-foreground">
          Configure a inteligência artificial para o chat
        </p>
      </div>

      {/* Provider Status Overview */}
      <div className="flex gap-4 justify-center">
        <div className="flex items-center gap-2 text-sm">
          {geminiStatus.enabled && geminiStatus.hasKey ? (
            <CheckCircle className="h-4 w-4 text-primary" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={geminiStatus.enabled && geminiStatus.hasKey ? 'text-foreground' : 'text-muted-foreground'}>
            Google Gemini
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {openaiStatus.enabled && openaiStatus.hasKey ? (
            <CheckCircle className="h-4 w-4 text-primary" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={openaiStatus.enabled && openaiStatus.hasKey ? 'text-foreground' : 'text-muted-foreground'}>
            OpenAI
          </span>
        </div>
      </div>

      {/* Enable/Disable Real AI Toggle */}
      <div className="bg-muted/30 rounded-lg p-4">
        <FormField
          control={form.control}
          name="chat_ai_real_enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <FormLabel className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Ativar IA Real
                </FormLabel>
                <FormDescription>
                  Quando ativo, usa um modelo de linguagem real para gerar respostas.
                  Quando desativo, usa um assistente simulado (mock).
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {/* Model Selection - Only shown when Real AI is enabled */}
      {isRealAIEnabled && (
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="chat_ai_model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modelo de IA</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Auto-set provider based on model name
                    if (value.startsWith('gpt-')) {
                      form.setValue('chat_ai_provider', 'openai');
                    } else if (value.startsWith('gemini-')) {
                      form.setValue('chat_ai_provider', 'gemini');
                    }
                  }}
                  value={field.value || DEFAULT_MODEL}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {AVAILABLE_MODELS.map((group) => {
                      const status = group.provider === 'openai' ? openaiStatus : geminiStatus;
                      return (
                        <div key={group.provider}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                            {group.label}
                            {status.enabled && status.hasKey ? (
                              <Badge variant="secondary" className="text-xs">
                                Disponível
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Não configurado
                              </Badge>
                            )}
                          </div>
                          {group.models.map((model) => (
                            <SelectItem
                              key={model.value}
                              value={model.value}
                              disabled={!status.enabled || !status.hasKey}
                            >
                              <div className="flex items-center gap-2">
                                <span>{model.label}</span>
                                {model.recommended && (
                                  <Badge variant="secondary" className="text-xs">
                                    Recomendado
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </div>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Warning if selected provider is not ready */}
          {!isSelectedProviderReady && selectedModel && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                O fornecedor <strong>{selectedProviderKey === 'openai' ? 'OpenAI' : 'Google Gemini'}</strong> não está
                configurado. Vá a <strong>Configurações → Integrações → Fornecedores de IA</strong> para
                ativar e configurar a chave de API.
              </AlertDescription>
            </Alert>
          )}

          {/* Cost Warning */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Custos:</strong> A IA real consome créditos por cada mensagem.
              Cada resposta de IA custa 1 crédito. O modelo simulado é gratuito.
            </AlertDescription>
          </Alert>

          {/* Hidden provider field */}
          <FormField
            control={form.control}
            name="chat_ai_provider"
            render={({ field }) => (
              <input type="hidden" {...field} value={field.value || selectedProviderKey} />
            )}
          />
        </div>
      )}

      {/* Mock AI Info when disabled */}
      {!isRealAIEnabled && (
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Modo de Teste Ativo
          </h4>
          <p className="text-sm text-muted-foreground">
            O chat está a usar um assistente simulado que responde de forma genérica.
            Não consome créditos, mas não tem acesso à base de conhecimento
            nem consegue executar ações inteligentes.
          </p>
        </div>
      )}
    </div>
  );
}
