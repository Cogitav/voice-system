import { Badge } from '@/components/ui/badge';
import { Bot, Clock, User, XCircle, CheckCircle } from 'lucide-react';
import type { ConversationStatus } from '@/types/conversations';

interface ConversationStatusBadgeProps {
  status: ConversationStatus;
  size?: 'sm' | 'default';
}

const statusConfig: Record<ConversationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  ai_active: {
    label: 'IA Ativa',
    variant: 'default',
    icon: Bot,
  },
  waiting_human: {
    label: 'Aguardando Humano',
    variant: 'secondary',
    icon: Clock,
  },
  human_active: {
    label: 'Humano Ativo',
    variant: 'outline',
    icon: User,
  },
  completed: {
    label: 'Concluída',
    variant: 'outline',
    icon: CheckCircle,
  },
  closed: {
    label: 'Encerrada',
    variant: 'destructive',
    icon: XCircle,
  },
};

export function ConversationStatusBadge({ status, size = 'default' }: ConversationStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={size === 'sm' ? 'text-xs px-1.5 py-0.5' : ''}>
      <Icon className={size === 'sm' ? 'w-3 h-3 mr-1' : 'w-3.5 h-3.5 mr-1.5'} />
      {config.label}
    </Badge>
  );
}
