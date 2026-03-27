import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, XCircle, Mail, FlaskConical, Building2 } from 'lucide-react';
import { getCurrentMonth } from '@/lib/credits';
import { useEmpresas } from '@/hooks/useEmpresas';

interface SystemEmailLog {
  id: string;
  empresa_id: string;
  alert_type: string;
  month: string;
  recipients: string[];
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  metadata: {
    empresa_nome?: string;
    percentage?: number;
    credits_used?: number;
    credits_limit?: number;
  };
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  credits_70: 'Alerta 70%',
  credits_85: 'Aviso 85%',
  credits_100: 'Excedido 100%',
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  credits_70: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  credits_85: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  credits_100: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'sent', label: 'Enviados' },
  { value: 'failed', label: 'Falhados' },
  { value: 'skipped_test_env', label: 'Ignorados (Teste)' },
  { value: 'pending', label: 'Pendentes' },
];

export function AdminSystemEmailLogs() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [selectedAlertType, setSelectedAlertType] = useState<string>('all');
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data: empresas } = useEmpresas();

  // Generate last 6 months for filter
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['system-email-logs', selectedMonth, selectedAlertType, selectedEmpresa, selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from('system_email_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (selectedMonth !== 'all') {
        query = query.eq('month', selectedMonth);
      }

      if (selectedAlertType !== 'all') {
        query = query.eq('alert_type', selectedAlertType);
      }

      if (selectedEmpresa !== 'all') {
        query = query.eq('empresa_id', selectedEmpresa);
      }

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return data as SystemEmailLog[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Histórico de Emails de Sistema</h3>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {months.map(month => (
              <SelectItem key={month} value={month}>
                {format(new Date(month + '-01'), 'MMM yyyy', { locale: pt })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
          <SelectTrigger className="w-[180px]">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {empresas?.map(empresa => (
              <SelectItem key={empresa.id} value={empresa.id}>
                {empresa.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedAlertType} onValueChange={setSelectedAlertType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tipo de alerta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="credits_70">Alerta 70%</SelectItem>
            <SelectItem value="credits_85">Aviso 85%</SelectItem>
            <SelectItem value="credits_100">Excedido 100%</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!logs || logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum email de sistema enviado.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">
                        {log.metadata?.empresa_nome || 'N/A'}
                      </span>
                      {log.metadata?.percentage && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({log.metadata.percentage}%)
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="secondary"
                      className={ALERT_TYPE_COLORS[log.alert_type] || ''}
                    >
                      {ALERT_TYPE_LABELS[log.alert_type] || log.alert_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {log.recipients.map((email, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.status === 'sent' ? (
                      <Badge variant="default" className="bg-green-600 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Enviado
                      </Badge>
                    ) : log.status === 'failed' ? (
                      <Badge variant="destructive" className="gap-1" title={log.error_message || undefined}>
                        <XCircle className="h-3 w-3" />
                        Falhou
                      </Badge>
                    ) : log.status === 'skipped_test_env' ? (
                      <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                        <FlaskConical className="h-3 w-3" />
                        Ignorado (Teste)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
