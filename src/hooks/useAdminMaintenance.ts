import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

// Types for admin audit log
export interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Log an admin action to the audit log
async function logAdminAction(
  adminUserId: string,
  actionType: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await supabase
    .from('admin_audit_log')
    .insert([{
      admin_user_id: adminUserId,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      metadata: metadata as unknown as import('@/integrations/supabase/types').Json,
    }]);

  if (error) {
    console.error('Failed to log admin action:', error);
  }
}

// Soft delete (archive) an empresa
export function useArchiveEmpresa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (empresaId: string) => {
      const now = new Date().toISOString();

      // Soft delete the empresa
      const { error: empresaError } = await supabase
        .from('empresas')
        .update({ deleted_at: now })
        .eq('id', empresaId);

      if (empresaError) throw new Error(empresaError.message);

      // Also soft delete related records
      await Promise.all([
        supabase.from('agentes').update({ deleted_at: now }).eq('empresa_id', empresaId),
        supabase.from('conversations').update({ deleted_at: now }).eq('empresa_id', empresaId),
        supabase.from('chamadas').update({ deleted_at: now }).eq('empresa_id', empresaId),
        supabase.from('profiles').update({ deleted_at: now }).eq('empresa_id', empresaId),
      ]);

      // Log the action
      if (user?.id) {
        await logAdminAction(user.id, 'archive_empresa', 'empresa', empresaId, { archived_at: now });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chamadas'] });
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      toast.success('Empresa arquivada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao arquivar empresa: ${error.message}`);
    },
  });
}

// Restore a soft-deleted empresa
export function useRestoreEmpresa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (empresaId: string) => {
      // Restore the empresa
      const { error: empresaError } = await supabase
        .from('empresas')
        .update({ deleted_at: null })
        .eq('id', empresaId);

      if (empresaError) throw new Error(empresaError.message);

      // Also restore related records
      await Promise.all([
        supabase.from('agentes').update({ deleted_at: null }).eq('empresa_id', empresaId),
        supabase.from('conversations').update({ deleted_at: null }).eq('empresa_id', empresaId),
        supabase.from('chamadas').update({ deleted_at: null }).eq('empresa_id', empresaId),
        supabase.from('profiles').update({ deleted_at: null }).eq('empresa_id', empresaId),
      ]);

      // Log the action
      if (user?.id) {
        await logAdminAction(user.id, 'restore_empresa', 'empresa', empresaId, { restored_at: new Date().toISOString() });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chamadas'] });
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });
      toast.success('Empresa restaurada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao restaurar empresa: ${error.message}`);
    },
  });
}

// Reset empresa demo data (conversations, calls, messages, current month credits)
export function useResetEmpresaDemoData() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (empresaId: string) => {
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Soft delete conversations (which cascades to messages via RLS/app logic)
      const { error: convoError } = await supabase
        .from('conversations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('empresa_id', empresaId);

      if (convoError) throw new Error(convoError.message);

      // Soft delete calls
      const { error: callsError } = await supabase
        .from('chamadas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('empresa_id', empresaId);

      if (callsError) throw new Error(callsError.message);

      // Reset current month credits usage
      const { error: creditsError } = await supabase
        .from('credits_usage')
        .update({ credits_used: 0, extra_credits: 0 })
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth);

      if (creditsError) throw new Error(creditsError.message);

      // Log the action
      if (user?.id) {
        await logAdminAction(user.id, 'reset_demo_data', 'empresa', empresaId, { 
          month: currentMonth,
          reset_at: new Date().toISOString() 
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chamadas'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['credits-usage'] });
      toast.success('Dados de demonstração limpos com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao limpar dados: ${error.message}`);
    },
  });
}

// Reset credits usage for current month
export function useResetCreditsUsage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (empresaId: string) => {
      const currentMonth = new Date().toISOString().slice(0, 7);

      const { error } = await supabase
        .from('credits_usage')
        .update({ credits_used: 0, extra_credits: 0 })
        .eq('empresa_id', empresaId)
        .eq('month', currentMonth);

      if (error) throw new Error(error.message);

      // Log the action
      if (user?.id) {
        await logAdminAction(user.id, 'reset_credits', 'credits_usage', empresaId, { 
          month: currentMonth,
          reset_at: new Date().toISOString() 
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['credits-usage'] });
      toast.success('Créditos do mês reiniciados com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao reiniciar créditos: ${error.message}`);
    },
  });
}

// Toggle test environment flag
export function useToggleTestEnvironment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ empresaId, isTest }: { empresaId: string; isTest: boolean }) => {
      const { error } = await supabase
        .from('empresas')
        .update({ is_test_environment: isTest })
        .eq('id', empresaId);

      if (error) throw new Error(error.message);

      // Log the action
      if (user?.id) {
        await logAdminAction(user.id, isTest ? 'enable_test_mode' : 'disable_test_mode', 'empresa', empresaId, { 
          is_test_environment: isTest 
        });
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success(variables.isTest ? 'Modo de teste ativado' : 'Modo de teste desativado');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao alterar modo de teste: ${error.message}`);
    },
  });
}
