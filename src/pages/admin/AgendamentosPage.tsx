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
  dry_run?: boolean;
  results?: ReminderRunItem[];
};

type ReminderRunItem = {
  agendamento_id?: string;
  empresa_id?: string;
  outcome?: 'sent' | 'skipped' | 'failed' | string;
  reason?: string;
  detail?: string;
};

const REMINDER_REASON_LABELS: Record<string, string> = {
  already_sent: 'email ja enviado',
  dry_run: 'simulacao',
  flag_update_failed: 'enviado, mas estado nao atualizado',
  log_failed: 'falha ao registar email',
  missing_template: 'sem template ativo de lembrete/confirmacao',
  missing_customer_email: 'sem email do cliente',
  no_template: 'sem template ativo de lembrete/confirmacao',
  outside_window: 'fora da janela de lembrete',
  reminder_disabled: 'lembretes desativados',
  send_failed: 'falha no envio',
  template_lookup_failed: 'erro ao procurar template',
  unexpected_error: 'erro inesperado',
};

function getReminderReasonLabel(reason: string | undefined): string {
  if (!reason) return 'sem motivo indicado';
  return REMINDER_REASON_LABELS[reason] ?? reason;
}

function formatResultRef(item: ReminderRunItem): string {
  return item.agendamento_id ? `#${item.agendamento_id.slice(0, 8)}` : 'sem id';
}

function summarizeReminderIssues(results: ReminderRunItem[] | undefined): string | undefined {
  if (!Array.isArray(results) || results.length === 0) return undefined;

  const grouped = results
    .filter((item) => item.outcome === 'skipped' || item.outcome === 'failed')
    .reduce<Record<string, ReminderRunItem[]>>((acc, item) => {
      const label = getReminderReasonLabel(item.reason);
      acc[label] = [...(acc[label] ?? []), item];
      return acc;
    }, {});

  const entries = Object.entries(grouped);
  if (entries.length === 0) return undefined;

  return entries
    .map(([reason, items]) => {
      const refs = items.slice(0, 3).map(formatResultRef).join(', ');
      const suffix = items.length > 3 ? `, +${items.length - 3}` : '';
      return `${reason}: ${items.length} (${refs}${suffix})`;
    })
    .join(' | ');
}

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

      console.log('[BOOKING_REMINDERS_MANUAL_RESPONSE]', data);
      if (Array.isArray(data?.results) && data.results.length > 0) {
        console.table(data.results);
      }

      const issueSummary = summarizeReminderIssues(data?.results);
      toast.success(
        `Lembretes executados: processados ${data?.processed ?? 0}, enviados ${data?.sent ?? 0}, ignorados ${data?.skipped ?? 0}, falhados ${data?.failed ?? 0}.`,
        issueSummary ? { description: issueSummary } : undefined
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Agendamentos
            </h1>
            <p className="text-muted-foreground">
              Gestão de agendamentos de todas as empresas
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
