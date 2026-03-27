import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { StatCard } from '@/components/dashboard/StatCard';
import { CallsChart } from '@/components/dashboard/CallsChart';
import { RecentCallsTable } from '@/components/dashboard/RecentCallsTable';
import { IntentionsChart } from '@/components/dashboard/IntentionsChart';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useClienteStats, 
  useClienteWeeklyChart, 
  useClienteIntentionsChart, 
  useClienteRecentCalls 
} from '@/hooks/useClienteDashboard';
import { Phone, Bot, Calendar, Clock, TrendingUp, PhoneIncoming, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ClienteDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const { data: stats, isLoading: statsLoading } = useClienteStats();
  const { data: chartData, isLoading: chartLoading } = useClienteWeeklyChart();
  const { data: intentionsData, isLoading: intentionsLoading } = useClienteIntentionsChart();
  const { data: recentCalls, isLoading: callsLoading } = useClienteRecentCalls(10);

  const displayName = profile?.nome?.split(' ')[0] || 'Utilizador';

  // Check if there's any real data to display
  const hasCallData = (stats?.totalChamadas ?? 0) > 0;
  const hasChartData = chartData?.some(d => d.chamadas > 0) ?? false;
  const hasIntentionsData = (intentionsData?.length ?? 0) > 0;
  const hasRecentCalls = (recentCalls?.length ?? 0) > 0;

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Olá, {displayName} 👋
          </h1>
          <p className="text-muted-foreground">
            Acompanhe as chamadas e o desempenho dos seus agentes
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <StatCard
            title="Total Chamadas"
            value={stats?.totalChamadas ?? 0}
            subtitle="Este mês"
            icon={Phone}
            variant="primary"
            isLoading={statsLoading}
          />
          <StatCard
            title="Chamadas Hoje"
            value={stats?.chamadasHoje ?? 0}
            icon={PhoneIncoming}
            variant={hasCallData ? "success" : "default"}
            isLoading={statsLoading}
          />
          <StatCard
            title="Agentes Ativos"
            value={stats?.agentesAtivos ?? 0}
            icon={Bot}
            isLoading={statsLoading}
          />
          <StatCard
            title="Agendamentos"
            value={stats?.agendamentosPendentes ?? 0}
            subtitle="Pendentes"
            icon={Calendar}
            variant={stats?.agendamentosPendentes ? "warning" : "default"}
            isLoading={statsLoading}
          />
          <StatCard
            title="Duração Média"
            value={hasCallData ? (stats?.duracaoMedia ?? '0:00') : '-'}
            icon={Clock}
            isLoading={statsLoading}
          />
          <StatCard
            title="Taxa de Sucesso"
            value={hasCallData ? `${stats?.taxaSucesso ?? 0}%` : '-'}
            icon={TrendingUp}
            variant={hasCallData ? "success" : "default"}
            isLoading={statsLoading}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {!chartLoading && !hasChartData ? (
              <div className="glass-card rounded-xl p-6">
                <EmptyState
                  icon={BarChart3}
                  title="Sem chamadas registadas"
                  description="As estatísticas de chamadas aparecerão aqui quando começar a receber chamadas."
                  variant="compact"
                />
              </div>
            ) : (
              <CallsChart 
                data={chartData || []} 
                title="Suas Chamadas (Última Semana)" 
                isLoading={chartLoading}
              />
            )}
          </div>
          {!intentionsLoading && !hasIntentionsData ? (
            <div className="glass-card rounded-xl p-6">
              <EmptyState
                icon={TrendingUp}
                title="Sem intenções detetadas"
                description="As intenções das chamadas serão exibidas aqui."
                variant="compact"
              />
            </div>
          ) : (
            <IntentionsChart 
              data={intentionsData || []} 
              isLoading={intentionsLoading}
            />
          )}
        </div>

        {/* Recent Calls Table */}
        {!callsLoading && !hasRecentCalls ? (
          <div className="glass-card rounded-xl p-6">
            <EmptyState
              icon={Phone}
              title="Nenhuma chamada recente"
              description="As chamadas dos seus agentes aparecerão aqui quando começarem a ser recebidas."
            />
          </div>
        ) : (
          <RecentCallsTable 
            calls={recentCalls || []} 
            showAgente={true} 
            isLoading={callsLoading}
          />
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div 
            className="glass-card rounded-xl p-6 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigate('/cliente/agentes')}
          >
            <Bot className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-medium text-foreground mb-1">Gerir Agentes</h3>
            <p className="text-sm text-muted-foreground">
              Configure e personalize os seus agentes de IA
            </p>
          </div>
          <div 
            className="glass-card rounded-xl p-6 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigate('/cliente/agendamentos')}
          >
            <Calendar className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-medium text-foreground mb-1">Ver Agendamentos</h3>
            <p className="text-sm text-muted-foreground">
              Consulte e gerencie os agendamentos criados
            </p>
          </div>
          <div 
            className="glass-card rounded-xl p-6 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigate('/cliente/relatorios')}
          >
            <TrendingUp className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-medium text-foreground mb-1">Relatórios</h3>
            <p className="text-sm text-muted-foreground">
              Analise métricas detalhadas e exportar dados
            </p>
          </div>
        </div>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
