import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * IMPORTANT: Typing indicators should NOT auto-disappear by timeout.
 * They should only disappear when:
 * 1. The user explicitly stops typing (stopTyping called)
 * 2. A message is actually sent and rendered
 * 
 * The timeout here is only for BROADCASTING refresh - not for hiding the indicator.
 * This prevents the indicator from flickering or disappearing before a message appears.
 */
const TYPING_BROADCAST_INTERVAL_MS = 2000; // Re-broadcast typing state every 2s while still typing

interface TypingUser {
  id: string;
  type: 'operator' | 'client';
  name?: string;
  lastSeen: number;
}

interface UseTypingPresenceOptions {
  conversationId: string;
  userId?: string;
  userType: 'operator' | 'client';
  userName?: string;
}

export function useTypingPresence({
  conversationId,
  userId,
  userType,
  userName,
}: UseTypingPresenceOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const isTypingRef = useRef<boolean>(false);
  const broadcastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up stale typing users (only if they haven't broadcast in 5s)
  // This is a safety mechanism, not the primary way to hide indicators
  const cleanupStaleUsers = useCallback(() => {
    const now = Date.now();
    setTypingUsers((prev) => 
      prev.filter((u) => now - u.lastSeen < 5000)
    );
  }, []);

  // Set up realtime channel for typing presence
  useEffect(() => {
    if (!conversationId) return;

    const channelName = `typing:${conversationId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId: remoteUserId, userType: remoteUserType, userName: remoteUserName, isTyping } = payload.payload;

        // Don't show our own typing
        if (remoteUserId === userId) return;

        if (isTyping) {
          // Add or update typing user with fresh lastSeen timestamp
          setTypingUsers((prev) => {
            const existingIndex = prev.findIndex((u) => u.id === remoteUserId);
            if (existingIndex >= 0) {
              // Update lastSeen
              const updated = [...prev];
              updated[existingIndex] = { ...updated[existingIndex], lastSeen: Date.now() };
              return updated;
            }
            return [...prev, { 
              id: remoteUserId, 
              type: remoteUserType, 
              name: remoteUserName,
              lastSeen: Date.now(),
            }];
          });
        } else {
          // Immediately clear typing state when stop message received
          setTypingUsers((prev) => prev.filter((u) => u.id !== remoteUserId));
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Periodic cleanup of stale typing states (safety net)
    const cleanupInterval = setInterval(cleanupStaleUsers, 5000);

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      clearInterval(cleanupInterval);
    };
  }, [conversationId, userId, cleanupStaleUsers]);

  // Broadcast typing state
  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !userId) return;

      const now = Date.now();
      // Debounce typing broadcasts to max once per 500ms
      if (isTyping && now - lastBroadcastRef.current < 500) return;
      lastBroadcastRef.current = now;

      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId,
          userType,
          userName,
          isTyping,
        },
      });
    },
    [userId, userType, userName]
  );

  // Start typing - call when user starts typing
  // Sets up interval to re-broadcast while typing continues
  const startTyping = useCallback(() => {
    if (isTypingRef.current) return; // Already typing
    
    isTypingRef.current = true;
    broadcastTyping(true);

    // Set up interval to keep broadcasting while typing
    if (broadcastIntervalRef.current) {
      clearInterval(broadcastIntervalRef.current);
    }
    
    broadcastIntervalRef.current = setInterval(() => {
      if (isTypingRef.current) {
        broadcastTyping(true);
      }
    }, TYPING_BROADCAST_INTERVAL_MS);
  }, [broadcastTyping]);

  // Stop typing - MUST be called when:
  // 1. User sends a message
  // 2. User clears the input
  // 3. Component unmounts
  const stopTyping = useCallback(() => {
    if (!isTypingRef.current) return; // Not typing
    
    isTypingRef.current = false;
    
    if (broadcastIntervalRef.current) {
      clearInterval(broadcastIntervalRef.current);
      broadcastIntervalRef.current = null;
    }
    
    broadcastTyping(false);
  }, [broadcastTyping]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (broadcastIntervalRef.current) {
        clearInterval(broadcastIntervalRef.current);
      }
      // Broadcast stop on unmount
      if (isTypingRef.current && channelRef.current && userId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId, userType, userName, isTyping: false },
        });
      }
    };
  }, [userId, userType, userName]);

  // Check if specific user types are typing
  const isOperatorTyping = typingUsers.some((u) => u.type === 'operator');
  const isClientTyping = typingUsers.some((u) => u.type === 'client');

  return {
    typingUsers,
    isOperatorTyping,
    isClientTyping,
    startTyping,
    stopTyping,
  };
}
