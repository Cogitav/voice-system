import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Conversation, Message, ConversationFilters, ConversationStatus } from '@/types/conversations';
import { useEffect } from 'react';

export function useConversations(filters?: ConversationFilters) {
  const { isAdmin, profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations', filters],
    queryFn: async () => {
      let queryBuilder = supabase
        .from('conversations')
        .select(`
          *,
          empresas!inner(nome, deleted_at)
        `)
        .is('deleted_at', null) // Exclude soft-deleted conversations
        .order('last_message_at', { ascending: false });

      // Apply filters - cast to any to avoid type issues with enums before regeneration
      if (filters?.status && filters.status !== 'all') {
        queryBuilder = queryBuilder.eq('status', filters.status as any);
      }
      if (filters?.channel && filters.channel !== 'all') {
        queryBuilder = queryBuilder.eq('channel', filters.channel as any);
      }
      if (filters?.owner && filters.owner !== 'all') {
        queryBuilder = queryBuilder.eq('owner', filters.owner as any);
      }
      if (isAdmin && filters?.empresaId) {
        queryBuilder = queryBuilder.eq('empresa_id', filters.empresaId);
      }
      if (filters?.search) {
        queryBuilder = queryBuilder.or(`client_name.ilike.%${filters.search}%,client_identifier.ilike.%${filters.search}%`);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;

      // Filter out conversations from deleted empresas
      const filteredData = (data || []).filter((c: any) => !c.empresas?.deleted_at);

      return filteredData.map((c: any) => ({
        ...c,
        empresa_nome: c.empresas?.nome,
      })) as Conversation[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          empresas(nome)
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      return {
        ...data,
        empresa_nome: data.empresas?.nome,
      } as Conversation;
    },
    enabled: !!conversationId,
  });
}

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
  });

  // Subscribe to realtime updates for this conversation
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}

export function useAssumeConversation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({
          owner: 'human',
          status: 'human_active' as ConversationStatus,
          assigned_user_id: user?.id,
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      toast({ title: 'Conversa assumida com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao assumir conversa', description: error.message, variant: 'destructive' });
    },
  });
}

export function useReturnToAI() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({
          owner: 'ai',
          status: 'ai_active' as ConversationStatus,
          assigned_user_id: null,
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      toast({ title: 'Conversa devolvida à IA' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao devolver conversa', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCloseConversation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'closed' as ConversationStatus,
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      toast({ title: 'Conversa encerrada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao encerrar conversa', description: error.message, variant: 'destructive' });
    },
  });
}

export function useSendMessage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, content, isInternal = false }: { 
      conversationId: string; 
      content: string; 
      isInternal?: boolean;
    }) => {
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'human',
        sender_user_id: user?.id,
        content,
        is_internal: isInternal,
      });

      if (error) throw error;

      // Update last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar mensagem', description: error.message, variant: 'destructive' });
    },
  });
}
