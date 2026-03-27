import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Plus, BookOpen, Info } from 'lucide-react';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';
import { KnowledgeFormDialog } from '@/components/knowledge/KnowledgeFormDialog';
import {
  useAllKnowledgeBase,
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
  KnowledgeItem,
  KnowledgeFormData,
} from '@/hooks/useKnowledgeBase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function KnowledgeBasePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: knowledge = [], isLoading } = useAllKnowledgeBase();
  const createMutation = useCreateKnowledge();
  const updateMutation = useUpdateKnowledge();
  const deleteMutation = useDeleteKnowledge();

  const handleOpenCreate = () => {
    setSelectedItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: KnowledgeItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const handleSubmit = (data: KnowledgeFormData) => {
    if (selectedItem) {
      updateMutation.mutate(
        { id: selectedItem.id, data },
        {
          onSuccess: () => setDialogOpen(false),
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedItem(null);
    }
  };

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
              <p className="text-sm text-muted-foreground">
                Gerir informação para enriquecer as respostas dos agentes
              </p>
            </div>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Conhecimento
          </Button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
          <Info className="w-5 h-5 text-primary mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Sobre a Base de Conhecimento
            </p>
            <p className="text-sm text-muted-foreground">
              Este módulo permite adicionar informação factual que os agentes podem utilizar para responder com maior precisão.
              O conhecimento aqui definido <strong>não substitui</strong> o comportamento base do agente (system prompt),
              mas complementa-o com dados específicos do negócio.
            </p>
          </div>
        </div>

        {/* Table */}
        <KnowledgeTable
          knowledge={knowledge}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleOpenCreate}
        />

        {/* Form Dialog */}
        <KnowledgeFormDialog
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          onSubmit={handleSubmit}
          selectedItem={selectedItem}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar Conhecimento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem a certeza que deseja eliminar este conhecimento? Esta ação não pode ser revertida.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
