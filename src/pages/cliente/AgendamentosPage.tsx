import { useState } from 'react';
import { Calendar, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { AgendamentosTable } from '@/components/agendamentos/AgendamentosTable';
import { AgendamentosFilters } from '@/components/agendamentos/AgendamentosFilters';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgendamentos, AgendamentoFilters } from '@/hooks/useAgendamentos';
import { useAuth } from '@/contexts/AuthContext';

export default function ClienteAgendamentosPage() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id || null;

  const [filters, setFilters] = useState<AgendamentoFilters>({
    empresa_id: empresaId || undefined,
  });

  const { data: agendamentos = [], isLoading } = useAgendamentos({
    ...filters,
    empresa_id: empresaId || undefined,
  });

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Agendamentos
          </h1>
          <p className="text-muted-foreground">
            Visualização dos agendamentos da sua empresa
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Os agendamentos são criados pelo sistema ou pelos administradores.
            Contacte o suporte para alterações.
          </AlertDescription>
        </Alert>

        <AgendamentosFilters 
          filters={filters} 
          onFiltersChange={(newFilters) => setFilters({
            ...newFilters,
            empresa_id: empresaId || undefined,
          })} 
        />

        <AgendamentosTable
          agendamentos={agendamentos}
          isLoading={isLoading}
          showEmpresa={false}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
