import { Eye } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

        {/* Read-only mode notice — clients cannot create/edit/delete agents
            from this area. The AgentesTable below already enforces this via
            the `readOnly` prop; this banner makes the boundary explicit. */}
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertTitle>Agentes em modo consulta</AlertTitle>
          <AlertDescription>
            Esta área permite consultar os agentes associados à sua empresa.
            A criação e edição de agentes é gerida pela equipa da plataforma.
          </AlertDescription>
        </Alert>

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
