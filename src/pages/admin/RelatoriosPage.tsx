import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { RelatorioStatCard } from '@/components/relatorios/RelatorioStatCard';
import { CallsOverTimeChart } from '@/components/relatorios/CallsOverTimeChart';
import { CallsByAgentChart } from '@/components/relatorios/CallsByAgentChart';
import { CallsByIntentChart } from '@/components/relatorios/CallsByIntentChart';
import { ReportsFilters } from '@/components/relatorios/ReportsFilters';
import { useEmpresas } from '@/hooks/useEmpresas';
import {
  useAdminRelatorioStats,
  useAdminCallsOverTime,
  useAdminCallsByAgent,
  useAdminCallsByIntent,
  useFilteredAdminRelatorioStats,
  useFilteredAdminCallsOverTime,
  useFilteredAdminCallsByAgent,
  useFilteredAdminCallsByIntent,
} from '@/hooks/useRelatorios';
import { 
  Phone, 
  CheckCircle2, 
  Clock, 
  Calendar,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export default function RelatoriosPage() {
  const { data: empresas = [] } = useEmpresas();
  
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    // Default to last 7 days
    const today = new Date();
    return { from: subDays(today, 6), to: today };
  });
  const [datePreset, setDatePreset] = useState<'7d' | '30d' | 'custom' | null>('7d');

  // Prepare empresas list for filter
  const empresasList = useMemo(
    () => empresas.map((e) => ({ id: e.id, nome: e.nome })),
    [empresas]
  );

  // Use filtered hooks when filters are applied
  const { data: stats, isLoading: statsLoading } = useFilteredAdminRelatorioStats(
    dateRange?.from,
    dateRange?.to,
    selectedEmpresaId
  );
  const { data: callsOverTime, isLoading: callsOverTimeLoading } = useFilteredAdminCallsOverTime(
    dateRange?.from,
    dateRange?.to,
    selectedEmpresaId
  );
  const { data: callsByAgent, isLoading: callsByAgentLoading } = useFilteredAdminCallsByAgent(
    dateRange?.from,
    dateRange?.to,
    selectedEmpresaId
  );
  const { data: callsByIntent, isLoading: callsByIntentLoading } = useFilteredAdminCallsByIntent(
    dateRange?.from,
    dateRange?.to,
    selectedEmpresaId
  );

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
            <p className="text-muted-foreground mt-1">
              Análise global da plataforma
            </p>
          </div>
          
          {/* Filters */}
          <ReportsFilters
            empresas={empresasList}
            selectedEmpresaId={selectedEmpresaId}
            onEmpresaChange={setSelectedEmpresaId}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 min-w-0">
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
