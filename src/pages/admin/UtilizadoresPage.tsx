import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { UtilizadoresTable } from '@/components/utilizadores/UtilizadoresTable';
import { UtilizadorFormDialog } from '@/components/utilizadores/UtilizadorFormDialog';
import { UtilizadorEditDialog } from '@/components/utilizadores/UtilizadorEditDialog';
import { UtilizadoresFilters } from '@/components/utilizadores/UtilizadoresFilters';
import {
  useUtilizadores,
  useCreateUtilizador,
  useUpdateUtilizador,
  CreateUtilizadorData,
  UpdateUtilizadorData,
  Utilizador,
} from '@/hooks/useUtilizadores';
import { useEmpresas } from '@/hooks/useEmpresas';

export default function UtilizadoresPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUtilizador, setEditingUtilizador] = useState<Utilizador | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');

  const { data: empresas = [] } = useEmpresas();
  const { data: utilizadores = [], isLoading } = useUtilizadores(
    empresaFilter !== 'all' ? empresaFilter : undefined
  );
  const createMutation = useCreateUtilizador();
  const updateMutation = useUpdateUtilizador();

  // Filter utilizadores by search term
  const filteredUtilizadores = useMemo(() => {
    if (!searchTerm) return utilizadores;
    
    const term = searchTerm.toLowerCase();
    return utilizadores.filter(
      (u) =>
        u.nome.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
    );
  }, [utilizadores, searchTerm]);

  const handleCreate = (data: CreateUtilizadorData) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setCreateDialogOpen(false);
      },
    });
  };

  const handleEdit = (utilizador: Utilizador) => {
    setEditingUtilizador(utilizador);
    setEditDialogOpen(true);
  };

  const handleUpdate = (data: UpdateUtilizadorData) => {
    updateMutation.mutate(data, {
      onSuccess: () => {
        setEditDialogOpen(false);
        setEditingUtilizador(null);
      },
    });
  };

  // Count users per empresa
  const userCountByEmpresa = useMemo(() => {
    const counts = new Map<string, number>();
    utilizadores.forEach((u) => {
      if (u.empresa_id) {
        counts.set(u.empresa_id, (counts.get(u.empresa_id) || 0) + 1);
      }
    });
    return counts;
  }, [utilizadores]);

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Utilizadores</h1>
            <p className="text-muted-foreground">
              Gestão de utilizadores e permissões
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Utilizador
          </Button>
        </div>

        <UtilizadoresFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          empresaFilter={empresaFilter}
          onEmpresaFilterChange={setEmpresaFilter}
          empresas={empresas}
        />

        {empresaFilter !== 'all' && userCountByEmpresa.get(empresaFilter) !== undefined && (
          <div className="text-sm text-muted-foreground">
            {userCountByEmpresa.get(empresaFilter)} utilizador(es) nesta empresa
          </div>
        )}

        <UtilizadoresTable
          utilizadores={filteredUtilizadores}
          isLoading={isLoading}
          onEdit={handleEdit}
        />

        <UtilizadorFormDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          empresas={empresas}
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
        />

        <UtilizadorEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          utilizador={editingUtilizador}
          onSubmit={handleUpdate}
          isLoading={updateMutation.isPending}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
