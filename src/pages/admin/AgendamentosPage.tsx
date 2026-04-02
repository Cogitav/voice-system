import { useState } from 'react';
import { Calendar, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { AgendamentosTable } from '@/components/agendamentos/AgendamentosTable';
import { AgendamentoFormDialog } from '@/components/agendamentos/AgendamentoFormDialog';
import { AgendamentosFilters } from '@/components/agendamentos/AgendamentosFilters';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgendamentos, Agendamento, AgendamentoFilters } from '@/hooks/useAgendamentos';

export default function AgendamentosPage() {
  const [filters, setFilters] = useState<AgendamentoFilters>({});
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: agendamentos = [], isLoading } = useAgendamentos(filters);

  const handleEdit = (agendamento: Agendamento) => {
    setEditingAgendamento(agendamento);
    setIsEditDialogOpen(true);
  };

  const handleEditDialogClose = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setEditingAgendamento(null);
    }
  };

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Agendamentos
            </h1>
            <p className="text-muted-foreground">
              Gestão de agendamentos de todas as empresas
            </p>
          </div>
          <AgendamentoFormDialog />
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Os agendamentos podem ser criados manualmente ou a partir de chamadas. 
            Integração com calendários externos (Calendly, Google Calendar) em breve.
          </AlertDescription>
        </Alert>

        <AgendamentosFilters filters={filters} onFiltersChange={setFilters} />

        <AgendamentosTable
          agendamentos={agendamentos}
          isLoading={isLoading}
          showEmpresa={true}
          onEdit={handleEdit}
        />

        {/* Edit Dialog */}
        <AgendamentoFormDialog
          agendamento={editingAgendamento}
          open={isEditDialogOpen}
          onOpenChange={handleEditDialogClose}
          trigger={<span />}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
