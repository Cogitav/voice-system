import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Eye, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/conversations';
import { ChatAvatar, getAvatarType } from './ChatAvatar';

interface MessageBubbleProps {
  message: Message;
  /** Show sending state for optimistic messages */
  isSending?: boolean;
}

export function MessageBubble({ message, isSending }: MessageBubbleProps) {
  const isClient = message.sender_type === 'client';
  const isAI = message.sender_type === 'ai';
  const isHuman = message.sender_type === 'human';
  const isInternal = message.is_internal;

  // Get consistent avatar type
  const avatarType = getAvatarType(message.sender_type);

  return (
    <div className={cn(
      'flex gap-2 max-w-[85%] animate-in fade-in-50 duration-200',
      isClient ? 'self-start' : 'self-end flex-row-reverse'
    )}>
      {/* Avatar - using consistent ChatAvatar component */}
      <ChatAvatar type={avatarType} size="md" />

      {/* Message content */}
      <div className="flex flex-col gap-1">
        <div className={cn(
          'rounded-2xl px-4 py-2',
          isClient && 'bg-muted',
          isAI && 'bg-primary text-primary-foreground',
          isHuman && !isInternal && 'bg-emerald-600 text-white',
          isInternal && 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700'
        )}>
          {isInternal && (
            <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
              <Eye className="w-3 h-3" />
              <span>Nota interna</span>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground',
          !isClient && 'justify-end'
        )}>
          {isSending && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>A enviar...</span>
            </>
          )}
          {!isSending && (
            <span>{format(new Date(message.created_at), "HH:mm", { locale: pt })}</span>
          )}
        </div>
      </div>
    </div>
  );
}