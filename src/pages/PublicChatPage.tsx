import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSecurePublicChat, WidgetBranding } from '@/hooks/useSecurePublicChat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Send, Loader2, AlertCircle, MessageSquare, X, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TypingIndicator } from '@/components/conversations/TypingIndicator';
import { SystemEventMessage } from '@/components/conversations/SystemEventMessage';
import { ChatAvatar, getAvatarType, type AvatarType } from '@/components/conversations/ChatAvatar';

// Memoized message component to prevent unnecessary re-renders
const ChatMessage = React.memo(function ChatMessage({
  message,
  branding,
  userMessageTextColor,
  isSending,
}: {
  message: { id: string; sender_type: string; content: string; created_at: string };
  branding: WidgetBranding | null;
  userMessageTextColor: string;
  isSending?: boolean;
}) {
  const isClient = message.sender_type === 'client';
  const isSystem = message.sender_type === 'system';
  
  // Use consistent avatar type
  const avatarType = getAvatarType(message.sender_type) as AvatarType;

  // System messages - use dedicated component
  if (isSystem) {
    return <SystemEventMessage message={message as any} compact />;
  }

  return (
    <div
      className={cn(
        'flex gap-2 animate-in fade-in-50 duration-200',
        isClient ? 'justify-start' : 'justify-end'
      )}
    >
      {isClient && (
        <ChatAvatar type={avatarType} primaryColor={branding?.primaryColor} size="md" />
      )}
      <div
        className="max-w-[80%] px-3 py-2"
        style={{
          backgroundColor: isClient 
            ? (branding?.agentMessageColor || 'var(--muted)')
            : (branding?.userMessageColor || 'var(--primary)'),
          borderRadius: 'var(--widget-message-radius, 8px)',
          color: isClient 
            ? 'var(--widget-text-primary, inherit)' 
            : userMessageTextColor,
        }}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {isSending && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" style={{ opacity: 0.7 }} />
              <span className="text-xs" style={{ opacity: 0.7 }}>A enviar...</span>
            </>
          )}
          {!isSending && (
            <span
              className="text-xs"
              style={{
                color: isClient 
                  ? 'var(--widget-text-secondary, var(--muted-foreground))'
                  : `${userMessageTextColor}b3`,
              }}
            >
              {format(new Date(message.created_at), 'HH:mm', { locale: pt })}
            </span>
          )}
        </div>
      </div>
      {!isClient && (
        <ChatAvatar type={avatarType} primaryColor={branding?.primaryColor} size="md" />
      )}
    </div>
  );
});

// Helper to detect if running in iframe
function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

// Send message to parent window
function postToParent(type: string, data?: Record<string, unknown>) {
  if (isInIframe() && window.parent) {
    window.parent.postMessage({ type, ...data }, '*');
  }
}

// Check if a color is light (for text contrast)
function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// Get border radius values
function getBorderRadius(setting: WidgetBranding['borderRadius']): { base: string; message: string } {
  switch (setting) {
    case 'normal':
      return { base: '4px', message: '8px' };
    case 'rounded':
      return { base: '8px', message: '12px' };
    case 'soft':
      return { base: '16px', message: '20px' };
    default:
      return { base: '4px', message: '8px' };
  }
}

