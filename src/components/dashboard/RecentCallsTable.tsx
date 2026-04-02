import { Phone, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Call {
  id: string;
  telefone: string;
  agente: string;
  intencao: string;
  duracao: string;
  status: 'concluida' | 'em_andamento' | 'falha';
  data: string;
}

interface RecentCallsTableProps {
  calls: Call[];
  showAgente?: boolean;
  isLoading?: boolean;
}

export function RecentCallsTable({ calls, showAgente = true, isLoading = false }: RecentCallsTableProps) {
  const getStatusBadge = (status: Call['status']) => {
    switch (status) {
      case 'concluida':
        return (
          <span className="badge-success">
            <CheckCircle className="w-3 h-3 mr-1" />
            Concluída
          </span>
        );
      case 'em_andamento':
        return (
          <span className="badge-warning">
            <AlertCircle className="w-3 h-3 mr-1" />
            Em Andamento
          </span>
        );
      case 'falha':
        return (
          <span className="badge-destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Falha
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            Chamadas Recentes
          </h3>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Phone className="w-4 h-4 text-primary" />
          Chamadas Recentes
        </h3>
      </div>
      
      {calls.length === 0 ? (
        <EmptyState 
          icon={Phone}
          title="Sem chamadas"
          description="Não existem chamadas registadas no sistema"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Telefone</th>
                {showAgente && <th>Agente</th>}
                <th>Intenção</th>
                <th>Duração</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td className="font-mono text-sm">{call.telefone}</td>
                  {showAgente && <td>{call.agente}</td>}
                  <td>
                    <span className="badge-muted">{call.intencao}</span>
                  </td>
                  <td className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {call.duracao}
                  </td>
                  <td>{getStatusBadge(call.status)}</td>
                  <td className="text-muted-foreground">{call.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
