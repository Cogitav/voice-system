import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AiProvider {
  id: string;
  provider_key: string;
  provider_name: string;
  is_enabled: boolean;
  has_api_key: boolean;
  status: 'inactive' | 'active' | 'auth_error';
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

// Supported models per provider
export const AI_PROVIDER_MODELS: Record<string, { value: string; label: string; description: string }[]> = {
  openai: [
    { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', description: 'Fastest, most economical' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', description: 'Good balance of speed and quality' },
    { value: 'openai/gpt-5', label: 'GPT-5', description: 'Most capable, higher cost' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2', description: 'Latest with enhanced reasoning' },
  ],
  google: [
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: 'Fastest, lowest cost' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Good balance of speed and quality' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Most capable, multimodal' },
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', description: 'Next-gen, balanced' },
    { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', description: 'Next-gen, most capable' },
  ],
};

// All available models (flat list)
export const ALL_AI_MODELS = Object.entries(AI_PROVIDER_MODELS).flatMap(([provider, models]) => 
  models.map(m => ({ ...m, provider }))
);

// Provider display info
export const AI_PROVIDERS_INFO: Record<string, { name: string; icon: string }> = {
  openai: { name: 'OpenAI', icon: '🤖' },
  google: { name: 'Google Gemini', icon: '✨' },
};

// Fetch all AI providers via secure RPC (no api_key exposed)
export function useAiProviders() {
  return useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_providers_safe');
      if (error) throw error;
      return data as AiProvider[];
    },
  });
}

// Update AI provider API key via edge function (key never touches client)
export function useUpdateAiProviderKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ providerId, apiKey }: { providerId: string; apiKey: string }) => {
      const { data, error } = await supabase.functions.invoke('manage-ai-provider', {
        body: { action: 'update_key', providerId, apiKey },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Chave de API atualizada');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar chave: ${error.message}`);
    },
  });
}

// Toggle AI provider enabled/disabled via edge function
export function useToggleAiProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ providerId, isEnabled }: { providerId: string; isEnabled: boolean }) => {
      const { data, error } = await supabase.functions.invoke('manage-ai-provider', {
        body: { action: 'toggle_enabled', providerId, isEnabled },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Fornecedor de IA atualizado');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar fornecedor: ${error.message}`);
    },
  });
}

// Test AI provider connection (unchanged - already uses edge function)
export function useTestAiProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      const { data, error } = await supabase.functions.invoke('test-ai-provider', {
        body: { providerId },
      });
      if (error) throw error;
      return data as { success: boolean; message: string; status: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      if (result.success) {
        toast.success('Ligação bem sucedida!');
      } else {
        toast.error(`Falha na ligação: ${result.message}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao testar ligação: ${error.message}`);
    },
  });
}

// Get models for a specific provider
export function getModelsForProvider(providerKey: string | null): { value: string; label: string; description: string }[] {
  if (!providerKey) return [];
  return AI_PROVIDER_MODELS[providerKey] || [];
}

// Map model to provider
export function getProviderFromModel(model: string | null): string | null {
  if (!model) return null;
  if (model.startsWith('openai/')) return 'openai';
  if (model.startsWith('google/')) return 'google';
  return null;
}
