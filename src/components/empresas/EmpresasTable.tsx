import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Pencil, Building2, FlaskConical } from 'lucide-react';
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
import { Empresa } from '@/hooks/useEmpresas';

interface EmpresasTableProps {
  empresas: Empresa[];
  isLoading: boolean;
  onEdit: (empresa: Empresa) => void;
}

function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Nenhuma empresa encontrada</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Ainda não existem empresas registadas. Clique em "Nova Empresa" para adicionar a primeira.
      </p>
    </div>
  );
}

export function EmpresasTable({ empresas, isLoading, onEdit }: EmpresasTableProps) {
  if (!isLoading && empresas.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data de Criação</TableHead>
            <TableHead className="w-[70px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            empresas.map((empresa) => (
              <TableRow key={empresa.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {empresa.nome}
                    {(empresa as any).is_test_environment && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                        <FlaskConical className="w-3 h-3 mr-1" />
                        Teste
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {empresa.email || '—'}
                </TableCell>
                <TableCell>
                  {empresa.subscription_plan?.name || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={empresa.status === 'ativo' ? 'default' : empresa.status === 'teste' ? 'outline' : 'secondary'}
                  >
                    {empresa.status === 'ativo' ? 'Ativo' : empresa.status === 'pausado' ? 'Pausado' : empresa.status === 'teste' ? 'Teste' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(empresa.created_at), 'dd MMM yyyy', {
                    locale: pt,
                  })}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(empresa)}
                    title="Editar empresa"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
