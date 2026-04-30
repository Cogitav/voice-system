import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useConversationDebugTimeline } from '@/hooks/useConversationDebugTimeline';
import type { TimelineEvent, TimelineFilter } from '@/types/conversations';

interface ConversationDebugTimelineProps {
  conversationId: string;
  enabled?: boolean;
}

const FILTERS: Array<{ value: TimelineFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'messages', label: 'Messages' },
  { value: 'ai', label: 'AI' },
  { value: 'states', label: 'States' },
  { value: 'actions', label: 'Actions' },
  { value: 'errors', label: 'Errors' },
  { value: 'credits', label: 'Credits' },
  { value: 'handoff', label: 'Handoff' },
];

function matchesFilter(event: TimelineEvent, filter: TimelineFilter) {
  switch (filter) {
    case 'messages':
      return event.type.startsWith('message_');
    case 'ai':
      return event.type === 'message_ai' || event.type === 'agent_log' || event.type === 'fallback';
    case 'states':
      return event.type === 'state_change';
    case 'actions':
      return event.type === 'agent_action';
    case 'errors':
      return event.type === 'error' || event.outcome === 'failed' || event.outcome === 'blocked';
    case 'credits':
      return event.type === 'credit_event';
    case 'handoff':
      return event.type === 'handoff';
    case 'all':
    default:
      return true;
  }
}

function formatTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'Sem timestamp';
  return format(new Date(parsed), 'dd/MM/yyyy HH:mm:ss', { locale: pt });
}

function getOutcomeVariant(outcome: TimelineEvent['outcome']): 'default' | 'secondary' | 'destructive' {
  if (outcome === 'success') return 'default';
  if (outcome === 'failed') return 'destructive';
  return 'secondary';
}

function getEventCardClassName(type: TimelineEvent['type']) {
  if (type === 'state_change') {
    return 'rounded-lg border border-blue-200 bg-blue-50/60 p-3 shadow-sm';
  }

  return 'rounded-lg border bg-card p-3 shadow-sm';
}

export function ConversationDebugTimeline({ conversationId, enabled = true }: ConversationDebugTimelineProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { data, isLoading, error } = useConversationDebugTimeline(conversationId, enabled);

  const filteredEvents = useMemo(
    () => (data?.events ?? []).filter((event) => matchesFilter(event, filter)),
    [data?.events, filter]
  );

  const toggleExpanded = (eventId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={filter === item.value ? 'default' : 'outline'}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Timeline read-only combinada de mensagens, logs do agente, ações e eventos de crédito ligados a esta conversa.
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Erro ao carregar a debug timeline.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.warnings && data.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Timeline parcial
                </div>
                {data.warnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            )}

            {filteredEvents.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                Nenhum evento encontrado para este filtro.
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isExpanded = expandedIds.has(event.id);
                const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;

                return (
                  <div key={event.id} className={getEventCardClassName(event.type)}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatTimestamp(event.timestamp)}
                          </span>
                          <Badge variant="outline">{event.type}</Badge>
                          {event.outcome && (
                            <Badge variant={getOutcomeVariant(event.outcome)}>
                              {event.outcome}
                            </Badge>
                          )}
                          {typeof event.credits === 'number' && (
                            <Badge variant="secondary">{event.credits} créditos</Badge>
                          )}
                        </div>
                        <div className="font-medium">{event.title}</div>
                        {event.description && (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {event.description}
                          </p>
                        )}
                        <div className="text-xs text-muted-foreground">Fonte: {event.source}</div>
                      </div>

                      {hasMetadata && (
                        <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(event.id)}>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="shrink-0">
                              Metadata
                              {isExpanded ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="sm:hidden" />
                        </Collapsible>
                      )}
                    </div>

                    {hasMetadata && isExpanded && (
                      <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
