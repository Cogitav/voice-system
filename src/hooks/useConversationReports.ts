import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, subDays, format, differenceInMinutes } from 'date-fns';
import { pt } from 'date-fns/locale';

export type DateRange = '7d' | '30d';

export interface DateRangeFilter {
  from: Date | undefined;
  to: Date | undefined;
}

export interface ConversationStats {
  totalConversations: number;
  resolvedPercentage: number;
  aiPercentage: number;
  humanPercentage: number;
  avgResponseTimeMinutes: number;
  closedCount: number;
  activeCount: number;
}

export interface ConversationChartDataPoint {
  name: string;
  conversations: number;
  closed: number;
}

export interface OwnerDistribution {
  name: string;
  value: number;
}

export interface IntentDistribution {
  name: string;
  value: number;
}

export interface ResultDistribution {
  name: string;
  value: number;
}

function getDateRange(range: DateRange): Date {
  const days = range === '7d' ? 7 : 30;
  return subDays(startOfDay(new Date()), days - 1);
}

function getDateRangeFromFilter(filter: DateRangeFilter): { start: Date; end: Date } {
  const start = filter.from || subDays(new Date(), 6);
  const end = filter.to || new Date();
  return { start: startOfDay(start), end };
}

// ============= ADMIN HOOKS =============

export function useAdminConversationStats(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-conversation-stats', dateRange],
    queryFn: async (): Promise<ConversationStats> => {
      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, status, owner, created_at, closed_at, result')
        .gte('created_at', startDate.toISOString());

      const total = conversations?.length || 0;
      const closed = conversations?.filter(c => c.status === 'closed').length || 0;
      const active = total - closed;
      
      // Resolved = closed with result = 'resolved'
      const resolved = conversations?.filter(c => c.result === 'resolved').length || 0;
      const resolvedPercentage = total > 0 ? (resolved / total) * 100 : 0;

      // Owner distribution
      const aiOwned = conversations?.filter(c => c.owner === 'ai').length || 0;
      const humanOwned = conversations?.filter(c => c.owner === 'human').length || 0;
      const aiPercentage = total > 0 ? (aiOwned / total) * 100 : 0;
      const humanPercentage = total > 0 ? (humanOwned / total) * 100 : 0;

      // Calculate avg response time (time to first close)
      const closedConvos = conversations?.filter(c => c.closed_at) || [];
      let totalMinutes = 0;
      closedConvos.forEach(c => {
        if (c.closed_at && c.created_at) {
          totalMinutes += differenceInMinutes(new Date(c.closed_at), new Date(c.created_at));
        }
      });
      const avgResponseTimeMinutes = closedConvos.length > 0 
        ? Math.round(totalMinutes / closedConvos.length) 
        : 0;

      return {
        totalConversations: total,
        resolvedPercentage: Math.round(resolvedPercentage * 10) / 10,
        aiPercentage: Math.round(aiPercentage * 10) / 10,
        humanPercentage: Math.round(humanPercentage * 10) / 10,
        avgResponseTimeMinutes,
        closedCount: closed,
        activeCount: active,
      };
    },
  });
}

export function useAdminConversationsOverTime(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-conversations-over-time', dateRange],
    queryFn: async (): Promise<ConversationChartDataPoint[]> => {
      const days = dateRange === '7d' ? 7 : 30;
      const startDate = getDateRange(dateRange);
      const today = startOfDay(new Date());

      const { data: conversations } = await supabase
        .from('conversations')
        .select('created_at, closed_at, status')
        .gte('created_at', startDate.toISOString());

      const dayMap = new Map<string, { conversations: number; closed: number }>();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { conversations: 0, closed: 0 });
      }

      conversations?.forEach((conv) => {
        const date = new Date(conv.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.conversations++;
          if (conv.status === 'closed') {
            current.closed++;
          }
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        conversations: data.conversations,
        closed: data.closed,
      }));
    },
  });
}

