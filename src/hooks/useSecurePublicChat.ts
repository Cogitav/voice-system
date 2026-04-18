import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

const PUBLIC_CHAT_SESSION_KEY = 'public_chat_session_id';
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-chat`;
const DEFAULT_RESPONSE_DELAY_MS = 2000;
const MIN_RESPONSE_DELAY_MS = 2000; // Minimum 2 seconds for typing simulation

interface Empresa {
  id: string;
  nome: string;
  slug: string;
}

export interface WidgetBranding {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  userMessageColor: string;
  agentMessageColor: string;
  userTextColor: string;
  agentTextColor: string;
  buttonColor: string;
  inputBackgroundColor: string;
  inputTextColor: string;
  themeMode: 'light' | 'dark' | 'auto';
  borderRadius: 'normal' | 'rounded' | 'soft';
  size: 'small' | 'medium' | 'large';
  headerText: string;
  avatarUrl: string | null;
}

interface Conversation {
  id: string;
  status: 'ai_active' | 'waiting_human' | 'human_active' | 'closed';
  owner: 'ai' | 'human';
  channel: string;
  created_at: string;
  last_message_at: string;
}

interface Message {
  id: string;
  sender_type: 'client' | 'ai' | 'human' | 'system';
  content: string;
  created_at: string;
}

// Chat state types for clear typing indicator logic
type ChatState = 'idle' | 'client_sending' | 'ai_thinking' | 'ai_typing';

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(PUBLIC_CHAT_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(PUBLIC_CHAT_SESSION_KEY, sessionId);
  }
  return sessionId;
}

// Generate deterministic temp ID to prevent duplicates
function generateTempId(content: string, timestamp: number): string {
  return `temp_${timestamp}_${content.slice(0, 20).replace(/\s/g, '_')}`;
}

async function callPublicChat(action: string, params: Record<string, unknown> = {}) {
  const sessionId = getOrCreateSessionId();
  
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      sessionId,
      ...params,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export function useSecurePublicChat(empresaSlug: string | undefined) {
  const queryClient = useQueryClient();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [isOperatorTyping, setIsOperatorTyping] = useState(false);
  const [responseDelayMs, setResponseDelayMs] = useState(DEFAULT_RESPONSE_DELAY_MS);
  const pollingIntervalRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const operatorTypingTimeoutRef = useRef<number | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  
  // Keep track of optimistic message IDs to prevent duplicates
  const optimisticIdsRef = useRef<Set<string>>(new Set());

  const [branding, setBranding] = useState<WidgetBranding | null>(null);
  const [isInitializingConversation, setIsInitializingConversation] = useState(false);
  
  const sessionId = getOrCreateSessionId();

  // Fetch empresa
  const empresaQuery = useQuery({
    queryKey: ['public-chat-empresa', empresaSlug],
    queryFn: async () => {
      if (!empresaSlug) return null;
      const result = await callPublicChat('get-empresa', { empresaSlug });
      if (result.branding) {
        setBranding(result.branding as WidgetBranding);
      }
      return result.empresa as Empresa;
    },
    enabled: !!empresaSlug,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache empresa for 5 minutes
  });

  // Fetch conversation
  const conversationQuery = useQuery({
    queryKey: ['public-chat-conversation', empresaSlug],
    queryFn: async () => {
      if (!empresaSlug) return null;
      const result = await callPublicChat('get-conversation', { empresaSlug });
      if (result.conversation) {
        setCurrentConversationId(result.conversation.id);
      }
      return result.conversation as Conversation | null;
    },
    enabled: !!empresaSlug && !!empresaQuery.data,
    retry: 1,
    staleTime: 30 * 1000, // Cache conversation for 30 seconds
  });

  // Fetch messages with stable sorting
  const messagesQuery = useQuery({
    queryKey: ['public-chat-messages', empresaSlug, currentConversationId],
    queryFn: async () => {
      if (!empresaSlug || !currentConversationId) return [];
      const result = await callPublicChat('get-messages', {
        empresaSlug,
        conversationId: currentConversationId,
      });
      return result.messages as Message[];
    },
    enabled: !!empresaSlug && !!currentConversationId,
    retry: 1,
    staleTime: 5 * 1000, // Cache messages for 5 seconds
  });

  // Memoized stable messages list - never clear on error, sort consistently
  const stableMessages = useMemo(() => {
    const messages = messagesQuery.data || [];
    // Sort by created_at to ensure consistent order
    return [...messages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messagesQuery.data]);

  // Polling for new messages (since we can't use realtime without Supabase client)
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    
    pollingIntervalRef.current = window.setInterval(() => {
      if (currentConversationId) {
        queryClient.invalidateQueries({ 
          queryKey: ['public-chat-messages', empresaSlug, currentConversationId] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ['public-chat-conversation', empresaSlug] 
        });
      }
    }, 3000); // Poll every 3 seconds
  }, [currentConversationId, empresaSlug, queryClient]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (operatorTypingTimeoutRef.current) {
        clearTimeout(operatorTypingTimeoutRef.current);
      }
    };
  }, []);

  // Start/stop polling based on conversation state
  useEffect(() => {
    if (currentConversationId) {
      startPolling();
    }
    return () => stopPolling();
  }, [currentConversationId, startPolling, stopPolling]);

  // Set up realtime channel for typing presence when we have a conversation
  useEffect(() => {
    if (!currentConversationId) return;

    const channelName = `typing:${currentConversationId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userType, isTyping: remoteIsTyping } = payload.payload;

        // Only show typing if it's from an operator (human)
        if (userType === 'operator') {
          if (remoteIsTyping) {
            setIsOperatorTyping(true);
            
            // Clear existing timeout (safety cleanup only)
            if (operatorTypingTimeoutRef.current) {
              clearTimeout(operatorTypingTimeoutRef.current);
            }
            
            // Safety timeout - only used if stop message is lost
            // Normal hide happens when message is rendered
            operatorTypingTimeoutRef.current = window.setTimeout(() => {
              setIsOperatorTyping(false);
            }, 10000); // 10s safety timeout
          } else {
            setIsOperatorTyping(false);
            if (operatorTypingTimeoutRef.current) {
              clearTimeout(operatorTypingTimeoutRef.current);
            }
          }
        }
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      typingChannelRef.current = null;
      if (operatorTypingTimeoutRef.current) {
        clearTimeout(operatorTypingTimeoutRef.current);
      }
    };
  }, [currentConversationId]);

  // Broadcast client typing state
  const broadcastClientTyping = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current) return;

    const now = Date.now();
    // Debounce to max once per 500ms for typing start
    if (isTyping && now - lastTypingBroadcastRef.current < 500) return;
    lastTypingBroadcastRef.current = now;

    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: sessionId,
        userType: 'client',
        isTyping,
      },
    });
  }, [sessionId]);

  // Client typing handlers
  const startClientTyping = useCallback(() => {
    broadcastClientTyping(true);
  }, [broadcastClientTyping]);

  const stopClientTyping = useCallback(() => {
    broadcastClientTyping(false);
  }, [broadcastClientTyping]);

  // Send message mutation with improved stability
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!empresaSlug) throw new Error('Empresa not found');

      // Transition to sending state
      setChatState('client_sending');

      const result = await callPublicChat('send-message', {
        empresaSlug,
        conversationId: currentConversationId,
        content,
      });

      // Transition to thinking state once server received message
      setChatState('ai_thinking');

      // Update conversation ID if this was the first message
      if (result.conversationId && !currentConversationId) {
        setCurrentConversationId(result.conversationId);
      }

      // Store the response delay from the server
      if (result.responseDelayMs) {
        setResponseDelayMs(result.responseDelayMs);
      }

      return result;
    },
    onMutate: async (content: string) => {
      // Generate deterministic temp ID
      const timestamp = Date.now();
      const tempId = generateTempId(content, timestamp);
      
      // Track this optimistic ID
      optimisticIdsRef.current.add(tempId);

      // Optimistically add client message IMMEDIATELY (before API call completes)
      const optimisticMessage: Message = {
        id: tempId,
        sender_type: 'client',
        content,
        created_at: new Date(timestamp).toISOString(),
      };
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: ['public-chat-messages', empresaSlug, currentConversationId] 
      });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData<Message[]>(
        ['public-chat-messages', empresaSlug, currentConversationId]
      );

      queryClient.setQueryData(
        ['public-chat-messages', empresaSlug, currentConversationId],
        (old: Message[] | undefined) => {
          const messages = old || [];
          // Check if message already exists (by temp ID or similar content)
          const exists = messages.some(m => 
            m.id === tempId || 
            (m.sender_type === 'client' && m.content === content && 
             Math.abs(new Date(m.created_at).getTime() - timestamp) < 5000)
          );
          if (exists) return messages;
          
          return [...messages, optimisticMessage].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      );
      
      return { optimisticMessage, previousMessages };
    },
    onSuccess: (data, _variables, context) => {
      const delay = data.responseDelayMs || responseDelayMs;
      const conversationId = data.conversationId || currentConversationId;
      
      // Remove optimistic ID from tracking
      if (context?.optimisticMessage) {
        optimisticIdsRef.current.delete(context.optimisticMessage.id);
      }

      // Replace optimistic message with real message, preserving order
      queryClient.setQueryData(
        ['public-chat-messages', empresaSlug, conversationId],
        (old: Message[] | undefined) => {
          const messages = old || [];
          let newMessages = [...messages];
          
          // Remove optimistic message if present
          if (context?.optimisticMessage) {
            newMessages = newMessages.filter(m => m.id !== context.optimisticMessage.id);
          }
          
          // Add guided greeting message if present (for new conversations)
          if (data.guidedGreetingMessage && !newMessages.find(m => m.id === data.guidedGreetingMessage.id)) {
            newMessages.push(data.guidedGreetingMessage);
          }
          
          // Add real client message if not already present
          if (data.clientMessage && !newMessages.find(m => m.id === data.clientMessage.id)) {
            newMessages.push(data.clientMessage);
          }
          
          // Sort by created_at for consistent order
          return newMessages.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
      );

      // If there's an AI message, show typing indicator THEN the message
      // Ensure minimum delay for natural feel
      if (data.aiMessage) {
        setChatState('ai_typing');
        
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        // Use at least MIN_RESPONSE_DELAY_MS for natural typing simulation
        const effectiveDelay = Math.max(delay, MIN_RESPONSE_DELAY_MS);
        
        typingTimeoutRef.current = window.setTimeout(() => {
          // Add AI message after delay
          queryClient.setQueryData(
            ['public-chat-messages', empresaSlug, conversationId],
            (old: Message[] | undefined) => {
              const messages = old || [];
              if (messages.find(m => m.id === data.aiMessage.id)) {
                return messages;
              }
              const newMessages = [...messages, data.aiMessage];
              return newMessages.sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            }
          );
          // Hide typing indicator ONLY after message is added
          setChatState('idle');
        }, effectiveDelay);
      } else {
        setChatState('idle');
      }

      // Invalidate to ensure we have fresh data
      queryClient.invalidateQueries({ 
        queryKey: ['public-chat-conversation', empresaSlug] 
      });
    },
    onError: (_error, _variables, context) => {
      setChatState('idle');
      
      // Remove optimistic ID from tracking
      if (context?.optimisticMessage) {
        optimisticIdsRef.current.delete(context.optimisticMessage.id);
      }
      
      // On error, restore previous messages instead of clearing
      // This prevents the UI from resetting on network failures
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(
          ['public-chat-messages', empresaSlug, currentConversationId],
          context.previousMessages
        );
      }
    },
  });

  // Derive typing states from chatState
  const isTyping = chatState === 'ai_thinking' || chatState === 'ai_typing';
  const isSending = chatState === 'client_sending';

  // Auto-init conversation when empresa is loaded and no conversation exists
  const initConversation = useCallback(async () => {
    if (!empresaSlug || isInitializingConversation || currentConversationId) return;
    setIsInitializingConversation(true);
    try {
      const result = await callPublicChat('init-conversation', { empresaSlug });
      if (result.conversationId) {
        setCurrentConversationId(result.conversationId);
        // If greeting message returned, add it to cache
        if (result.greetingMessage) {
          queryClient.setQueryData(
            ['public-chat-messages', empresaSlug, result.conversationId],
            [{
              id: `welcome-${result.conversationId}`,
              conversation_id: result.conversationId,
              sender_type: 'ai',
              content: result.greetingMessage,
              is_internal: false,
              created_at: new Date().toISOString(),
            }]
          );
        }
        // Invalidate to fetch fresh messages (for reopened conversations)
        if (result.alreadyExists) {
          queryClient.invalidateQueries({
            queryKey: ['public-chat-messages', empresaSlug, result.conversationId]
          });
        }
      }
    } catch (e) {
      console.error('[PublicChat] Failed to init conversation:', e);
    } finally {
      setIsInitializingConversation(false);
    }
  }, [empresaSlug, isInitializingConversation, currentConversationId, queryClient]);

  // Trigger init when empresa is loaded and no active conversation
  useEffect(() => {
    if (empresaQuery.data && !currentConversationId && !conversationQuery.isLoading) {
      initConversation();
    }
  }, [empresaQuery.data, currentConversationId, conversationQuery.isLoading, initConversation]);

  return {
    sessionId,
    empresa: empresaQuery.data,
    empresaLoading: empresaQuery.isLoading,
    empresaError: empresaQuery.error,
    branding,
    isInitializingConversation,
    conversation: conversationQuery.data,
    conversationLoading: conversationQuery.isLoading,
    messages: stableMessages,
    messagesLoading: messagesQuery.isLoading && !messagesQuery.data,
    isTyping,
    isSending,
    isOperatorTyping,
    chatState,
    responseDelayMs,
    sendMessage,
    startClientTyping,
    stopClientTyping,
  };
}
