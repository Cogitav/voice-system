import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Users, Mail, Loader2, Pencil } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Utilizador } from '@/hooks/useUtilizadores';
import { useAdminResetPassword } from '@/hooks/useAdminResetPassword';
import { useAuth } from '@/contexts/AuthContext';

interface UtilizadoresTableProps {
  utilizadores: Utilizador[];
  isLoading: boolean;
  onEdit?: (utilizador: Utilizador) => void;
}

function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Nenhum utilizador encontrado</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Ainda não existem utilizadores registados. Clique em "Novo Utilizador" para adicionar o primeiro.
      </p>
    </div>
  );
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return <Badge variant="default">Admin</Badge>;
    case 'cliente_coordenador':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Coordenador</Badge>;
    case 'cliente_normal':
      return <Badge variant="outline">Utilizador</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ativo':
      return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Ativo</Badge>;
    case 'suspenso':
    case 'inativo':
      return <Badge variant="destructive">Suspenso</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function UtilizadoresTable({
  utilizadores,
  isLoading,
  onEdit,
}: UtilizadoresTableProps) {
  const { sendResetPassword, loadingEmail } = useAdminResetPassword();
  const { isAdmin } = useAuth();

  if (!isLoading && utilizadores.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            {isAdmin && <TableHead>Empresa</TableHead>}
            <TableHead>Função</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            utilizadores.map((utilizador) => (
              <TableRow key={utilizador.id}>
                <TableCell className="font-medium">{utilizador.nome}</TableCell>
                <TableCell className="text-muted-foreground">
                  {utilizador.email}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-muted-foreground">
                    {utilizador.empresa_nome || '—'}
                  </TableCell>
                )}
                <TableCell>{getRoleBadge(utilizador.role)}</TableCell>
                <TableCell>{getStatusBadge(utilizador.status)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(utilizador.created_at), 'dd MMM yyyy', {
                    locale: pt,
                  })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {isAdmin && onEdit && utilizador.role !== 'admin' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEdit(utilizador)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Editar utilizador</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => sendResetPassword(utilizador.email)}
                            disabled={loadingEmail === utilizador.email}
                          >
                            {loadingEmail === utilizador.email ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Enviar reset de password</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
