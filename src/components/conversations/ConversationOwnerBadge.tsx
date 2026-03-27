import { Badge } from '@/components/ui/badge';
import { Bot, User } from 'lucide-react';
import type { ConversationOwner } from '@/types/conversations';
import { cn } from '@/lib/utils';

interface ConversationOwnerBadgeProps {
  owner: ConversationOwner;
  size?: 'sm' | 'default';
  iconOnly?: boolean;
}

const ownerConfig: Record<ConversationOwner, { label: string; icon: React.ElementType; className: string }> = {
  ai: {
    label: 'IA',
    icon: Bot,
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  },
  human: {
    label: 'Humano',
    icon: User,
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
};

export function ConversationOwnerBadge({ owner, size = 'default', iconOnly = false }: ConversationOwnerBadgeProps) {
  const config = ownerConfig[owner];
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
    <Badge variant="outline" className={cn(config.className, size === 'sm' && 'text-xs px-1.5 py-0.5')}>
      <Icon className={size === 'sm' ? 'w-3 h-3 mr-1' : 'w-3.5 h-3.5 mr-1.5'} />
      {config.label}
    </Badge>
  );
}
