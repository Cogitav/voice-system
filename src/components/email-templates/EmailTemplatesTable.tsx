import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Copy, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { useState } from 'react';
import {
  EmailTemplate,
  INTENT_OPTIONS,
  useDeleteEmailTemplate,
  useToggleEmailTemplate,
} from '@/hooks/useEmailTemplates';
import { useDuplicateEmailTemplate } from '@/hooks/useDuplicateEmailTemplate';

interface EmailTemplatesTableProps {
  templates: EmailTemplate[];
  isLoading: boolean;
  onEdit: (template: EmailTemplate) => void;
  showEmpresa?: boolean;
}

export function EmailTemplatesTable({
  templates,
  isLoading,
  onEdit,
  showEmpresa = true,
}: EmailTemplatesTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteTemplate = useDeleteEmailTemplate();
  const toggleTemplate = useToggleEmailTemplate();
  const duplicateTemplate = useDuplicateEmailTemplate();

  const getIntentLabel = (intent: string) => {
    return INTENT_OPTIONS.find((o) => o.value === intent)?.label || intent;
  };

  const getRecipientLabel = (recipientType: string) => {
    switch (recipientType) {
      case 'company':
        return 'Empresa';
      case 'internal':
        return 'Interno';
      default:
        return 'Cliente';
    }
  };

  const getRecipientVariant = (recipientType: string): 'default' | 'secondary' | 'outline' => {
    switch (recipientType) {
      case 'company':
        return 'secondary';
      case 'internal':
        return 'outline';
      default:
        return 'default';
    }
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    toggleTemplate.mutate({ id, is_active: !currentStatus });
  };

  const handleDuplicate = (template: EmailTemplate) => {
    duplicateTemplate.mutate(template);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteTemplate.mutate(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        A carregar templates...
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Não existem templates configurados para esta empresa.
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {showEmpresa && <TableHead>Empresa</TableHead>}
              <TableHead>Categoria</TableHead>
              <TableHead>Destinatário</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                {showEmpresa && (
                  <TableCell className="font-medium">
                    {template.empresa_nome}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="outline">{getIntentLabel(template.intent)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getRecipientVariant(template.recipient_type)}>
                    {getRecipientLabel(template.recipient_type)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[300px] truncate">
                  {template.subject}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={template.is_active}
                      onCheckedChange={() =>
                        handleToggle(template.id, template.is_active)
                      }
                      disabled={toggleTemplate.isPending}
                    />
                    <span className="text-sm text-muted-foreground">
                      {template.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(template)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(template.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. O template será
              permanentemente eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
