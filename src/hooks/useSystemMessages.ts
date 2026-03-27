import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type SystemEventType = 'assume' | 'return_ai' | 'transfer';

const SYSTEM_MESSAGES: Record<SystemEventType, string> = {
  assume: 'Operador humano assumiu a conversa',
  return_ai: 'Conversa devolvida à IA',
  transfer: 'Conversa transferida',
};

export function useInsertSystemMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, eventType }: { conversationId: string; eventType: SystemEventType }) => {
      const message = SYSTEM_MESSAGES[eventType];
      
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'system',
        content: message,
        is_internal: false,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
    },
  });
}
