import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { User, Building2, Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import { ConversationChannelBadge } from './ConversationChannelBadge';
import { ConversationOwnerBadge } from './ConversationOwnerBadge';
import type { Conversation } from '@/types/conversations';
import { cn } from '@/lib/utils';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
  showEmpresa?: boolean;
}

export function ConversationsList({ 
  conversations, 
  selectedId, 
  onSelect, 
  isLoading,
  showEmpresa = false,
}: ConversationsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 rounded-lg border">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <User className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">Nenhuma conversa encontrada</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onSelect(conversation)}
            className={cn(
              'w-full text-left p-2.5 rounded-lg border transition-colors hover:bg-muted/50',
              selectedId === conversation.id && 'bg-primary/10 border-primary/30'
            )}
          >
            <div className="flex items-start gap-2">
              {/* Channel Icon */}
              <ConversationChannelBadge channel={conversation.channel} iconOnly size="sm" />
              
              <div className="flex-1 min-w-0">
                {/* Header: Name + Time */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {conversation.client_name 
                        ? conversation.client_name 
                        : `Visitante · ${conversation.client_identifier.slice(-4)}`}
                    </p>
                    {showEmpresa && conversation.empresa_nome && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {conversation.empresa_nome}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { 
                      addSuffix: true, 
                      locale: pt 
                    })}
                  </span>
                </div>
                
                {/* Last message preview */}
                {conversation.last_message && (
                  <p className="text-xs text-muted-foreground truncate mb-2">
                    {conversation.last_message}
                  </p>
                )}
                
                {/* Status + Owner badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ConversationStatusBadge status={conversation.status} size="sm" />
                  <ConversationOwnerBadge owner={conversation.owner} size="sm" iconOnly />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
