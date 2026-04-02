import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { RelatorioStatCard } from '@/components/relatorios/RelatorioStatCard';
import { DateRangeSelector } from '@/components/relatorios/DateRangeSelector';
import { ConversationsOverTimeChart } from '@/components/conversation-reports/ConversationsOverTimeChart';
import { ConversationsByIntentChart } from '@/components/conversation-reports/ConversationsByIntentChart';
import { ConversationsByOwnerChart } from '@/components/conversation-reports/ConversationsByOwnerChart';
import { ConversationsByResultChart } from '@/components/conversation-reports/ConversationsByResultChart';
import {
  useClienteConversationStats,
  useClienteConversationsOverTime,
  useClienteConversationsByOwner,
  useClienteConversationsByIntent,
  useClienteConversationsByResult,
  DateRange,
} from '@/hooks/useConversationReports';
import { 
  MessageSquare, 
  CheckCircle2, 
  Bot, 
  User,
  Clock,
  Activity,
} from 'lucide-react';

export default function ConversationReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  
  const { data: stats, isLoading: statsLoading } = useClienteConversationStats(dateRange);
  const { data: conversationsOverTime, isLoading: overTimeLoading } = useClienteConversationsOverTime(dateRange);
  const { data: byOwner, isLoading: byOwnerLoading } = useClienteConversationsByOwner(dateRange);
  const { data: byIntent, isLoading: byIntentLoading } = useClienteConversationsByIntent(dateRange);
  const { data: byResult, isLoading: byResultLoading } = useClienteConversationsByResult(dateRange);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios de Conversas</h1>
            <p className="text-muted-foreground mt-1">
              Análise das conversas da sua empresa
            </p>
          </div>
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <RelatorioStatCard
            title="Total Conversas"
            value={stats?.totalConversations ?? 0}
            icon={MessageSquare}
            variant="primary"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Taxa Resolução"
            value={`${stats?.resolvedPercentage ?? 0}%`}
            icon={CheckCircle2}
            variant="success"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Geridas por IA"
            value={`${stats?.aiPercentage ?? 0}%`}
            icon={Bot}
            variant="primary"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Geridas por Humano"
            value={`${stats?.humanPercentage ?? 0}%`}
            icon={User}
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Tempo Médio"
            value={formatTime(stats?.avgResponseTimeMinutes ?? 0)}
            icon={Clock}
            variant="warning"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Ativas Agora"
            value={stats?.activeCount ?? 0}
            icon={Activity}
            variant="success"
            isLoading={statsLoading}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConversationsOverTimeChart 
            data={conversationsOverTime || []} 
            isLoading={overTimeLoading} 
          />
          <ConversationsByIntentChart 
            data={byIntent || []} 
            isLoading={byIntentLoading} 
          />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConversationsByOwnerChart 
            data={byOwner || []} 
            isLoading={byOwnerLoading} 
          />
          <ConversationsByResultChart 
            data={byResult || []} 
            isLoading={byResultLoading} 
          />
        </div>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
