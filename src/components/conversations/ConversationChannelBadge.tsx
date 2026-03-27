import { Badge } from '@/components/ui/badge';
import { MessageCircle, MessageSquare, PhoneCall } from 'lucide-react';
import type { ConversationChannel } from '@/types/conversations';
import { cn } from '@/lib/utils';

interface ConversationChannelBadgeProps {
  channel: ConversationChannel;
  size?: 'sm' | 'default';
  iconOnly?: boolean;
}

const channelConfig: Record<ConversationChannel, { label: string; icon: React.ElementType; className: string }> = {
  chat: {
    label: 'Chat',
    icon: MessageCircle,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageSquare,
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  voice: {
    label: 'Voz',
    icon: PhoneCall,
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
};

export function ConversationChannelBadge({ channel, size = 'default', iconOnly = false }: ConversationChannelBadgeProps) {
  const config = channelConfig[channel];
  if (!config) return null;
  
  const Icon = config.icon;

  if (iconOnly) {
    return (
      <div className={cn(
        'flex items-center justify-center rounded-full p-1.5',
        config.className
      )}>
        <Icon className={cn('w-4 h-4', size === 'sm' && 'w-3.5 h-3.5')} />
      </div>
    );
  }

  return (
    <Badge variant="outline" className={`${config.className} ${size === 'sm' ? 'text-xs px-1.5 py-0.5' : ''}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3 mr-1' : 'w-3.5 h-3.5 mr-1.5'} />
      {config.label}
    </Badge>
  );
}
