import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Pencil, Eye, Bot, Power, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Agente } from '@/hooks/useAgentes';
import { useAuth } from '@/contexts/AuthContext';

interface AgentesTableProps {
  agentes: Agente[];
  isLoading: boolean;
  onEdit?: (agente: Agente) => void;
  onToggleStatus?: (agente: Agente) => void;
  onAdd?: () => void;
  readOnly?: boolean;
}

function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState({ onAdd, isAdmin }: { onAdd?: () => void; isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed bg-muted/20">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Bot className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Nenhum agente configurado</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        {isAdmin 
          ? 'Os agentes são assistentes virtuais que atendem chamadas. Configure o primeiro agente para começar a usar a plataforma.'
          : 'Ainda não existem agentes associados à sua empresa. Contacte o administrador para configurar agentes.'}
      </p>
      {isAdmin && onAdd && (
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Criar primeiro agente
        </Button>
      )}
    </div>
  );
}

export function AgentesTable({ agentes, isLoading, onEdit, onToggleStatus, onAdd, readOnly = false }: AgentesTableProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const showActions = !readOnly && isAdmin;
  const basePath = isAdmin ? '/admin' : '/cliente';

  if (!isLoading && agentes.length === 0) {
    return <EmptyState onAdd={onAdd} isAdmin={isAdmin} />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            {isAdmin && <TableHead>Empresa</TableHead>}
            <TableHead>Idioma</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Última Atualização</TableHead>
            <TableHead className="w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            agentes.map((agente) => (
              <TableRow key={agente.id}>
                <TableCell className="font-medium">{agente.nome}</TableCell>
                {isAdmin && (
                  <TableCell className="text-muted-foreground">
                    {agente.empresa_nome || '—'}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {agente.idioma || 'pt-PT'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={agente.status === 'ativo' ? 'default' : 'secondary'}
                  >
                    {agente.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(agente.created_at), 'dd MMM yyyy', {
                    locale: pt,
                  })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`${basePath}/agentes/${agente.id}`)}
                      title="Ver detalhes"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {showActions && onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(agente)}
                        title="Editar agente"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {showActions && onToggleStatus && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleStatus(agente)}
                        title={agente.status === 'ativo' ? 'Desativar' : 'Ativar'}
                      >
                        <Power className={`h-4 w-4 ${agente.status === 'ativo' ? 'text-destructive' : 'text-green-500'}`} />
                      </Button>
                    )}
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