export function useAdminConversationsByOwner(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-conversations-by-owner', dateRange],
    queryFn: async (): Promise<OwnerDistribution[]> => {
      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('owner')
        .gte('created_at', startDate.toISOString());

      const ownerMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        const label = conv.owner === 'ai' ? 'IA' : 'Humano';
        ownerMap.set(label, (ownerMap.get(label) || 0) + 1);
      });

      return Array.from(ownerMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

export function useAdminConversationsByIntent(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-conversations-by-intent', dateRange],
    queryFn: async (): Promise<IntentDistribution[]> => {
      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('main_intent')
        .gte('created_at', startDate.toISOString())
        .not('main_intent', 'is', null);

      const intentMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.main_intent) {
          intentMap.set(conv.main_intent, (intentMap.get(conv.main_intent) || 0) + 1);
        }
      });

      return Array.from(intentMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

export function useAdminConversationsByResult(dateRange: DateRange) {
  return useQuery({
    queryKey: ['admin-conversations-by-result', dateRange],
    queryFn: async (): Promise<ResultDistribution[]> => {
      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('result')
        .gte('created_at', startDate.toISOString())
        .not('result', 'is', null);

      const resultMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.result) {
          const label = conv.result === 'resolved' ? 'Resolvido' 
            : conv.result === 'unresolved' ? 'Não Resolvido' 
            : conv.result === 'follow-up' ? 'Follow-up' 
            : conv.result;
          resultMap.set(label, (resultMap.get(label) || 0) + 1);
        }
      });

      return Array.from(resultMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

// ============= FILTERED ADMIN HOOKS =============

export function useFilteredConversationStats(empresaId: string | null, dateRange: DateRangeFilter) {
  return useQuery({
    queryKey: ['filtered-conversation-stats', empresaId, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async (): Promise<ConversationStats> => {
      const { start, end } = getDateRangeFromFilter(dateRange);

      let query = supabase
        .from('conversations')
        .select('id, status, owner, created_at, closed_at, result')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: conversations } = await query;

      const total = conversations?.length || 0;
      const closed = conversations?.filter(c => c.status === 'closed').length || 0;
      const active = total - closed;
      
      const resolved = conversations?.filter(c => c.result === 'resolved').length || 0;
      const resolvedPercentage = total > 0 ? (resolved / total) * 100 : 0;

      const aiOwned = conversations?.filter(c => c.owner === 'ai').length || 0;
      const humanOwned = conversations?.filter(c => c.owner === 'human').length || 0;
      const aiPercentage = total > 0 ? (aiOwned / total) * 100 : 0;
      const humanPercentage = total > 0 ? (humanOwned / total) * 100 : 0;

      const closedConvos = conversations?.filter(c => c.closed_at) || [];
      let totalMinutes = 0;
      closedConvos.forEach(c => {
        if (c.closed_at && c.created_at) {
          totalMinutes += differenceInMinutes(new Date(c.closed_at), new Date(c.created_at));
        }
      });
      const avgResponseTimeMinutes = closedConvos.length > 0 
        ? Math.round(totalMinutes / closedConvos.length) 
        : 0;

      return {
        totalConversations: total,
        resolvedPercentage: Math.round(resolvedPercentage * 10) / 10,
        aiPercentage: Math.round(aiPercentage * 10) / 10,
        humanPercentage: Math.round(humanPercentage * 10) / 10,
        avgResponseTimeMinutes,
        closedCount: closed,
        activeCount: active,
      };
    },
  });
}

export function useFilteredConversationsOverTime(empresaId: string | null, dateRange: DateRangeFilter) {
  return useQuery({
    queryKey: ['filtered-conversations-over-time', empresaId, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async (): Promise<ConversationChartDataPoint[]> => {
      const { start, end } = getDateRangeFromFilter(dateRange);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      let query = supabase
        .from('conversations')
        .select('created_at, closed_at, status')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: conversations } = await query;

      const dayMap = new Map<string, { conversations: number; closed: number }>();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(end, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { conversations: 0, closed: 0 });
      }

      conversations?.forEach((conv) => {
        const date = new Date(conv.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.conversations++;
          if (conv.status === 'closed') {
            current.closed++;
          }
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        conversations: data.conversations,
        closed: data.closed,
      }));
    },
  });
}

export function useFilteredConversationsByOwner(empresaId: string | null, dateRange: DateRangeFilter) {
  return useQuery({
    queryKey: ['filtered-conversations-by-owner', empresaId, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async (): Promise<OwnerDistribution[]> => {
      const { start, end } = getDateRangeFromFilter(dateRange);

      let query = supabase
        .from('conversations')
        .select('owner')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: conversations } = await query;

      const ownerMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        const label = conv.owner === 'ai' ? 'IA' : 'Humano';
        ownerMap.set(label, (ownerMap.get(label) || 0) + 1);
      });

      return Array.from(ownerMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

export function useFilteredConversationsByIntent(empresaId: string | null, dateRange: DateRangeFilter) {
  return useQuery({
    queryKey: ['filtered-conversations-by-intent', empresaId, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async (): Promise<IntentDistribution[]> => {
      const { start, end } = getDateRangeFromFilter(dateRange);

      let query = supabase
        .from('conversations')
        .select('main_intent')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .not('main_intent', 'is', null);

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: conversations } = await query;

      const intentMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.main_intent) {
          intentMap.set(conv.main_intent, (intentMap.get(conv.main_intent) || 0) + 1);
        }
      });

      return Array.from(intentMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

export function useFilteredConversationsByResult(empresaId: string | null, dateRange: DateRangeFilter) {
  return useQuery({
    queryKey: ['filtered-conversations-by-result', empresaId, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async (): Promise<ResultDistribution[]> => {
      const { start, end } = getDateRangeFromFilter(dateRange);

      let query = supabase
        .from('conversations')
        .select('result')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .not('result', 'is', null);

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: conversations } = await query;

      const resultMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.result) {
          const label = conv.result === 'resolved' ? 'Resolvido' 
            : conv.result === 'unresolved' ? 'Não Resolvido' 
            : conv.result === 'follow-up' ? 'Follow-up' 
            : conv.result;
          resultMap.set(label, (resultMap.get(label) || 0) + 1);
        }
      });

      return Array.from(resultMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

// ============= CLIENT HOOKS =============

export function useClienteConversationStats(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-conversation-stats', empresaId, dateRange],
    queryFn: async (): Promise<ConversationStats> => {
      if (!empresaId) {
        return {
          totalConversations: 0,
          resolvedPercentage: 0,
          aiPercentage: 0,
          humanPercentage: 0,
          avgResponseTimeMinutes: 0,
          closedCount: 0,
          activeCount: 0,
        };
      }

      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, status, owner, created_at, closed_at, result')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString());

      const total = conversations?.length || 0;
      const closed = conversations?.filter(c => c.status === 'closed').length || 0;
      const active = total - closed;
      
      const resolved = conversations?.filter(c => c.result === 'resolved').length || 0;
      const resolvedPercentage = total > 0 ? (resolved / total) * 100 : 0;

      const aiOwned = conversations?.filter(c => c.owner === 'ai').length || 0;
      const humanOwned = conversations?.filter(c => c.owner === 'human').length || 0;
      const aiPercentage = total > 0 ? (aiOwned / total) * 100 : 0;
      const humanPercentage = total > 0 ? (humanOwned / total) * 100 : 0;

      const closedConvos = conversations?.filter(c => c.closed_at) || [];
      let totalMinutes = 0;
      closedConvos.forEach(c => {
        if (c.closed_at && c.created_at) {
          totalMinutes += differenceInMinutes(new Date(c.closed_at), new Date(c.created_at));
        }
      });
      const avgResponseTimeMinutes = closedConvos.length > 0 
        ? Math.round(totalMinutes / closedConvos.length) 
        : 0;

      return {
        totalConversations: total,
        resolvedPercentage: Math.round(resolvedPercentage * 10) / 10,
        aiPercentage: Math.round(aiPercentage * 10) / 10,
        humanPercentage: Math.round(humanPercentage * 10) / 10,
        avgResponseTimeMinutes,
        closedCount: closed,
        activeCount: active,
      };
    },
    enabled: !!empresaId,
  });
}

export function useClienteConversationsOverTime(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-conversations-over-time', empresaId, dateRange],
    queryFn: async (): Promise<ConversationChartDataPoint[]> => {
      if (!empresaId) return [];

      const days = dateRange === '7d' ? 7 : 30;
      const startDate = getDateRange(dateRange);
      const today = startOfDay(new Date());

      const { data: conversations } = await supabase
        .from('conversations')
        .select('created_at, closed_at, status')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString());

      const dayMap = new Map<string, { conversations: number; closed: number }>();

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        dayMap.set(dayKey, { conversations: 0, closed: 0 });
      }

      conversations?.forEach((conv) => {
        const date = new Date(conv.created_at);
        const dayKey = format(date, 'dd/MM', { locale: pt });
        const current = dayMap.get(dayKey);
        if (current) {
          current.conversations++;
          if (conv.status === 'closed') {
            current.closed++;
          }
        }
      });

      return Array.from(dayMap.entries()).map(([name, data]) => ({
        name,
        conversations: data.conversations,
        closed: data.closed,
      }));
    },
    enabled: !!empresaId,
  });
}

export function useClienteConversationsByOwner(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-conversations-by-owner', empresaId, dateRange],
    queryFn: async (): Promise<OwnerDistribution[]> => {
      if (!empresaId) return [];

      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('owner')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString());

      const ownerMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        const label = conv.owner === 'ai' ? 'IA' : 'Humano';
        ownerMap.set(label, (ownerMap.get(label) || 0) + 1);
      });

      return Array.from(ownerMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    enabled: !!empresaId,
  });
}

