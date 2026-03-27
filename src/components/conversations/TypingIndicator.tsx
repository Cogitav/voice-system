import { cn } from '@/lib/utils';
import { ChatAvatar, type AvatarType } from './ChatAvatar';

interface TypingIndicatorProps {
  className?: string;
  primaryColor?: string;
  backgroundColor?: string;
  /** Who is typing - affects the icon shown */
  typingSource?: AvatarType;
  /** Whether to show the indicator with fade animation */
  visible?: boolean;
  /** Label for screen readers */
  ariaLabel?: string;
}

/**
 * Typing indicator component with smooth fade animation.
 * 
 * IMPORTANT: This indicator should only disappear when the actual message
 * is rendered in the chat. Never use timeout-based auto-hide.
 * 
 * The parent component controls visibility via the `visible` prop.
 */
export function TypingIndicator({ 
  className, 
  primaryColor, 
  backgroundColor,
  typingSource = 'ai',
  visible = true,
  ariaLabel,
}: TypingIndicatorProps) {
  const isClient = typingSource === 'client';
  
  // Generate aria-label based on source
  const defaultAriaLabel = {
    ai: 'Assistente IA a escrever',
    operator: 'Operador a escrever',
    client: 'Utilizador a escrever',
    system: 'Sistema a processar',
  }[typingSource];
  
  return (
    <div 
      className={cn(
        'flex gap-2 transition-all duration-300 ease-in-out',
        isClient ? 'justify-end' : 'justify-start',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none h-0 overflow-hidden',
        className
      )}
      aria-live="polite"
      aria-label={ariaLabel || defaultAriaLabel}
    >
      {!isClient && (
        <ChatAvatar type={typingSource} primaryColor={primaryColor} size="md" />
      )}
      <div 
        className="rounded-lg px-4 py-3 flex items-center gap-1.5"
        style={{ 
          backgroundColor: backgroundColor || 'hsl(var(--muted))',
          borderRadius: 'var(--widget-message-radius, 8px)',
        }}
      >
        <span 
          className="w-2 h-2 rounded-full animate-bounce" 
          style={{ 
            backgroundColor: primaryColor || 'hsl(var(--muted-foreground) / 0.6)', 
            animationDelay: '0ms', 
            animationDuration: '600ms' 
          }}
        />
        <span 
          className="w-2 h-2 rounded-full animate-bounce" 
          style={{ 
            backgroundColor: primaryColor || 'hsl(var(--muted-foreground) / 0.6)', 
            animationDelay: '150ms', 
            animationDuration: '600ms' 
          }}
        />
        <span 
          className="w-2 h-2 rounded-full animate-bounce" 
          style={{ 
            backgroundColor: primaryColor || 'hsl(var(--muted-foreground) / 0.6)', 
            animationDelay: '300ms', 
            animationDuration: '600ms' 
          }}
        />
      </div>
      {isClient && (
        <ChatAvatar type="client" size="md" />
      )}
    </div>
  );
}
