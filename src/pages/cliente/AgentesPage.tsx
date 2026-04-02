import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { AgentesTable } from '@/components/agentes/AgentesTable';
import { useAgentes } from '@/hooks/useAgentes';

export default function ClienteAgentesPage() {
  const { data: agentes = [], isLoading } = useAgentes();

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meus Agentes</h1>
          <p className="text-muted-foreground">
            Visualize os agentes configurados para a sua empresa
          </p>
        </div>

        <AgentesTable
          agentes={agentes}
          isLoading={isLoading}
          readOnly
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
