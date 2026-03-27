export type ConversationChannel = 'chat' | 'whatsapp' | 'voice';
export type ConversationStatus = 'ai_active' | 'waiting_human' | 'human_active' | 'completed' | 'closed';
export type ConversationOwner = 'ai' | 'human';
export type MessageSenderType = 'client' | 'ai' | 'human' | 'system';

export interface Conversation {
  id: string;
  empresa_id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  owner: ConversationOwner;
  assigned_user_id: string | null;
  client_identifier: string;
  client_name: string | null;
  customer_id?: string | null;
  created_at: string;
  last_message_at: string;
  // Lifecycle fields
  closure_reason?: string | null;
  closure_note?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  summary?: string | null;
  main_intent?: string | null;
  result?: string | null;
  next_action?: string | null;
  // State machine fields
  conversation_state?: 'idle' | 'collecting_service' | 'collecting_data' | 'awaiting_confirmation' | 'booking_processing' | 'booking_active' | 'rescheduling' | 'awaiting_slot_selection' | string;
  conversation_context?: Record<string, unknown>;
  // Joined data
  empresa_nome?: string;
  assigned_user_nome?: string;
  unread_count?: number;
  last_message?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: MessageSenderType;
  sender_user_id: string | null;
  content: string;
  is_internal: boolean;
  created_at: string;
  // Joined data
  sender_nome?: string;
}

export interface ConversationFilters {
  status?: ConversationStatus | 'all';
  channel?: ConversationChannel | 'all';
  owner?: ConversationOwner | 'all';
  empresaId?: string;
  search?: string;
}
