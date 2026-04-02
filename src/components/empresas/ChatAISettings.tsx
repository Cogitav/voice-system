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
import { Bot, Sparkles, AlertCircle, Zap, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAiProviders, AI_PROVIDER_MODELS } from '@/hooks/useAiProviders';

// Available AI models - now sourced from useAiProviders
const AVAILABLE_MODELS = [
  // Google models
  { 
    value: 'google/gemini-3-flash-preview', 
    label: 'Gemini 3 Flash (Preview)', 
    provider: 'google',
    description: 'Rápido e equilibrado - Recomendado',
    isDefault: true,
  },
  { 
    value: 'google/gemini-2.5-flash', 
    label: 'Gemini 2.5 Flash', 
    provider: 'google',
    description: 'Boa qualidade, baixa latência',
    isDefault: false,
  },
  { 
    value: 'google/gemini-2.5-flash-lite', 
    label: 'Gemini 2.5 Flash Lite', 
    provider: 'google',
    description: 'Mais económico, tarefas simples',
    isDefault: false,
  },
  { 
    value: 'google/gemini-2.5-pro', 
    label: 'Gemini 2.5 Pro', 
    provider: 'google',
    description: 'Maior qualidade, mais lento',
    isDefault: false,
  },
  // OpenAI models  
  { 
    value: 'openai/gpt-5-nano', 
    label: 'GPT-5 Nano', 
    provider: 'openai',
    description: 'Muito rápido, económico',
    isDefault: false,
  },
  { 
    value: 'openai/gpt-5-mini', 
    label: 'GPT-5 Mini', 
    provider: 'openai',
    description: 'Bom equilíbrio custo/qualidade',
    isDefault: false,
  },
  { 
    value: 'openai/gpt-5', 
    label: 'GPT-5', 
    provider: 'openai',
    description: 'Alta qualidade, mais caro',
    isDefault: false,
  },
];

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

interface ChatAISettingsProps {
  // deno-lint-ignore no-explicit-any
  form: UseFormReturn<any>;
}

export function ChatAISettings({ form }: ChatAISettingsProps) {
  const { data: providers, isLoading: providersLoading } = useAiProviders();
  
  const isRealAIEnabled = form.watch('chat_ai_real_enabled');
  const selectedModel = form.watch('chat_ai_model');
  const selectedModelInfo = AVAILABLE_MODELS.find(m => m.value === selectedModel);

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

  const googleStatus = getProviderStatus('google');
  const openaiStatus = getProviderStatus('openai');

  // Check if the selected model's provider is available
  const selectedProviderKey = selectedModel?.startsWith('openai/') ? 'openai' : 'google';
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
          {googleStatus.enabled && googleStatus.hasKey ? (
            <CheckCircle className="h-4 w-4 text-primary" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={googleStatus.enabled && googleStatus.hasKey ? 'text-foreground' : 'text-muted-foreground'}>
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
                    // Auto-set provider based on model prefix
                    const provider = value.startsWith('openai/') ? 'openai' : 'google';
                    form.setValue('chat_ai_provider', provider);
                  }} 
                  value={field.value || DEFAULT_MODEL}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      Google
                      {googleStatus.enabled && googleStatus.hasKey ? (
                        <Badge variant="secondary" className="text-xs">
                          Disponível
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Não configurado
                        </Badge>
                      )}
                    </div>
                    {AVAILABLE_MODELS.filter(m => m.provider === 'google').map((model) => (
                      <SelectItem 
                        key={model.value} 
                        value={model.value}
                        disabled={!googleStatus.enabled || !googleStatus.hasKey}
                      >
                        <div className="flex items-center gap-2">
                          <span>{model.label}</span>
                          {model.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Recomendado
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                    
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2 flex items-center gap-2">
                      OpenAI
                      {openaiStatus.enabled && openaiStatus.hasKey ? (
                        <Badge variant="secondary" className="text-xs">
                          Disponível
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Não configurado
                        </Badge>
                      )}
                    </div>
                    {AVAILABLE_MODELS.filter(m => m.provider === 'openai').map((model) => (
                      <SelectItem 
                        key={model.value} 
                        value={model.value}
                        disabled={!openaiStatus.enabled || !openaiStatus.hasKey}
                      >
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModelInfo && (
                  <FormDescription className="flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    {selectedModelInfo.description}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Warning if selected provider is not ready */}
          {!isSelectedProviderReady && selectedModel && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                O fornecedor <strong>{selectedProviderKey === 'openai' ? 'OpenAI' : 'Google'}</strong> não está 
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