export function useClienteConversationsByIntent(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-conversations-by-intent', empresaId, dateRange],
    queryFn: async (): Promise<IntentDistribution[]> => {
      if (!empresaId) return [];

      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('main_intent')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString())
        .not('main_intent', 'is', null);

      const intentMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.main_intent) {
          intentMap.set(conv.main_intent, (intentMap.get(conv.main_intent) || 0) + 1);
        }
      });

      return Array.from(intentMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    enabled: !!empresaId,
  });
}

export function useClienteConversationsByResult(dateRange: DateRange) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  return useQuery({
    queryKey: ['cliente-conversations-by-result', empresaId, dateRange],
    queryFn: async (): Promise<ResultDistribution[]> => {
      if (!empresaId) return [];

      const startDate = getDateRange(dateRange);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('result')
        .eq('empresa_id', empresaId)
        .gte('created_at', startDate.toISOString())
        .not('result', 'is', null);

      const resultMap = new Map<string, number>();

      conversations?.forEach((conv) => {
        if (conv.result) {
          const label = conv.result === 'resolved' ? 'Resolvido' 
            : conv.result === 'unresolved' ? 'Não Resolvido' 
            : conv.result === 'follow-up' ? 'Follow-up' 
            : conv.result;
          resultMap.set(label, (resultMap.get(label) || 0) + 1);
        }
      });

      return Array.from(resultMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    },
    enabled: !!empresaId,
  });
}
