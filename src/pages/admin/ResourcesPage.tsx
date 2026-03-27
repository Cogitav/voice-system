import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight, Users, DoorOpen, Wrench } from 'lucide-react';
import { useSchedulingResources, useDeleteSchedulingResource, useUpdateSchedulingResource, SchedulingResource } from '@/hooks/useSchedulingResources';
import { useAuth } from '@/contexts/AuthContext';
import { useEmpresas } from '@/hooks/useEmpresas';
import { ResourceSidePanel } from '@/components/resources/ResourceSidePanel';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  person: <Users className="h-4 w-4" />,
  room: <DoorOpen className="h-4 w-4" />,
  equipment: <Wrench className="h-4 w-4" />,
};

const TYPE_LABELS: Record<string, string> = {
  person: 'Pessoa',
  room: 'Sala',
  equipment: 'Equipamento',
};

export default function ResourcesPage() {
  const { profile, isAdmin } = useAuth();
  const { data: empresas = [] } = useEmpresas();

  // For admins with no empresa_id, allow selecting one; for clients, use their own
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const empresaId = isAdmin
    ? (profile?.empresa_id || selectedEmpresaId)
    : profile?.empresa_id;

  // Auto-select first empresa for admins without empresa_id
  useEffect(() => {
    if (isAdmin && !profile?.empresa_id && !selectedEmpresaId && empresas.length > 0) {
      setSelectedEmpresaId(empresas[0].id);
    }
  }, [isAdmin, profile?.empresa_id, selectedEmpresaId, empresas]);

  if (!empresaId) {
    console.error('[Resources] Missing empresa_id in profile');
  }

  const { data: resources = [], isLoading } = useSchedulingResources(empresaId || undefined);
  const deleteMutation = useDeleteSchedulingResource(empresaId || undefined);
  const updateMutation = useUpdateSchedulingResource(empresaId || undefined);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<SchedulingResource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchedulingResource | null>(null);

  const filtered = resources.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = () => {
    setEditingResource(null);
    setPanelOpen(true);
  };

  const handleEdit = (r: SchedulingResource) => {
    setEditingResource(r);
    setPanelOpen(true);
  };

  const handleToggleStatus = (r: SchedulingResource) => {
    updateMutation.mutate({
      id: r.id,
      data: { status: r.status === 'active' ? 'inactive' : 'active' },
    });
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Recursos</h1>
        <p className="text-sm text-muted-foreground">Gerir recursos de agendamento (profissionais, salas, equipamentos).</p>
      </div>

      {isAdmin && !profile?.empresa_id && (
        <div className="mb-4">
          <label className="text-sm font-medium mb-1.5 block">Empresa</label>
          <Select value={selectedEmpresaId || ''} onValueChange={setSelectedEmpresaId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecionar empresa..." />
            </SelectTrigger>
            <SelectContent>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar recurso..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="person">Pessoa</SelectItem>
            <SelectItem value="room">Sala</SelectItem>
            <SelectItem value="equipment">Equipamento</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleCreate} className="gap-2" disabled={!empresaId}>
          <Plus className="h-4 w-4" /> Novo Recurso
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cor</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-center">Prioridade</TableHead>
              <TableHead className="text-center">Capacidade</TableHead>
              <TableHead className="text-center">Duração (min)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">A carregar...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum recurso encontrado.</TableCell>
              </TableRow>
            ) : (
              filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: r.color || 'hsl(var(--primary))' }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {TYPE_ICONS[r.type]}
                      <span className="text-sm">{TYPE_LABELS[r.type] || r.type}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
                      {r.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{r.priority}</TableCell>
                  <TableCell className="text-center">{r.capacity}</TableCell>
                  <TableCell className="text-center">{r.default_appointment_duration_minutes}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(r)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(r)} title={r.status === 'active' ? 'Desativar' : 'Ativar'}>
                        {r.status === 'active' ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} title="Eliminar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {panelOpen && (
        <ResourceSidePanel
          resource={editingResource}
          empresaId={empresaId || ''}
          onClose={() => { setPanelOpen(false); setEditingResource(null); }}
        />
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Recurso"
        description={`Tem certeza que deseja eliminar "${deleteTarget?.name}"? Agendamentos existentes não serão afetados.`}
        onConfirm={handleDelete}
        confirmLabel="Eliminar"
        isDestructive
      />
      </PageContainer>
    </DashboardLayout>
  );
}
