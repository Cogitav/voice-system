import { useState } from 'react';
import { BellRing, Calendar, Info, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { AgendamentosTable } from '@/components/agendamentos/AgendamentosTable';
import { AgendamentoFormDialog } from '@/components/agendamentos/AgendamentoFormDialog';
import { AgendamentosFilters } from '@/components/agendamentos/AgendamentosFilters';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAgendamentos, Agendamento, AgendamentoFilters } from '@/hooks/useAgendamentos';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ReminderRunResult = {
  processed?: number;
  sent?: number;
  skipped?: number;
  failed?: number;
};

export default function AgendamentosPage() {
  const { isAdmin } = useAuth();
  const [filters, setFilters] = useState<AgendamentoFilters>({});
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRunningReminders, setIsRunningReminders] = useState(false);

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

  const handleRunReminders = async () => {
    setIsRunningReminders(true);

    try {
      const { data, error } = await supabase.functions.invoke<ReminderRunResult>('send-booking-reminders', {
        body: { dry_run: false },
      });

      if (error) {
        throw error;
      }

      toast.success(
        `Lembretes executados: processados ${data?.processed ?? 0}, enviados ${data?.sent ?? 0}, ignorados ${data?.skipped ?? 0}, falhados ${data?.failed ?? 0}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao executar lembretes.');
    } finally {
      setIsRunningReminders(false);
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
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRunReminders}
                disabled={isRunningReminders}
              >
                {isRunningReminders ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BellRing className="mr-2 h-4 w-4" />
                )}
                Executar lembretes agora
              </Button>
            )}
            <AgendamentoFormDialog />
          </div>
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
