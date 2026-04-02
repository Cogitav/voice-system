import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ClosureReason } from '@/components/conversations/CloseConversationDialog';

interface CloseConversationParams {
  conversationId: string;
  closureReason: ClosureReason;
  closureNote?: string;
}

export function useCloseConversationWithSummary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, closureReason, closureNote }: CloseConversationParams) => {
      const { data, error } = await supabase.functions.invoke('close-conversation', {
        body: { conversationId, closureReason, closureNote },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast({ title: 'Conversa encerrada com sucesso' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao encerrar conversa', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}
