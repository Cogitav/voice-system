import { Bot, User, Headphones, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AvatarType = 'ai' | 'operator' | 'client' | 'system';

interface ChatAvatarProps {
  type: AvatarType;
  className?: string;
  /** Custom primary color for branding */
  primaryColor?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const;

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

/**
 * Unified avatar component for chat messages.
 * Ensures consistent visual identity across widget and admin views.
 * 
 * Types:
 * - ai: AI assistant (Bot icon, primary color)
 * - operator: Human operator (Headphones icon, green)
 * - client: End user (User icon, muted)
 * - system: System messages (Info icon, subtle/transparent)
 */
export function ChatAvatar({ type, className, primaryColor, size = 'md' }: ChatAvatarProps) {
  const sizeClass = sizeClasses[size];
  const iconSize = iconSizeClasses[size];

  // AI Assistant - Bot icon with primary color accent
  if (type === 'ai') {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0',
          sizeClass,
          className
        )}
        style={{
          backgroundColor: primaryColor ? `${primaryColor}20` : 'hsl(var(--primary) / 0.1)',
        }}
      >
        <Bot
          className={iconSize}
          style={{ color: primaryColor || 'hsl(var(--primary))' }}
        />
      </div>
    );
  }

  // Human Operator - Headphones icon with green accent (distinguishable from AI)
  if (type === 'operator') {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30',
          sizeClass,
          className
        )}
      >
        <Headphones className={cn(iconSize, 'text-emerald-600 dark:text-emerald-400')} />
      </div>
    );
  }

  // End User/Client - User icon with muted styling
  if (type === 'client') {
    return (
      <div
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0 bg-muted',
          sizeClass,
          className
        )}
      >
        <User className={cn(iconSize, 'text-muted-foreground')} />
      </div>
    );
  }

  // System - Info icon, subtle and neutral
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 bg-muted/50',
        sizeClass,
        className
      )}
    >
      <Info className={cn(iconSize, 'text-muted-foreground/70')} />
    </div>
  );
}

/**
 * Maps message sender_type to avatar type
 */
export function getAvatarType(senderType: string, isOperator?: boolean): AvatarType {
  if (senderType === 'system') return 'system';
  if (senderType === 'client') return 'client';
  if (senderType === 'human' || isOperator) return 'operator';
  if (senderType === 'ai') return 'ai';
  return 'ai'; // Default fallback
}
