import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Send, Bot, User, ArrowLeftRight, X, Eye, Sparkles, PanelRightClose, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import { ConversationChannelBadge } from './ConversationChannelBadge';
import { ConversationOwnerBadge } from './ConversationOwnerBadge';
import { MessageBubble } from './MessageBubble';
import { SystemEventMessage } from './SystemEventMessage';
import { ConversationSummaryCard } from './ConversationSummaryCard';
import { CloseConversationDialog, type ClosureReason } from './CloseConversationDialog';
import { OperatorAssistantPanel } from './OperatorAssistantPanel';
import { TypingIndicator } from './TypingIndicator';
import { ConversationDebugTimeline } from './ConversationDebugTimeline';

import { useConversation, useMessages, useAssumeConversation, useReturnToAI, useSendMessage } from '@/hooks/useConversations';
import { useCloseConversationWithSummary } from '@/hooks/useCloseConversation';
import { useCreateLead, useLeadByConversation } from '@/hooks/useLeads';
import { useInsertSystemMessage } from '@/hooks/useSystemMessages';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

interface ConversationViewProps {
  conversationId: string;
  onClose?: () => void;
}

export function ConversationView({ conversationId, onClose }: ConversationViewProps) {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { data: conversation, isLoading: conversationLoading } = useConversation(conversationId);
  const { data: messages, isLoading: messagesLoading } = useMessages(conversationId);
  
  const assumeConversation = useAssumeConversation();
  const returnToAI = useReturnToAI();
  const closeConversation = useCloseConversationWithSummary();
  const sendMessage = useSendMessage();
  const createLead = useCreateLead();
  const { data: existingLead } = useLeadByConversation(isAdmin ? conversationId : undefined);
  const insertSystemMessage = useInsertSystemMessage();

  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('messages');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Typing presence for human-to-client indicator
  const { isClientTyping, startTyping, stopTyping } = useTypingPresence({
    conversationId,
    userId: user?.id,
    userType: 'operator',
    userName: user?.email?.split('@')[0],
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isClientTyping]);

  // Auto-open assistant when conversation becomes human_active (desktop only)
  useEffect(() => {
    if (!isMobile && conversation?.status === 'human_active' && conversation?.assigned_user_id === user?.id) {
      setIsAssistantOpen(true);
    } else if (!isMobile) {
      setIsAssistantOpen(false);
    }
  }, [conversation?.status, conversation?.assigned_user_id, user?.id, isMobile]);

  const isAssignedToMe = conversation?.assigned_user_id === user?.id;
  const canRespond = conversation?.status === 'human_active' && isAssignedToMe;
  const canAssume = conversation?.status !== 'closed' && conversation?.status !== 'human_active';
  const canReturn = conversation?.status === 'human_active' && isAssignedToMe;
  const canClose = conversation?.status !== 'closed';
  const showAssistant = conversation?.status === 'human_active' && isAssignedToMe;
  const isClosed = conversation?.status === 'closed';
  const showDebugTimeline = isAdmin;

  const getContextValue = (key: string): string | null => {
    const context = conversation?.conversation_context;
    if (!context || typeof context !== 'object') return null;
    const value = (context as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  };

  const hasConfirmedBooking = (): boolean => {
    const context = conversation?.conversation_context;
    if (!context || typeof context !== 'object') return false;

    const contextRecord = context as Record<string, unknown>;
    const confirmedSnapshot = contextRecord.confirmed_snapshot;
    const hasConfirmedSnapshot = !!confirmedSnapshot && typeof confirmedSnapshot === 'object';

    return (
      !!getContextValue('agendamento_id') ||
      hasConfirmedSnapshot
    );
  };

  const handleSend = () => {
    if (!newMessage.trim() || !canRespond) return;
    stopTyping();
    sendMessage.mutate({
      conversationId,
      content: newMessage.trim(),
      isInternal,
    });
    setNewMessage('');
    setIsInternal(false);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (canRespond && !isInternal && e.target.value.trim()) {
      startTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectReply = (reply: string) => {
    setNewMessage(reply);
    setIsInternal(false);
  };

  const handleAssume = () => {
    assumeConversation.mutate(conversationId, {
      onSuccess: () => {
        insertSystemMessage.mutate({ conversationId, eventType: 'assume' });
      },
    });
  };

  const handleReturnToAI = () => {
    returnToAI.mutate(conversationId, {
      onSuccess: () => {
        insertSystemMessage.mutate({ conversationId, eventType: 'return_ai' });
      },
    });
  };

  const handleCloseConversation = (reason: ClosureReason, note?: string) => {
    closeConversation.mutate(
      { conversationId, closureReason: reason, closureNote: note },
      { onSuccess: () => setIsCloseDialogOpen(false) }
    );
  };

  const handleAssistantAction = (action: string) => {
    if (action.toLowerCase().includes('devolver') || action.toLowerCase().includes('ia')) {
      handleReturnToAI();
    } else if (action.toLowerCase().includes('encerrar') || action.toLowerCase().includes('fechar')) {
      setIsCloseDialogOpen(true);
    }
  };

  const handleCreateLead = () => {
    if (!conversation || existingLead) return;

    const intent = conversation.main_intent ?? getContextValue('current_intent');
    createLead.mutate({
      empresa_id: conversation.empresa_id,
      conversation_id: conversation.id,
      name: getContextValue('customer_name') ?? conversation.client_name,
      email: getContextValue('customer_email'),
      phone: getContextValue('customer_phone'),
      source: conversation.channel === 'voice' ? 'voice' : 'chat',
      notes: intent ? `Intent: ${intent}` : null,
      status: hasConfirmedBooking() ? 'qualified' : 'new',
    });
  };

  if (conversationLoading) {
    return (
      <div className="flex flex-col h-full p-4">
        <Skeleton className="h-12 mb-4" />
        <Skeleton className="flex-1" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Conversa não encontrada
      </div>
    );
  }

  const messagesPanel = (
    <>
      {/* Messages */}
      <ScrollArea className="flex-1 p-4 min-h-0" ref={scrollRef}>
        {messagesLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-3/4" />
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              message.sender_type === 'system' ? (
                <SystemEventMessage key={message.id} message={message} />
              ) : (
                <MessageBubble key={message.id} message={message} />
              )
            ))}
            <TypingIndicator
              className="pl-2"
              typingSource="client"
              visible={isClientTyping}
              ariaLabel="Utilizador a escrever"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Nenhuma mensagem ainda
          </div>
        )}
      </ScrollArea>

      {/* Mobile AI Assistant - collapsible section */}
      {isMobile && showAssistant && (
        <Collapsible open={mobileAssistantOpen} onOpenChange={setMobileAssistantOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 border-t bg-muted/30 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Assistente IA
              </span>
              {mobileAssistantOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-[40vh] overflow-y-auto">
              <OperatorAssistantPanel
                conversationId={conversationId}
                isOpen={true}
                onSelectReply={handleSelectReply}
                onAction={handleAssistantAction}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Input */}
      {!isClosed && (
        <div className="p-3 sm:p-4 border-t flex-shrink-0">
          {!canRespond ? (
            <div className="text-center py-3 px-4 rounded-lg bg-muted text-muted-foreground text-sm">
              {conversation.status === 'ai_active' && (
                <span className="flex items-center justify-center gap-2">
                  <Bot className="w-4 h-4" />
                  A IA estÃ¡ a responder. Assuma a conversa para responder.
                </span>
              )}
              {conversation.status === 'waiting_human' && (
                <span>Aguardando humano. Clique em "Assumir" para responder.</span>
              )}
              {conversation.status === 'human_active' && !isAssignedToMe && (
                <span>Conversa atendida por outro operador.</span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="internal-mode"
                  checked={isInternal}
                  onCheckedChange={setIsInternal}
                />
                <Label htmlFor="internal-mode" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Nota interna (nÃ£o visÃ­vel ao cliente)</span>
                  <span className="sm:hidden">Nota interna</span>
                </Label>
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder={isInternal ? "Nota interna..." : "Mensagem..."}
                  value={newMessage}
                  onChange={handleMessageChange}
                  onKeyDown={handleKeyDown}
                  className="min-h-[60px] sm:min-h-[80px] resize-none flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendMessage.isPending}
                  className="self-end"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Closed state message */}
      {isClosed && (
        <div className="p-4 border-t text-center text-muted-foreground text-sm flex-shrink-0">
          Esta conversa foi encerrada e estÃ¡ em modo de leitura.
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Main conversation area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold truncate text-sm sm:text-base">
                {conversation.client_name 
                  ? conversation.client_name 
                  : `Visitante · ${conversation.client_identifier.slice(-4)}`}
              </h2>
              {onClose && (
                <Button variant="ghost" size="icon" className="h-6 w-6 lg:hidden flex-shrink-0" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <ConversationStatusBadge status={conversation.status} size="sm" />
              <ConversationChannelBadge channel={conversation.channel} size="sm" />
              <ConversationOwnerBadge owner={conversation.owner} size="sm" />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Criada em {format(new Date(conversation.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
              </span>
            </div>
          </div>
          
          {/* Assistant toggle button - desktop only */}
          {showAssistant && !isMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isAssistantOpen ? "secondary" : "outline"}
                  size="icon"
                  className="ml-2 flex-shrink-0"
                  onClick={() => setIsAssistantOpen(!isAssistantOpen)}
                >
                  {isAssistantOpen ? (
                    <PanelRightClose className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isAssistantOpen ? 'Fechar assistente' : 'Abrir assistente IA'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Actions */}
        {!isClosed && (
          <div className="flex items-center gap-2 p-3 border-b bg-muted/30 flex-shrink-0 flex-wrap">
            {isAdmin && (
              existingLead ? (
                <Badge variant="secondary" className="h-9 px-3">
                  Lead criado
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateLead}
                  disabled={createLead.isPending}
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Criar lead
                </Button>
              )
            )}
            {canAssume && (
              <Button
                size="sm"
                onClick={handleAssume}
                disabled={assumeConversation.isPending}
              >
                <User className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">Assumir Conversa</span>
                <span className="sm:hidden">Assumir</span>
              </Button>
            )}
            {canReturn && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleReturnToAI}
                disabled={returnToAI.isPending}
              >
                <ArrowLeftRight className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">Devolver à IA</span>
                <span className="sm:hidden">IA</span>
              </Button>
            )}
            {canClose && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setIsCloseDialogOpen(true)}
                disabled={closeConversation.isPending}
              >
                <X className="w-4 h-4 mr-1.5" />
                Encerrar
              </Button>
            )}
          </div>
        )}

        {/* Summary Card for closed conversations */}
        {isClosed && conversation.summary && (
          <div className="p-4 border-b flex-shrink-0">
            <ConversationSummaryCard conversation={conversation} />
          </div>
        )}

        {showDebugTimeline ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 min-h-0 flex-col">
            <div className="border-b px-3 pt-3">
              <TabsList>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="debug">Debug Timeline</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="messages" className="mt-0 flex flex-1 min-h-0 flex-col">
              {messagesPanel}
            </TabsContent>
            <TabsContent value="debug" className="mt-0 flex-1 min-h-0">
              <ConversationDebugTimeline conversationId={conversationId} enabled={activeTab === 'debug'} />
            </TabsContent>
          </Tabs>
        ) : (
          <>
        {/* Messages */}
        <ScrollArea className="flex-1 p-4 min-h-0" ref={scrollRef}>
          {messagesLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-3/4" />
              ))}
            </div>
          ) : messages && messages.length > 0 ? (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                message.sender_type === 'system' ? (
                  <SystemEventMessage key={message.id} message={message} />
                ) : (
                  <MessageBubble key={message.id} message={message} />
                )
              ))}
              <TypingIndicator 
                className="pl-2" 
                typingSource="client"
                visible={isClientTyping}
                ariaLabel="Utilizador a escrever"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Nenhuma mensagem ainda
            </div>
          )}
        </ScrollArea>

        {/* Mobile AI Assistant - collapsible section */}
        {isMobile && showAssistant && (
          <Collapsible open={mobileAssistantOpen} onOpenChange={setMobileAssistantOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-3 border-t bg-muted/30 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Assistente IA
                </span>
                {mobileAssistantOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-[40vh] overflow-y-auto">
                <OperatorAssistantPanel
                  conversationId={conversationId}
                  isOpen={true}
                  onSelectReply={handleSelectReply}
                  onAction={handleAssistantAction}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Input */}
        {!isClosed && (
          <div className="p-3 sm:p-4 border-t flex-shrink-0">
            {!canRespond ? (
              <div className="text-center py-3 px-4 rounded-lg bg-muted text-muted-foreground text-sm">
                {conversation.status === 'ai_active' && (
                  <span className="flex items-center justify-center gap-2">
                    <Bot className="w-4 h-4" />
                    A IA está a responder. Assuma a conversa para responder.
                  </span>
                )}
                {conversation.status === 'waiting_human' && (
                  <span>Aguardando humano. Clique em "Assumir" para responder.</span>
                )}
                {conversation.status === 'human_active' && !isAssignedToMe && (
                  <span>Conversa atendida por outro operador.</span>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="internal-mode"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label htmlFor="internal-mode" className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">Nota interna (não visível ao cliente)</span>
                    <span className="sm:hidden">Nota interna</span>
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder={isInternal ? "Nota interna..." : "Mensagem..."}
                    value={newMessage}
                    onChange={handleMessageChange}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] sm:min-h-[80px] resize-none flex-1"
                  />
                  <Button 
                    onClick={handleSend} 
                    disabled={!newMessage.trim() || sendMessage.isPending}
                    className="self-end"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Closed state message */}
        {isClosed && (
          <div className="p-4 border-t text-center text-muted-foreground text-sm flex-shrink-0">
            Esta conversa foi encerrada e está em modo de leitura.
          </div>
        )}
          </>
        )}
      </div>

      {/* AI Assistant Panel - desktop only, side panel */}
      {!isMobile && showAssistant && (
        <OperatorAssistantPanel
          conversationId={conversationId}
          isOpen={isAssistantOpen}
          onSelectReply={handleSelectReply}
          onAction={handleAssistantAction}
        />
      )}

      {/* Close Conversation Dialog */}
      <CloseConversationDialog
        open={isCloseDialogOpen}
        onOpenChange={setIsCloseDialogOpen}
        onConfirm={handleCloseConversation}
        isLoading={closeConversation.isPending}
      />
    </div>
  );
}
