import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Calendar, Clock, Building2, Bot, Phone, User, MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Agendamento, useUpdateAgendamento, useDeleteAgendamento } from '@/hooks/useAgendamentos';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { toast } from 'sonner';

interface AgendamentosTableProps {
  agendamentos: Agendamento[];
  isLoading: boolean;
  showEmpresa?: boolean;
  onEdit?: (agendamento: Agendamento) => void;
}

export function AgendamentosTable({ 
  agendamentos, 
  isLoading,
  showEmpresa = true,
  onEdit,
}: AgendamentosTableProps) {
  const { isAdmin } = useAuth();
  const updateAgendamento = useUpdateAgendamento();
  const deleteAgendamento = useDeleteAgendamento();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'confirmado':
        return <Badge className="bg-green-600 hover:bg-green-700">Confirmado</Badge>;
      case 'pendente':
        return <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white">Pendente</Badge>;
      case 'cancelado':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'concluido':
        return <Badge variant="secondary">Concluído</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const handleConfirm = (id: string) => {
    updateAgendamento.mutate(
      { id, data: { estado: 'confirmado' } },
      {
        onSuccess: () => toast.success('Agendamento confirmado!'),
      }
    );
  };

  const handleCancel = (id: string) => {
    updateAgendamento.mutate(
      { id, data: { estado: 'cancelado' } },
      {
        onSuccess: () => toast.success('Agendamento cancelado!'),
      }
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteAgendamento.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              {showEmpresa && <TableHead>Empresa</TableHead>}
              <TableHead>Cliente</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Estado</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                {showEmpresa && <TableCell><Skeleton className="h-4 w-32" /></TableCell>}
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                {isAdmin && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (agendamentos.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center">
        <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Sem agendamentos</h3>
        <p className="text-muted-foreground">
          Não existem agendamentos registados.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Data
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Hora
                </div>
              </TableHead>
              {showEmpresa && (
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    Empresa
                  </div>
                </TableHead>
              )}
              <TableHead>
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  Cliente
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  <Bot className="h-4 w-4" />
                  Agente
                </div>
              </TableHead>
              <TableHead>Estado</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {agendamentos.map((agendamento) => (
              <TableRow key={agendamento.id}>
                <TableCell className="font-medium">
                  {format(new Date(agendamento.data), "dd MMM yyyy", { locale: pt })}
                </TableCell>
                <TableCell>{agendamento.hora.substring(0, 5)}</TableCell>
                {showEmpresa && (
                  <TableCell>{agendamento.empresa_nome}</TableCell>
                )}
                <TableCell>
                  <div className="flex flex-col">
                    {agendamento.cliente_nome && (
                      <span className="text-sm">{agendamento.cliente_nome}</span>
                    )}
                    {agendamento.cliente_telefone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {agendamento.cliente_telefone}
                      </span>
                    )}
                    {!agendamento.cliente_nome && !agendamento.cliente_telefone && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {agendamento.agente_nome || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{getEstadoBadge(agendamento.estado)}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {agendamento.estado === 'pendente' && (
                          <>
                            <DropdownMenuItem onClick={() => handleConfirm(agendamento.id)}>
                              <Check className="mr-2 h-4 w-4 text-green-600" />
                              Confirmar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCancel(agendamento.id)}>
                              <X className="mr-2 h-4 w-4 text-red-600" />
                              Cancelar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem onClick={() => onEdit?.(agendamento)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(agendamento.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. O agendamento será permanentemente eliminado.
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
