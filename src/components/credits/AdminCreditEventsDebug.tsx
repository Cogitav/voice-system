/**
 * Admin Credit Events Debug Panel
 * Shows last 50 cost events for admin observability and traceability
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  Phone, 
  MessageSquare, 
  Bot, 
  Mail, 
  FileText,
  CircleDot,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { CREDIT_EVENT_LABELS, type CreditEventType } from '@/lib/credits';

interface CreditEventRow {
  id: string;
  empresa_id: string;
  event_type: CreditEventType;
  credits_consumed: number;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  empresas: {
    id: string;
    nome: string;
  } | null;
}

function useRecentCreditEvents(limit = 50) {
  return useQuery({
    queryKey: ['admin-credit-events-debug', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credits_events')
        .select(`
          id,
          empresa_id,
          event_type,
          credits_consumed,
          reference_id,
          metadata,
          created_at,
          empresas:empresa_id (id, nome)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as CreditEventRow[];
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

const eventIcons: Record<CreditEventType, React.ReactNode> = {
  call_completed: <Phone className="h-4 w-4" />,
  call_short: <Phone className="h-4 w-4" />,
  agent_test: <Bot className="h-4 w-4" />,
  message: <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  knowledge: <FileText className="h-4 w-4" />,
  other: <CircleDot className="h-4 w-4" />,
};

function getEventBadgeVariant(eventType: CreditEventType): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (eventType) {
    case 'call_completed':
      return 'default';
    case 'call_short':
      return 'secondary';
    case 'agent_test':
      return 'outline';
    case 'message':
      return 'default';
    default:
      return 'secondary';
  }
}

export function AdminCreditEventsDebug() {
  const { data: events, isLoading, error } = useRecentCreditEvents(50);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Últimos Eventos de Crédito
        </CardTitle>
        <CardDescription>
          Vista de debug: últimos 50 eventos de consumo de créditos (atualiza a cada 10s)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Erro ao carregar eventos</span>
          </div>
        ) : !events || events.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhum evento de crédito registado
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {/* Header row */}
              <div className="grid grid-cols-[140px_1fr_120px_80px_80px] gap-2 px-2 py-2 text-xs font-medium text-muted-foreground border-b">
                <div>Timestamp</div>
                <div>Empresa</div>
                <div>Tipo</div>
                <div className="text-right">Créditos</div>
                <div className="text-center">Status</div>
              </div>
              
              {/* Event rows */}
              {events.map((event) => (
                <div 
                  key={event.id} 
                  className="grid grid-cols-[140px_1fr_120px_80px_80px] gap-2 px-2 py-2 text-sm hover:bg-muted/50 rounded items-center"
                >
                  <div className="text-xs text-muted-foreground font-mono">
                    {format(new Date(event.created_at), 'dd/MM HH:mm:ss', { locale: pt })}
                  </div>
                  <div className="truncate font-medium">
                    {event.empresas?.nome || 'N/A'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                      {eventIcons[event.event_type]}
                    </span>
                    <Badge variant={getEventBadgeVariant(event.event_type)} className="text-xs">
                      {CREDIT_EVENT_LABELS[event.event_type]?.split(' ')[0] || event.event_type}
                    </Badge>
                  </div>
                  <div className="text-right font-mono font-medium">
                    {event.credits_consumed > 0 ? `-${event.credits_consumed}` : '0'}
                  </div>
                  <div className="flex justify-center">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        
        <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
          <strong>Nota:</strong> Apenas eventos com sucesso são registados. Ações falhadas não debitam créditos.
        </div>
      </CardContent>
    </Card>
  );
}
