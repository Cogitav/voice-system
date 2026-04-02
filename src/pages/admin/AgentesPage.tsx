import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { AgentesTable } from '@/components/agentes/AgentesTable';
import { AgenteFormDialog } from '@/components/agentes/AgenteFormDialog';
import {
  useAgentes,
  useCreateAgente,
  useUpdateAgente,
  Agente,
  AgenteFormData,
} from '@/hooks/useAgentes';

export default function AgentesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAgente, setSelectedAgente] = useState<Agente | null>(null);

  const { data: agentes = [], isLoading } = useAgentes();
  const createMutation = useCreateAgente();
  const updateMutation = useUpdateAgente();

  const handleOpenCreate = () => {
    setSelectedAgente(null);
    setDialogOpen(true);
  };

  const handleEdit = (agente: Agente) => {
    setSelectedAgente(agente);
    setDialogOpen(true);
  };

  const handleToggleStatus = (agente: Agente) => {
    const newStatus = agente.status === 'ativo' ? 'inativo' : 'ativo';
    updateMutation.mutate({
      id: agente.id,
      data: { ...agente, status: newStatus },
    });
  };

  const handleSubmit = (data: AgenteFormData) => {
    if (selectedAgente) {
      updateMutation.mutate(
        { id: selectedAgente.id, data },
        {
          onSuccess: () => {
            setDialogOpen(false);
            setSelectedAgente(null);
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          setDialogOpen(false);
        },
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedAgente(null);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agentes</h1>
            <p className="text-muted-foreground">
              Gestão de agentes de voz da plataforma
            </p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Agente
          </Button>
        </div>

        <AgentesTable
          agentes={agentes}
          isLoading={isLoading}
          onEdit={handleEdit}
          onToggleStatus={handleToggleStatus}
          onAdd={handleOpenCreate}
        />

        <AgenteFormDialog
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          agente={selectedAgente}
          onSubmit={handleSubmit}
          isLoading={isMutating}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
