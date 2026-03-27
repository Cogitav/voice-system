import { useNavigate } from 'react-router-dom';
import { Phone, Clock, CheckCircle, XCircle, AlertCircle, Building2, HelpCircle } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import type { ChamadaFormatted } from '@/hooks/useChamadas';

interface ChamadasTableProps {
  chamadas: ChamadaFormatted[];
  isLoading?: boolean;
  showEmpresa?: boolean;
}

export function ChamadasTable({ chamadas, isLoading = false, showEmpresa = false }: ChamadasTableProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const basePath = isAdmin ? '/admin' : '/cliente';

  const handleRowClick = (chamadaId: string) => {
    navigate(`${basePath}/chamadas/${chamadaId}`);
  };

  const getStatusBadge = (status: ChamadaFormatted['status']) => {
    switch (status) {
      case 'concluida':
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="w-3 h-3 mr-1" />
            Concluída
          </Badge>
        );
      case 'em_andamento':
        return (
          <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700 text-white">
            <AlertCircle className="w-3 h-3 mr-1" />
            Em Andamento
          </Badge>
        );
      case 'falha':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Falha
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getIntentBadge = (intencao: string | null | undefined) => {
    if (!intencao || intencao === 'Não identificada' || intencao === '-') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-muted-foreground border-dashed gap-1">
                <HelpCircle className="w-3 h-3" />
                Não identificada
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[200px]">
                A intenção não foi detetada automaticamente. 
                Pode ser definida manualmente no detalhe da chamada.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return <Badge variant="outline">{intencao}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (chamadas.length === 0) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <EmptyState
          icon={Phone}
          title="Sem chamadas registadas"
          description="As chamadas aparecerão aqui quando o sistema estiver integrado com telefonia. Pode simular chamadas para testar o sistema."
        />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Telefone</TableHead>
            <TableHead>Agente</TableHead>
            {showEmpresa && <TableHead>Empresa</TableHead>}
            <TableHead>Intenção</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chamadas.map((chamada) => (
            <TableRow 
              key={chamada.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleRowClick(chamada.id)}
            >
              <TableCell className="font-mono text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {chamada.telefone}
                </div>
              </TableCell>
              <TableCell>
                {chamada.agente || (
                  <span className="text-muted-foreground italic">Sem agente</span>
                )}
              </TableCell>
              {showEmpresa && (
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    {chamada.empresa}
                  </div>
                </TableCell>
              )}
              <TableCell>
                {getIntentBadge(chamada.intencao)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {chamada.duracao || '-'}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(chamada.status)}</TableCell>
              <TableCell className="text-muted-foreground">{chamada.data}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
