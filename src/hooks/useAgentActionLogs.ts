import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AgentActionLog {
  id: string;
  empresa_id: string;
  agent_id: string | null;
  conversation_id: string | null;
  action_type: string;
  action_data: Record<string, unknown>;
  actor_type: 'ai' | 'human';
  reference_id: string | null;
  outcome: 'success' | 'blocked' | 'failed';
  outcome_message: string | null;
  credits_consumed: number;
  created_at: string;
  // Joined data
  empresas?: { nome: string } | null;
  agentes?: { nome: string } | null;
}

interface UseAgentActionLogsParams {
  empresaId?: string;
  actionType?: string;
  outcome?: 'success' | 'blocked' | 'failed';
  limit?: number;
}

export function useAgentActionLogs(params: UseAgentActionLogsParams = {}) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['agent-action-logs', params],
    queryFn: async () => {
      let query = supabase
        .from('agent_action_logs')
        .select(`
          *,
          empresas:empresa_id(nome),
          agentes:agent_id(nome)
        `)
        .order('created_at', { ascending: false });

      if (params.empresaId) {
        query = query.eq('empresa_id', params.empresaId);
      }

      if (params.actionType) {
        query = query.eq('action_type', params.actionType);
      }

      if (params.outcome) {
        query = query.eq('outcome', params.outcome);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching action logs:', error);
        throw error;
      }

      return data as AgentActionLog[];
    },
    enabled: isAdmin, // Only admins can view all logs
  });
}

// Summary statistics for action logs
export function useAgentActionLogsSummary(empresaId?: string) {
  return useQuery({
    queryKey: ['agent-action-logs-summary', empresaId],
    queryFn: async () => {
      let query = supabase
        .from('agent_action_logs')
        .select('action_type, outcome, credits_consumed');

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      // Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query.gte('created_at', thirtyDaysAgo.toISOString());

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching action logs summary:', error);
        throw error;
      }

      // Aggregate data
      const summary = {
        totalActions: data?.length || 0,
        successCount: 0,
        blockedCount: 0,
        failedCount: 0,
        totalCredits: 0,
        byActionType: {} as Record<string, number>,
      };

      data?.forEach((log) => {
        if (log.outcome === 'success') summary.successCount++;
        if (log.outcome === 'blocked') summary.blockedCount++;
        if (log.outcome === 'failed') summary.failedCount++;
        summary.totalCredits += log.credits_consumed || 0;
        summary.byActionType[log.action_type] = (summary.byActionType[log.action_type] || 0) + 1;
      });

      return summary;
    },
  });
}