export default function PublicChatPage() {
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get('embed') === 'true' || isInIframe();
  const { empresa_slug } = useParams<{ empresa_slug: string }>();
  const {
    empresa,
    empresaLoading,
    empresaError,
    branding,
    conversation,
    messages,
    messagesLoading,
    isTyping,
    isSending,
    isOperatorTyping,
    chatState,
    isInitializingConversation,
    sendMessage,
    startClientTyping,
    stopClientTyping,
  } = useSecurePublicChat(empresa_slug);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Compute effective theme based on branding and system preference
  const effectiveTheme = useMemo(() => {
    if (!branding) return 'light';
    if (branding.themeMode === 'auto') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return branding.themeMode;
  }, [branding]);

  // Generate CSS variables from branding
  const cssVariables = useMemo(() => {
    if (!branding) return {};
    const isDark = effectiveTheme === 'dark';
    const radii = getBorderRadius(branding.borderRadius);
    
    return {
      '--widget-primary': branding.primaryColor,
      '--widget-secondary': branding.secondaryColor,
      '--widget-background': isDark ? '#1f2937' : branding.backgroundColor,
      '--widget-user-message': branding.userMessageColor,
      '--widget-agent-message': isDark ? '#374151' : branding.agentMessageColor,
      '--widget-border-radius': radii.base,
      '--widget-message-radius': radii.message,
      '--widget-text-primary': isDark ? '#f9fafb' : '#111827',
      '--widget-text-secondary': isDark ? '#9ca3af' : '#6b7280',
      '--widget-border': isDark ? '#374151' : '#e5e7eb',
    } as React.CSSProperties;
  }, [branding, effectiveTheme]);

  // Auto-scroll to bottom on new messages or typing state change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isOperatorTyping]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || sendMessage.isPending) return;
    stopClientTyping(); // Stop typing when sending
    setInput('');
    sendMessage.mutate(content);
  };

  // Handle input change and broadcast typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim()) {
      startClientTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Typing indicator visibility - ONLY disappear when message is rendered
  // AI typing shows when waiting for response or simulating typing delay
  const showAITyping = chatState === 'ai_thinking' || chatState === 'ai_typing';
  // Operator typing shows when operator is actively typing (from realtime)
  const showOperatorTyping = isOperatorTyping && chatState === 'idle';
  
  // Determine typing source for indicator icon
  const typingSource = showOperatorTyping ? 'operator' : 'ai';

  // Notify parent of new messages (for widget notification badge)
  useEffect(() => {
    if (messages.length > 0 && isEmbedded) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_type !== 'client') {
        postToParent('lovable-chat-notification');
      }
    }
  }, [messages, isEmbedded]);

  const handleClose = () => {
    postToParent('lovable-chat-close');
  };

  // Show skeleton loading state immediately - renders chat shell instantly
  const isInitialLoading = empresaLoading && !empresa;
  
  // Empresa not found (after loading completes)
  if (!empresaLoading && (empresaError || !empresa)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Empresa não encontrada</h1>
          <p className="text-muted-foreground">
            O chat que procura não existe ou não está disponível.
          </p>
        </div>
      </div>
    );
  }

  const isWaitingHuman = conversation?.status === 'waiting_human';
  const isHumanActive = conversation?.status === 'human_active';

  // Determine text colors based on background
  const primaryTextColor = branding && isLightColor(branding.primaryColor) ? '#111827' : '#ffffff';
  const userMessageTextColor = branding && isLightColor(branding.userMessageColor) ? '#111827' : '#ffffff';

  return (
    <div 
      className={cn("min-h-screen flex flex-col", isEmbedded && "h-screen")}
      style={{
        ...cssVariables,
        backgroundColor: branding?.backgroundColor || 'var(--background)',
        color: effectiveTheme === 'dark' ? '#f9fafb' : '#111827',
      }}
    >
      {/* Header - show skeleton or real content */}
      <header 
        className="px-4 py-3 flex-shrink-0"
        style={{ 
          backgroundColor: isInitialLoading ? 'hsl(var(--primary))' : (branding?.primaryColor || 'var(--primary)'),
          borderBottom: `1px solid ${isInitialLoading ? 'hsl(var(--primary))' : (branding?.primaryColor || 'var(--border)')}`,
        }}
      >
        <div className={cn("flex items-center gap-3", !isEmbedded && "max-w-2xl mx-auto")}>
          {isInitialLoading ? (
            <>
              <Skeleton className="h-10 w-10 rounded-full bg-white/20" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32 bg-white/20" />
                <Skeleton className="h-3 w-24 bg-white/20" />
              </div>
            </>
          ) : (
            <>
              {branding?.avatarUrl ? (
                <img 
                  src={branding.avatarUrl} 
                  alt={branding.headerText || empresa?.nome || 'Chat'}
                  className="h-10 w-10 rounded-full object-cover"
                  style={{ borderRadius: 'var(--widget-message-radius, 9999px)' }}
                />
              ) : (
                <div 
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 'var(--widget-message-radius, 9999px)',
                  }}
                >
                  <MessageSquare className="h-5 w-5" style={{ color: primaryTextColor }} />
                </div>
              )}
              <div className="flex-1">
                <h1 className="font-semibold" style={{ color: primaryTextColor }}>
                  {branding?.headerText || empresa?.nome || 'Chat'}
                </h1>
                <p className="text-xs" style={{ color: primaryTextColor, opacity: 0.8 }}>
                  {isTyping
                    ? 'A escrever...'
                    : isWaitingHuman
                    ? 'A aguardar atendente...'
                    : isHumanActive
                    ? 'A falar com um atendente'
                    : 'Assistente virtual'}
                </p>
              </div>
            </>
          )}
          {isEmbedded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 flex-shrink-0 hover:bg-white/10"
              style={{ color: primaryTextColor }}
              aria-label="Fechar chat"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 min-h-0">
        <div className={cn("py-4 space-y-4", !isEmbedded && "max-w-2xl mx-auto")}>
          {isInitialLoading || messagesLoading ? (
            <>
              <div className="flex gap-2 justify-start">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-16 w-3/4 rounded-lg" />
              </div>
              <div className="flex gap-2 justify-end">
                <Skeleton className="h-12 w-2/3 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </>
          ) : (
            <>
              {/* Show empty state only if no messages and idle */}
              {messages.length === 0 && chatState === 'idle' && !isInitializingConversation && (
                <div className="text-center py-12" style={{ color: 'var(--widget-text-secondary, var(--muted-foreground))' }}>
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>A iniciar conversa...</p>
                </div>
              )}
              
              {/* Render actual messages using memoized component */}
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  branding={branding}
                  userMessageTextColor={userMessageTextColor}
                  isSending={message.id.startsWith('temp_') && chatState === 'client_sending'}
                />
              ))}
              
              {/* Typing indicator - themed (shows for AI or operator typing) */}
              <TypingIndicator 
                primaryColor={branding?.primaryColor}
                backgroundColor={branding?.agentMessageColor}
                typingSource={typingSource}
                visible={showAITyping || showOperatorTyping}
              />
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input - show even during loading with disabled state */}
      <div 
        className="px-4 py-3 flex-shrink-0"
        style={{ 
          backgroundColor: branding?.backgroundColor || 'var(--card)',
          borderTop: `1px solid var(--widget-border, var(--border))`,
        }}
      >
        <div className={cn("flex gap-2", !isEmbedded && "max-w-2xl mx-auto")}>
          {isInitialLoading ? (
            <>
              <Skeleton className="flex-1 h-11 rounded" />
              <Skeleton className="h-11 w-11 rounded" />
            </>
          ) : (
            <>
              <Textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Escreva a sua mensagem..."
                className="min-h-[44px] max-h-32 resize-none"
                style={{ 
                  borderRadius: 'var(--widget-border-radius, 4px)',
                  borderColor: 'var(--widget-border, var(--border))',
                  backgroundColor: branding?.inputBackgroundColor || 'var(--input)',
                  color: branding?.inputTextColor || 'inherit',
                }}
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sendMessage.isPending}
                size="icon"
                className="h-11 w-11 flex-shrink-0"
                style={{ 
                  backgroundColor: branding?.primaryColor || 'var(--primary)',
                  color: primaryTextColor,
                  borderRadius: 'var(--widget-border-radius, 4px)',
                }}
              >
                {sendMessage.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
