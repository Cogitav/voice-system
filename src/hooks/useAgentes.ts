import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Agente {
  id: string;
  empresa_id: string;
  empresa_nome?: string;
  nome: string;
  idioma: string | null;
  descricao_funcao: string | null;
  contexto_negocio: string | null;
  prompt_base: string | null;
  regras: string | null;
  status: string;
  is_default_chat_agent: boolean;
  welcome_message: string | null;
  response_delay_ms: number | null;
  initial_greeting: string | null;
  response_style: string | null;
  created_at: string;
}

export interface AgenteFormData {
  nome: string;
  empresa_id: string;
  idioma?: string;
  descricao_funcao?: string;
  contexto_negocio?: string;
  prompt_base?: string;
  regras?: string;
  status?: string;
  is_default_chat_agent?: boolean;
  response_delay_ms?: number;
  initial_greeting?: string;
  response_style?: string;
}

export function useAgentes(includeArchived = false) {
  return useQuery({
    queryKey: ['agentes', includeArchived],
    queryFn: async () => {
      let query = supabase
        .from('agentes')
        .select(`
          id,
          empresa_id,
          nome,
          idioma,
          descricao_funcao,
          contexto_negocio,
          prompt_base,
          regras,
          status,
          is_default_chat_agent,
          welcome_message,
          response_delay_ms,
          initial_greeting,
          response_style,
          created_at,
          deleted_at,
          empresas!inner(nome, deleted_at)
        `)
        .order('created_at', { ascending: false });

      // Filter out soft-deleted agents and agents from soft-deleted empresas
      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      // Also filter out agents from deleted empresas (unless viewing archived)
      const filteredData = includeArchived 
        ? data 
        : data.filter((agente: any) => !agente.empresas?.deleted_at);

      return filteredData.map((agente: any) => ({
        ...agente,
        empresa_nome: agente.empresas?.nome || 'N/A',
      })) as Agente[];
    },
  });
}

export function useAgente(id: string | undefined) {
  return useQuery({
    queryKey: ['agentes', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('agentes')
        .select(`
          id,
          empresa_id,
          nome,
          idioma,
          descricao_funcao,
          contexto_negocio,
          prompt_base,
          regras,
          status,
          is_default_chat_agent,
          welcome_message,
          response_delay_ms,
          initial_greeting,
          response_style,
          created_at,
          empresas!inner(nome)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) return null;

      return {
        ...data,
        empresa_nome: (data as any).empresas?.nome || 'N/A',
      } as Agente;
    },
    enabled: !!id,
  });
}

export function useCreateAgente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AgenteFormData) => {
      const { data: agente, error } = await supabase
        .from('agentes')
        .insert({
          nome: data.nome,
          empresa_id: data.empresa_id,
          idioma: data.idioma || 'pt-PT',
          descricao_funcao: data.descricao_funcao || null,
          contexto_negocio: data.contexto_negocio || null,
          prompt_base: data.prompt_base || null,
          regras: data.regras || null,
          status: data.status || 'ativo',
          is_default_chat_agent: data.is_default_chat_agent ?? false,
          response_delay_ms: data.response_delay_ms ?? null,
          initial_greeting: data.initial_greeting || null,
          response_style: data.response_style || 'neutral',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return agente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      toast.success('Agente criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar agente: ${error.message}`);
    },
  });
}

export function useUpdateAgente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgenteFormData> }) => {
      const { data: agente, error } = await supabase
        .from('agentes')
        .update({
          nome: data.nome,
          empresa_id: data.empresa_id,
          idioma: data.idioma,
          descricao_funcao: data.descricao_funcao || null,
          contexto_negocio: data.contexto_negocio || null,
          prompt_base: data.prompt_base || null,
          regras: data.regras || null,
          status: data.status,
          is_default_chat_agent: data.is_default_chat_agent,
          response_delay_ms: data.response_delay_ms ?? null,
          initial_greeting: data.initial_greeting || null,
          response_style: data.response_style || 'neutral',
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return agente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar agente: ${error.message}`);
    },
  });
}
