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
import { 
  Edit, 
  Trash2, 
  Copy, 
  Mail, 
  Calendar, 
  FileText, 
  UserCheck,
  MoreHorizontal
} from 'lucide-react';
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
  FollowUpRule, 
  useUpdateFollowUpRule, 
  useDeleteFollowUpRule,
  FOLLOW_UP_INTENT_OPTIONS 
} from '@/hooks/useFollowUpRules';

interface FollowUpRulesTableProps {
  rules: FollowUpRule[];
  isLoading: boolean;
  onEdit: (rule: FollowUpRule) => void;
  onDuplicate: (rule: FollowUpRule) => void;
}

export function FollowUpRulesTable({
  rules,
  isLoading,
  onEdit,
  onDuplicate,
}: FollowUpRulesTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const updateRule = useUpdateFollowUpRule();
  const deleteRule = useDeleteFollowUpRule();

  const getIntentLabel = (intent: string) => {
    return FOLLOW_UP_INTENT_OPTIONS.find((o) => o.value === intent)?.label || intent;
  };

  const getActionTypes = (rule: FollowUpRule) => {
    const actions: { icon: React.ElementType; label: string; active: boolean }[] = [
      { icon: FileText, label: 'Registo', active: rule.register_only },
      { icon: Mail, label: 'Email Cliente', active: rule.send_email_client },
      { icon: Mail, label: 'Email Empresa', active: rule.send_email_company },
      { icon: Calendar, label: 'Agendamento', active: rule.create_appointment },
      { icon: UserCheck, label: 'Follow-up Manual', active: rule.mark_manual_followup },
    ];
    return actions.filter(a => a.active);
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    updateRule.mutate({ id, data: { is_active: !currentStatus } });
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteRule.mutate(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        A carregar regras...
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Nenhuma regra encontrada. Crie a primeira regra de follow-up.
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Intenção</TableHead>
              <TableHead>Ações Configuradas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => {
              const actions = getActionTypes(rule);
              
              return (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">
                    {rule.empresa_nome}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getIntentLabel(rule.intent)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {actions.length === 0 ? (
                        <span className="text-sm text-muted-foreground italic">
                          Nenhuma ação
                        </span>
                      ) : (
                        actions.map((action, idx) => {
                          const Icon = action.icon;
                          return (
                            <Badge 
                              key={idx} 
                              variant="secondary" 
                              className="gap-1 text-xs"
                            >
                              <Icon className="h-3 w-3" />
                              {action.label}
                            </Badge>
                          );
                        })
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggle(rule.id, rule.is_active)}
                        disabled={updateRule.isPending}
                      />
                      <span className="text-sm text-muted-foreground">
                        {rule.is_active ? 'Ativo' : 'Inativo'}
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
                        <DropdownMenuItem onClick={() => onEdit(rule)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(rule)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => setDeleteId(rule.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja eliminar esta regra de follow-up?
              Esta ação não pode ser desfeita.
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
