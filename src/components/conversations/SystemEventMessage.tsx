import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Bot, Headphones, ArrowLeftRight, XCircle, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/conversations';

interface SystemEventMessageProps {
  message: Message;
  /** Compact mode for widget (less padding) */
  compact?: boolean;
}

type EventType = 'assume' | 'return_ai' | 'transfer' | 'close' | 'welcome' | 'default';

function getEventType(content: string): EventType {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('assumiu') || lowerContent.includes('humano assumiu')) {
    return 'assume';
  }
  if (lowerContent.includes('devolvid') || lowerContent.includes('ia')) {
    return 'return_ai';
  }
  if (lowerContent.includes('transferi')) {
    return 'transfer';
  }
  if (lowerContent.includes('encerr') || lowerContent.includes('fechad')) {
    return 'close';
  }
  if (lowerContent.includes('bem-vindo') || lowerContent.includes('welcome')) {
    return 'welcome';
  }
  
  return 'default';
}

function getEventIcon(eventType: EventType) {
  const iconClass = 'w-3.5 h-3.5';
  
  switch (eventType) {
    case 'assume':
      return <Headphones className={iconClass} />;
    case 'return_ai':
      return <Bot className={iconClass} />;
    case 'transfer':
      return <ArrowLeftRight className={iconClass} />;
    case 'close':
      return <XCircle className={iconClass} />;
    case 'welcome':
      return <Sparkles className={iconClass} />;
    default:
      return <Info className={iconClass} />;
  }
}

function getEventStyles(eventType: EventType): string {
  switch (eventType) {
    case 'close':
      return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'assume':
      return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
    case 'return_ai':
      return 'text-primary bg-primary/10 border-primary/20';
    case 'welcome':
      return 'text-primary bg-primary/5 border-primary/10';
    case 'transfer':
      return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    default:
      return 'text-muted-foreground bg-muted/50 border-border';
  }
}

/**
 * System event message component.
 * Displays system events (handoff, transfers, closures) with a distinct,
 * non-confusable style from regular messages.
 */
export function SystemEventMessage({ message, compact }: SystemEventMessageProps) {
  const eventType = getEventType(message.content);
  const eventStyles = getEventStyles(eventType);
  const icon = getEventIcon(eventType);

  return (
    <div className={cn('flex justify-center', compact ? 'my-2' : 'my-3')}>
      <div className={cn(
        'flex items-center gap-2 rounded-full text-xs border animate-in fade-in-50 duration-200',
        compact ? 'px-2.5 py-1' : 'px-3 py-1.5',
        eventStyles
      )}>
        {icon}
        <span className="font-medium">{message.content}</span>
        <span className="opacity-60">
          · {format(new Date(message.created_at), "HH:mm", { locale: pt })}
        </span>
      </div>
    </div>
  );
}
