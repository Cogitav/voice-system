import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { RelatorioStatCard } from '@/components/relatorios/RelatorioStatCard';
import { CallsOverTimeChart } from '@/components/relatorios/CallsOverTimeChart';
import { CallsByAgentChart } from '@/components/relatorios/CallsByAgentChart';
import { CallsByIntentChart } from '@/components/relatorios/CallsByIntentChart';
import { DateRangeSelector } from '@/components/relatorios/DateRangeSelector';
import {
  useClienteRelatorioStats,
  useClienteCallsOverTime,
  useClienteCallsByAgent,
  useClienteCallsByIntent,
  DateRange,
} from '@/hooks/useRelatorios';
import { 
  Phone, 
  CheckCircle2, 
  Clock, 
  Calendar,
  TrendingUp,
  Percent,
} from 'lucide-react';

export default function RelatoriosPage() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  
  const { data: stats, isLoading: statsLoading } = useClienteRelatorioStats(dateRange);
  const { data: callsOverTime, isLoading: callsOverTimeLoading } = useClienteCallsOverTime(dateRange);
  const { data: callsByAgent, isLoading: callsByAgentLoading } = useClienteCallsByAgent(dateRange);
  const { data: callsByIntent, isLoading: callsByIntentLoading } = useClienteCallsByIntent(dateRange);

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
            <p className="text-muted-foreground mt-1">
              Análise da sua empresa
            </p>
          </div>
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <RelatorioStatCard
            title="Total Chamadas"
            value={stats?.totalChamadas ?? 0}
            icon={Phone}
            variant="primary"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Chamadas Concluídas"
            value={stats?.chamadasConcluidas ?? 0}
            icon={CheckCircle2}
            variant="success"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Taxa de Sucesso"
            value={`${stats?.taxaSucesso ?? 0}%`}
            icon={TrendingUp}
            variant="primary"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Duração Média"
            value={stats?.duracaoMedia ?? '0:00'}
            icon={Clock}
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Total Agendamentos"
            value={stats?.totalAgendamentos ?? 0}
            icon={Calendar}
            variant="success"
            isLoading={statsLoading}
          />
          <RelatorioStatCard
            title="Taxa de Conversão"
            value={`${stats?.taxaConversao ?? 0}%`}
            subtitle="Chamadas → Agendamentos"
            icon={Percent}
            variant="warning"
            isLoading={statsLoading}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CallsOverTimeChart 
            data={callsOverTime || []} 
            isLoading={callsOverTimeLoading} 
          />
          <CallsByIntentChart 
            data={callsByIntent || []} 
            isLoading={callsByIntentLoading} 
          />
        </div>

        {/* Charts Row 2 */}
        <div>
          <CallsByAgentChart 
            data={callsByAgent || []} 
            isLoading={callsByAgentLoading} 
          />
        </div>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
