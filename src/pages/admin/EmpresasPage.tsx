import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { EmpresasTable } from '@/components/empresas/EmpresasTable';
import { EmpresaFormDialog } from '@/components/empresas/EmpresaFormDialog';
import {
  useEmpresas,
  useCreateEmpresa,
  useUpdateEmpresa,
  Empresa,
  EmpresaFormData,
} from '@/hooks/useEmpresas';

export default function EmpresasPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);

  const { data: empresas = [], isLoading } = useEmpresas();
  const createMutation = useCreateEmpresa();
  const updateMutation = useUpdateEmpresa();

  const handleOpenCreate = () => {
    setSelectedEmpresa(null);
    setDialogOpen(true);
  };

  const handleEdit = (empresa: Empresa) => {
    setSelectedEmpresa(empresa);
    setDialogOpen(true);
  };

  const handleSubmit = (data: EmpresaFormData) => {
    if (selectedEmpresa) {
      updateMutation.mutate({ id: selectedEmpresa.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedEmpresa(null);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <PageContainer>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
              <p className="text-sm text-muted-foreground">
                Gestão de empresas registadas na plataforma
              </p>
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Empresa
            </Button>
          </div>

          <EmpresasTable empresas={empresas} isLoading={isLoading} onEdit={handleEdit} />

          <EmpresaFormDialog
            open={dialogOpen}
            onOpenChange={handleDialogChange}
            empresa={selectedEmpresa}
            onSubmit={handleSubmit}
            isLoading={isMutating}
          />
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
