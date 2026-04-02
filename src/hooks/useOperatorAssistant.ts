import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AssistantSuggestions {
  summary: string;
  detectedIntent: string;
  suggestedReplies: string[];
  nextActions: string[];
}

export function useOperatorAssistant(conversationId: string | undefined) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<AssistantSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('operator-assistant', {
        body: { conversationId },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setSuggestions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get suggestions';
      setError(message);
      toast({
        title: 'Erro ao obter sugestões',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, toast]);

  const clearSuggestions = useCallback(() => {
    setSuggestions(null);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    fetchSuggestions,
    clearSuggestions,
  };
}
