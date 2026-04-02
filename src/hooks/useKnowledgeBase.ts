import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type KnowledgeType = 'faq' | 'document' | 'website' | 'notes';

export interface KnowledgeItem {
  id: string;
  empresa_id: string;
  agent_id: string | null;
  title: string;
  type: KnowledgeType;
  content: string | null;
  source_url: string | null;
  file_path: string | null;
  status: string;
  created_at: string;
  agente?: {
    nome: string;
  } | null;
}

export interface KnowledgeFormData {
  empresa_id: string;
  agent_id?: string | null;
  title: string;
  type: KnowledgeType;
  content?: string;
  source_url?: string;
  file_path?: string;
  status?: string;
}

export function useKnowledgeBase(empresaId?: string | null, agentId?: string | null) {
  return useQuery({
    queryKey: ['knowledge-base', empresaId, agentId],
    queryFn: async () => {
      let query = supabase
        .from('agent_knowledge_base')
        .select(`
          id,
          empresa_id,
          agent_id,
          title,
          type,
          content,
          source_url,
          file_path,
          status,
          created_at,
          agente:agentes(nome)
        `)
        .order('created_at', { ascending: false });

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      if (agentId) {
        query = query.or(`agent_id.eq.${agentId},agent_id.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data as unknown as KnowledgeItem[];
    },
  });
}

export function useAllKnowledgeBase() {
  return useQuery({
    queryKey: ['knowledge-base-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_knowledge_base')
        .select(`
          id,
          empresa_id,
          agent_id,
          title,
          type,
          content,
          source_url,
          file_path,
          status,
          created_at,
          agente:agentes(nome)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data as unknown as KnowledgeItem[];
    },
  });
}

export function useCreateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: KnowledgeFormData) => {
      const { data: knowledge, error } = await supabase
        .from('agent_knowledge_base')
        .insert({
          empresa_id: data.empresa_id,
          agent_id: data.agent_id || null,
          title: data.title,
          type: data.type,
          content: data.content || null,
          source_url: data.source_url || null,
          file_path: data.file_path || null,
          status: data.status || 'active',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return knowledge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-all'] });
      toast.success('Conhecimento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar conhecimento: ${error.message}`);
    },
  });
}

export function useUpdateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<KnowledgeFormData> }) => {
      const { data: knowledge, error } = await supabase
        .from('agent_knowledge_base')
        .update({
          agent_id: data.agent_id,
          title: data.title,
          type: data.type,
          content: data.content || null,
          source_url: data.source_url || null,
          file_path: data.file_path || null,
          status: data.status,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return knowledge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-all'] });
      toast.success('Conhecimento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar conhecimento: ${error.message}`);
    },
  });
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_knowledge_base')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-all'] });
      toast.success('Conhecimento eliminado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao eliminar conhecimento: ${error.message}`);
    },
  });
}
