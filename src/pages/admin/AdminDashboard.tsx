import { AppShell } from '@/components/layout/AppShell';
import { PageLayout } from '@/components/layout/PageLayout';
import { Section } from '@/components/layout/Section';
import { StatGrid } from '@/components/layout/StatGrid';
import { StatCard } from '@/components/dashboard/StatCard';
import { CallsChart } from '@/components/dashboard/CallsChart';
import { RecentCallsTable } from '@/components/dashboard/RecentCallsTable';
import { IntentionsChart } from '@/components/dashboard/IntentionsChart';
import { AdminCreditsAlertsBanner } from '@/components/credits/AdminCreditsAlertsBanner';
import { Building2, Phone, Bot, Users, AlertTriangle, TrendingUp } from 'lucide-react';
import { useAdminStats, useWeeklyCallsChart, useIntentionsChart, useRecentCalls } from '@/hooks/useAdminDashboard';

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: chartData, isLoading: chartLoading } = useWeeklyCallsChart();
  const { data: intentionsData, isLoading: intentionsLoading } = useIntentionsChart();
  const { data: recentCalls, isLoading: callsLoading } = useRecentCalls(10);

  return (
    <AppShell>
      <PageLayout>
        <Section spacing="lg">
          <AdminCreditsAlertsBanner />
          
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Dashboard Administrativo
            </h1>
            <p className="text-sm text-muted-foreground">
              Visão global da plataforma e métricas agregadas
            </p>
          </div>

          <StatGrid>
            <StatCard title="Empresas Ativas" value={statsLoading ? '-' : stats?.empresasAtivas ?? 0} icon={Building2} variant="primary" />
            <StatCard title="Total Chamadas" value={statsLoading ? '-' : stats?.totalChamadas.toLocaleString() ?? 0} subtitle="Total registado" icon={Phone} />
            <StatCard title="Agentes Ativos" value={statsLoading ? '-' : stats?.agentesAtivos ?? 0} icon={Bot} variant="success" />
            <StatCard title="Utilizadores" value={statsLoading ? '-' : stats?.totalUtilizadores ?? 0} icon={Users} />
            <StatCard title="Erros/Falhas" value={statsLoading ? '-' : stats?.errosFalhas ?? 0} subtitle="Últimas 24h" icon={AlertTriangle} variant="warning" />
            <StatCard title="Taxa de Sucesso" value={statsLoading ? '-' : `${stats?.taxaSucesso ?? 0}%`} icon={TrendingUp} variant="success" />
          </StatGrid>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CallsChart data={chartData || []} title="Volume de Chamadas (Última Semana)" isLoading={chartLoading} />
            </div>
            <IntentionsChart data={intentionsData || []} isLoading={intentionsLoading} />
          </div>

          <RecentCallsTable calls={recentCalls || []} isLoading={callsLoading} />
        </Section>
      </PageLayout>
    </AppShell>
  );
}
